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
const RECONNECT_MAX_ATTEMPTS = 10;
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
    this.restarting = true;
    this.sub?.close();
    this.sub = null;
    this.queue = [];
    this.stopped = false;
    if (this.restartTimer) { clearTimeout(this.restartTimer); this.restartTimer = null; }
    this.restarting = false;

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

          if (this.reconnectAttempts >= RECONNECT_MAX_ATTEMPTS) {
            console.error('[subscription] max reconnect attempts reached, giving up');
            return;
          }

          // Exponential backoff: 5s, 10s, 20s, 40s, 60s, 60s, ...
          const backoff = Math.min(
            RECONNECT_BASE_DELAY * Math.pow(2, this.reconnectAttempts),
            RECONNECT_MAX_DELAY,
          );
          this.reconnectAttempts++;
          console.log(`[subscription] scheduling restart in ${backoff}ms (attempt ${this.reconnectAttempts}/${RECONNECT_MAX_ATTEMPTS})`);
          this.restartTimer = setTimeout(() => this.reconnectRestart(false), backoff);
        },
      } as never,
    );
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

    const THREE_DAYS = 3 * 24 * 60 * 60;
    const since = this.lastEventTimestamp > 0
      ? this.lastEventTimestamp - RECONNECT_OVERLAP
      : Math.floor(Date.now() / 1000) - THREE_DAYS;
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
