import type { Event, VerifiedEvent } from 'nostr-tools/pure';
import type { Filter } from 'nostr-tools/filter';
import type { SubCloser } from 'nostr-tools/abstract-pool';
import type { SimplePool } from 'nostr-tools/pool';
import type { QueryClient } from '@tanstack/react-query';
import type { NIP44Signer } from '../signer/types';
import type { MessageStore } from '../storage/message-store';
import { unwrapGiftWrap } from '../nip17/unwrap';
import type { DecryptedMessage, Conversation } from './types';
import { QUERY_KEYS } from './query-keys';

export interface StartOptions {
  pool: SimplePool;
  userPubkey: string;
  dmRelays: string[];
  signer: NIP44Signer;
  queryClient: QueryClient;
  store?: MessageStore;
  since?: number;
}

const RATE_LIMIT_RESTART_DELAY = 5_000;
const RECONNECT_DELAY = 3_000;
const RECONNECT_OVERLAP = 30; // seconds of overlap when resubscribing

export class GiftWrapSubscriptionManager {
  private sub: SubCloser | null = null;
  private processedWrapIds = new Set<string>();
  private processing = false;
  private queue: Event[] = [];
  private startOptions: StartOptions | null = null;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private lastEventTimestamp = 0;
  private stopped = false;

  seedProcessedWrapIds(ids: Set<string>): void {
    for (const id of ids) {
      this.processedWrapIds.add(id);
    }
  }

  start(options: StartOptions): void {
    // Close existing sub and clear queue, but keep processedWrapIds
    this.sub?.close();
    this.sub = null;
    this.queue = [];
    this.stopped = false;
    if (this.restartTimer) { clearTimeout(this.restartTimer); this.restartTimer = null; }

    this.startOptions = options;
    const { pool, userPubkey, dmRelays, signer, queryClient, store, since } = options;

    const filter: Filter = { kinds: [1059], '#p': [userPubkey] };
    if (since !== undefined) {
      filter.since = since;
    }

    console.debug('[subscription] starting, since:', since ? new Date(since * 1000).toISOString() : 'none');

    this.sub = pool.subscribeMany(
      dmRelays,
      filter,
      {
        onevent: (event: Event) => {
          this.lastEventTimestamp = Math.max(this.lastEventTimestamp, event.created_at);
          this.queue.push(event);
          void this.processQueue(signer, queryClient, store);
        },
        onclose: (reasons: string[]) => {
          if (this.stopped) return;

          let rateLimited = false;
          for (const reason of reasons) {
            if (reason) {
              console.warn('[subscription] relay closed subscription:', reason);
              if (reason.startsWith('rate-limited:')) rateLimited = true;
            }
          }

          // Auto-restart on any close (persistent subscription loop)
          const delay = rateLimited ? RATE_LIMIT_RESTART_DELAY : RECONNECT_DELAY;
          console.log(`[subscription] closed, restarting in ${delay}ms`);
          this.restartTimer = setTimeout(() => this.restart(), delay);
        },
      } as never,
    );
  }

  restart(): void {
    if (!this.startOptions) return;
    // Use last event timestamp with overlap if available, otherwise fall back to 3-day window
    const THREE_DAYS = 3 * 24 * 60 * 60;
    const since = this.lastEventTimestamp > 0
      ? this.lastEventTimestamp - RECONNECT_OVERLAP
      : Math.floor(Date.now() / 1000) - THREE_DAYS;
    this.start({ ...this.startOptions, since });
  }

  stop(): void {
    this.stopped = true;
    this.sub?.close();
    this.sub = null;
    this.queue = [];
    this.processedWrapIds.clear();
    this.lastEventTimestamp = 0;
    if (this.restartTimer) { clearTimeout(this.restartTimer); this.restartTimer = null; }
  }

  isRunning(): boolean {
    return this.sub !== null;
  }

  get processedCount(): number {
    return this.processedWrapIds.size;
  }

  private async processQueue(
    signer: NIP44Signer,
    queryClient: QueryClient,
    store?: MessageStore,
  ): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    try {
      while (this.queue.length > 0) {
        const event = this.queue.shift()!;

        if (this.processedWrapIds.has(event.id)) continue;
        this.processedWrapIds.add(event.id);

        try {
          // Pool verifies events before delivering them
          const unwrapped = await unwrapGiftWrap(signer, event as VerifiedEvent);
          const message: DecryptedMessage = {
            id: unwrapped.rumor.id,
            conversationId: unwrapped.conversationId,
            senderPubkey: unwrapped.senderPubkey,
            content: unwrapped.rumor.content,
            createdAt: unwrapped.rumor.created_at,
            rumor: unwrapped.rumor,
            wrapId: event.id,
          };

          console.debug('[subscription] message:', {
            rumorId: unwrapped.rumor.id.slice(0, 8),
            sender: unwrapped.senderPubkey,
            conversationId: unwrapped.conversationId,
            pTags: unwrapped.rumor.tags.filter(t => t[0] === 'p').map(t => t[1]),
            rumorPubkey: unwrapped.rumor.pubkey,
          });

          await insertMessage(queryClient, message, store, event.created_at);
        } catch {
          // Skip events we can't decrypt (not addressed to us, corrupted, etc.)
        }
      }
    } finally {
      this.processing = false;
    }
  }

}

export async function insertMessage(
  queryClient: QueryClient,
  message: DecryptedMessage,
  store?: MessageStore,
  wrapCreatedAt?: number,
): Promise<boolean> {
  if (store && wrapCreatedAt !== undefined) {
    const saved = await store.saveMessage(message, wrapCreatedAt);
    if (!saved) return false;
  }

  // Update messages for this conversation
  queryClient.setQueryData<DecryptedMessage[]>(
    QUERY_KEYS.messages(message.conversationId),
    (prev = []) => {
      if (prev.some((m) => m.id === message.id)) return prev;
      return [...prev, message].sort((a, b) => a.createdAt - b.createdAt);
    },
  );

  // Update conversation list
  queryClient.setQueryData<Conversation[]>(
    QUERY_KEYS.conversations,
    (prev = []) => {
      const existing = prev.find((c) => c.id === message.conversationId);

      if (existing) {
        return prev
          .map((c) =>
            c.id === message.conversationId
              ? {
                  ...c,
                  lastMessage:
                    message.createdAt >= c.lastMessage.createdAt ? message : c.lastMessage,
                  messageCount: c.messageCount + 1,
                }
              : c,
          )
          .sort((a, b) => b.lastMessage.createdAt - a.lastMessage.createdAt);
      }

      const participants = message.conversationId.split('+');
      console.debug('[insertMessage] NEW conversation:', {
        conversationId: message.conversationId,
        participants,
        rumorId: message.id.slice(0, 8),
        sender: message.senderPubkey,
        existingConversations: prev.map(c => c.id),
      });
      const newConversation: Conversation = {
        id: message.conversationId,
        participants,
        lastMessage: message,
        messageCount: 1,
      };

      return [newConversation, ...prev].sort(
        (a, b) => b.lastMessage.createdAt - a.lastMessage.createdAt,
      );
    },
  );

  return true;
}
