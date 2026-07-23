import type { Event, VerifiedEvent } from 'nostr-tools/pure';
import type { Filter } from 'nostr-tools/filter';
import type { SubCloser } from 'nostr-tools/abstract-pool';
import type { SimplePool } from 'nostr-tools/pool';
import type { QueryClient } from '@tanstack/react-query';
import type { NostrSigner } from 'divine-signer';
import type { MessageStore } from '../storage/message-store';
import { unwrapGiftWrap } from '../nip17/unwrap';
import type { DecryptedMessage, Conversation } from './types';
import { QUERY_KEYS } from './query-keys';
import { nowSeconds } from '../nip17/timestamp';

export interface StartOptions {
  pool: SimplePool;
  userPubkey: string;
  dmRelays: string[];
  signer: NostrSigner;
  queryClient: QueryClient;
  store?: MessageStore;
  since?: number;
}

const RECONNECT_BASE_DELAY = 5_000;
const RECONNECT_MAX_DELAY = 60_000;
const RECONNECT_REPLAY_WINDOW = 3 * 24 * 60 * 60;
const LIVENESS_CHECK_INTERVAL = 90_000; // 90 seconds
export class GiftWrapSubscriptionManager {
  private sub: SubCloser | null = null;
  private processedWrapIds = new Set<string>();
  private processing = false;
  private queue: Event[] = [];
  private startOptions: StartOptions | null = null;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private livenessTimer: ReturnType<typeof setInterval> | null = null;
  private lastEventReceivedAt = 0;
  private lastEventTimestamp = 0;
  private stopped = false;
  private restarting = false;
  private reconnectAttempts = 0;

  seedProcessedWrapIds(ids: Set<string>): void {
    for (const id of ids) {
      this.processedWrapIds.add(id);
    }
  }

  start(options: StartOptions): void {
    // Close existing sub and clear queue, but keep processedWrapIds.
    // Set restarting flag so the onclose handler doesn't schedule another restart.
    // Keep restarting=true until the new subscription is created to prevent
    // async onclose from the old sub triggering a competing restart.
    this.restarting = true;
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

    this.reconnectAttempts = 0;
    console.log('[subscription] starting', {
      relays: dmRelays,
      since: since ? new Date(since * 1000).toISOString() : 'none',
      processedWrapIds: this.processedWrapIds.size,
    });

    this.sub = pool.subscribeMany(
      dmRelays,
      filter,
      {
        onevent: (event: Event) => {
          if (this.reconnectAttempts > 0) {
            console.log(`[subscription] first event after reconnect, resetting attempts (was ${this.reconnectAttempts})`);
          }
          this.reconnectAttempts = 0;
          this.lastEventReceivedAt = Date.now();
          this.lastEventTimestamp = Math.max(this.lastEventTimestamp, event.created_at);
          this.queue.push(event);
          void this.processQueue(signer, queryClient, store);
        },
        onclose: (reasons: string[]) => {
          console.warn('[subscription] onclose fired', {
            reasons: reasons.filter(Boolean),
            stopped: this.stopped,
            restarting: this.restarting,
            reconnectAttempts: this.reconnectAttempts,
            lastEventTs: this.lastEventTimestamp
              ? new Date(this.lastEventTimestamp * 1000).toISOString()
              : 'none',
          });

          if (this.stopped || this.restarting) return;

          // Exponential backoff: 5s, 10s, 20s, 40s, 60s, 60s, ...
          const backoff = Math.min(
            RECONNECT_BASE_DELAY * Math.pow(2, this.reconnectAttempts),
            RECONNECT_MAX_DELAY,
          );
          this.reconnectAttempts++;
          console.log(`[subscription] scheduling restart in ${backoff}ms (attempt ${this.reconnectAttempts})`);
          this.restartTimer = setTimeout(() => this.reconnectRestart(false), backoff);
        },
      } as never,
    );

    // Safe to clear restarting now — new sub is created, any old onclose
    // that fires will see the new this.sub and our restarting guard handled it.
    this.restarting = false;
    this.lastEventReceivedAt = Date.now();
    if (this.livenessTimer) clearInterval(this.livenessTimer);
    this.livenessTimer = setInterval(() => {
      if (this.stopped) return;
      const elapsed = Date.now() - this.lastEventReceivedAt;
      if (elapsed >= LIVENESS_CHECK_INTERVAL) {
        console.warn(`[subscription] no events for ${Math.round(elapsed / 1000)}s, forcing reconnect`);
        this.reconnectRestart(true);
      }
    }, LIVENESS_CHECK_INTERVAL);
  }

  restart(): void {
    this.reconnectRestart(true);
  }

  private reconnectRestart(resetAttempts: boolean): void {
    if (!this.startOptions) return;
    const savedAttempts = this.reconnectAttempts;
    const { pool, dmRelays } = this.startOptions;

    console.log('[subscription] reconnectRestart', {
      resetAttempts,
      savedAttempts,
      relays: dmRelays,
    });

    // Force-close relay connections so the pool creates fresh WebSockets.
    // After sleep/wake, existing connections are likely dead/zombie.
    pool.close(dmRelays);

    const since = nowSeconds() - RECONNECT_REPLAY_WINDOW;
    this.start({ ...this.startOptions, since });

    // start() resets reconnectAttempts to 0; restore if this is an auto-reconnect
    if (!resetAttempts) {
      this.reconnectAttempts = savedAttempts;
    }
  }

  stop(): void {
    console.log('[subscription] stop called', {
      wasRunning: this.sub !== null,
      queueSize: this.queue.length,
      processedCount: this.processedWrapIds.size,
    });
    this.stopped = true;
    this.sub?.close();
    this.sub = null;
    this.queue = [];
    this.processedWrapIds.clear();
    this.lastEventTimestamp = 0;
    if (this.restartTimer) { clearTimeout(this.restartTimer); this.restartTimer = null; }
    if (this.livenessTimer) { clearInterval(this.livenessTimer); this.livenessTimer = null; }
  }

  isRunning(): boolean {
    return this.sub !== null;
  }

  get processedCount(): number {
    return this.processedWrapIds.size;
  }

  private async processQueue(
    signer: NostrSigner,
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

          console.log('[subscription] message:', {
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

export function insertMessages(
  queryClient: QueryClient,
  messages: DecryptedMessage[],
): void {
  if (messages.length === 0) return;

  // Group by conversation
  const byConversation = new Map<string, DecryptedMessage[]>();
  for (const msg of messages) {
    const group = byConversation.get(msg.conversationId) ?? [];
    group.push(msg);
    byConversation.set(msg.conversationId, group);
  }

  // Batch update messages per conversation, tracking actual insert counts
  const insertedCounts = new Map<string, number>();
  for (const [convId, msgs] of byConversation) {
    queryClient.setQueryData<DecryptedMessage[]>(
      QUERY_KEYS.messages(convId),
      (prev = []) => {
        const existingIds = new Set(prev.map(m => m.id));
        const newMsgs = msgs.filter(m => !existingIds.has(m.id));
        insertedCounts.set(convId, newMsgs.length);
        if (newMsgs.length === 0) return prev;
        return [...prev, ...newMsgs].sort((a, b) => a.createdAt - b.createdAt);
      },
    );
  }

  // Single update for conversation list
  queryClient.setQueryData<Conversation[]>(
    QUERY_KEYS.conversations,
    (prev = []) => {
      let updated = [...prev];
      for (const [convId, msgs] of byConversation) {
        const count = insertedCounts.get(convId) ?? 0;
        if (count === 0) continue;
        const latest = msgs.reduce((a, b) => a.createdAt >= b.createdAt ? a : b);
        const existing = updated.find(c => c.id === convId);

        if (existing) {
          updated = updated.map(c =>
            c.id === convId
              ? {
                  ...c,
                  lastMessage: latest.createdAt >= c.lastMessage.createdAt ? latest : c.lastMessage,
                  messageCount: c.messageCount + count,
                }
              : c,
          );
        } else {
          updated.push({
            id: convId,
            participants: convId.split('+'),
            lastMessage: latest,
            messageCount: count,
          });
        }
      }
      return updated.sort((a, b) => b.lastMessage.createdAt - a.lastMessage.createdAt);
    },
  );
}
