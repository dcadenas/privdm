import type { DecryptedMessage, Conversation } from '../relay/types';
import type { BackfillStatus, MessageStore } from './message-store';
import type { PrivdmDatabase, StoredMessage, StoredConversation } from './database';

export class DexieMessageStore implements MessageStore {
  constructor(private db: PrivdmDatabase) {}

  async saveMessage(message: DecryptedMessage, wrapCreatedAt: number): Promise<boolean> {
    const existing = await this.db.messages.get(message.id);
    if (existing) return false;

    const stored: StoredMessage = { ...message, wrapCreatedAt };

    await this.db.transaction('rw', [this.db.messages, this.db.conversations, this.db.syncMeta], async () => {
      await this.db.messages.put(stored);

      const conv = await this.db.conversations.get(message.conversationId);
      if (conv) {
        const updates: Partial<StoredConversation> = {
          messageCount: conv.messageCount + 1,
        };
        if (message.createdAt >= conv.lastMessage.createdAt) {
          updates.lastMessage = stored;
        }
        await this.db.conversations.update(message.conversationId, updates);
      } else {
        const participants = message.conversationId.split('+');
        await this.db.conversations.put({
          id: message.conversationId,
          participants,
          lastMessage: stored,
          messageCount: 1,
        });
      }

      // Track the latest wrap created_at for incremental sync
      const meta = await this.db.syncMeta.get('lastWrapCreatedAt');
      if (!meta || wrapCreatedAt > meta.value) {
        await this.db.syncMeta.put({ key: 'lastWrapCreatedAt', value: wrapCreatedAt });
      }
    });

    return true;
  }

  async loadConversations(): Promise<Conversation[]> {
    const stored = await this.db.conversations.toArray();
    return stored
      .map((c) => ({
        id: c.id,
        participants: c.participants,
        lastMessage: toDecryptedMessage(c.lastMessage),
        messageCount: c.messageCount,
      }))
      .sort((a, b) => b.lastMessage.createdAt - a.lastMessage.createdAt);
  }

  async loadMessages(conversationId: string): Promise<DecryptedMessage[]> {
    const stored = await this.db.messages
      .where('conversationId')
      .equals(conversationId)
      .sortBy('createdAt');
    return stored.map(toDecryptedMessage);
  }

  async getWrapIds(): Promise<Set<string>> {
    const messages = await this.db.messages.toArray();
    return new Set(messages.map((m) => m.wrapId));
  }

  async getSinceTimestamp(): Promise<number | undefined> {
    const meta = await this.db.syncMeta.get('lastWrapCreatedAt');
    if (!meta) return undefined;
    // 2-day NIP-59 randomization window + 1-day safety margin
    const THREE_DAYS = 3 * 24 * 60 * 60;
    return meta.value - THREE_DAYS;
  }

  async getBackfillStatus(): Promise<BackfillStatus> {
    const [complete, completedAt] = await Promise.all([
      this.db.syncMeta.get('backfillComplete'),
      this.db.syncMeta.get('backfillCompletedAt'),
    ]);
    return {
      complete: complete?.value === 1,
      completedAt: completedAt?.value ?? null,
    };
  }

  async setBackfillComplete(): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    await this.db.transaction('rw', this.db.syncMeta, async () => {
      await this.db.syncMeta.put({ key: 'backfillComplete', value: 1 });
      await this.db.syncMeta.put({ key: 'backfillCompletedAt', value: now });
    });
  }

  async clear(): Promise<void> {
    await this.db.delete();
    await this.db.open();
  }
}

function toDecryptedMessage(stored: StoredMessage): DecryptedMessage {
  return {
    id: stored.id,
    conversationId: stored.conversationId,
    senderPubkey: stored.senderPubkey,
    content: stored.content,
    createdAt: stored.createdAt,
    rumor: stored.rumor,
    wrapId: stored.wrapId,
  };
}
