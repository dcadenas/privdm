import { useEffect, useRef, useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/auth-context';
import { useRelayPool } from './use-relay-pool';
import { useMyDMRelays } from './use-dm-relays';
import { GiftWrapSubscriptionManager } from '@/lib/relay/subscription-manager';
import { backfillGiftWraps } from '@/lib/relay/backfill';
import { messageStore, readStateStore, profileStore } from '@/lib/storage/singleton';
import { QUERY_KEYS } from '@/lib/relay/query-keys';
import type { Conversation } from '@/lib/relay/types';
import type { ReadStateMap } from '@/lib/storage/read-state-store';
import { useConnectionStatus, type ConnectionStatus } from './use-connection-status';

export function useGiftWrapSubscription(): ConnectionStatus {
  const { signer, pubkey } = useAuth();
  const pool = useRelayPool();
  const { data: dmRelays } = useMyDMRelays();
  const queryClient = useQueryClient();
  const managerRef = useRef<GiftWrapSubscriptionManager | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const handleReconnect = useCallback(() => {
    managerRef.current?.restart();
  }, []);

  const connectionStatus = useConnectionStatus(handleReconnect);

  // Hydrate TanStack Query cache from IndexedDB on login
  useEffect(() => {
    if (!pubkey) {
      setHydrated(false);
      return;
    }

    let cancelled = false;

    async function hydrate() {
      const [conversations, readStateMap, profiles] = await Promise.all([
        messageStore.loadConversations(),
        readStateStore.getAll(),
        profileStore.getAll(),
      ]);
      if (cancelled) return;

      if (Object.keys(readStateMap).length > 0) {
        queryClient.setQueryData(QUERY_KEYS.readState, readStateMap);
      }

      for (const stored of profiles) {
        const { pubkey, createdAt: _, ...profile } = stored;
        queryClient.setQueryData(QUERY_KEYS.profile(pubkey), profile);
      }

      if (conversations.length > 0) {
        queryClient.setQueryData(QUERY_KEYS.conversations, conversations);

        await Promise.all(
          conversations.map(async (conv) => {
            const messages = await messageStore.loadMessages(conv.id);
            if (!cancelled) {
              queryClient.setQueryData(QUERY_KEYS.messages(conv.id), messages);
            }
          }),
        );
      }

      if (!cancelled) setHydrated(true);
    }

    hydrate();
    return () => { cancelled = true; };
  }, [pubkey, queryClient]);

  // Start subscription and backfill after hydration
  useEffect(() => {
    if (!signer || !pubkey || !dmRelays || dmRelays.length === 0 || !hydrated) return;

    const manager = new GiftWrapSubscriptionManager();
    managerRef.current = manager;
    const abortController = new AbortController();

    async function startWithStore() {
      const wrapIds = await messageStore.getWrapIds();
      // NIP-17 randomizes wrap timestamps up to 2 days in the past.
      // Use 3-day window (2d randomization + 1d safety margin).
      // Backfill handles everything older.
      const THREE_DAYS = 3 * 24 * 60 * 60;
      const since = Math.floor(Date.now() / 1000) - THREE_DAYS;

      manager.seedProcessedWrapIds(wrapIds);
      manager.start({
        pool,
        userPubkey: pubkey!,
        dmRelays: dmRelays!,
        signer: signer!,
        queryClient,
        store: messageStore,
        since,
      });

      // Run backfill in background
      const status = await messageStore.getBackfillStatus();
      const ONE_DAY = 24 * 60 * 60;
      const now = Math.floor(Date.now() / 1000);

      if (status.complete && status.completedAt !== null && now - status.completedAt <= ONE_DAY) {
        return;
      }

      const result = await backfillGiftWraps({
        pool,
        userPubkey: pubkey!,
        dmRelays: dmRelays!,
        signer: signer!,
        queryClient,
        store: messageStore,
        processedWrapIds: wrapIds,
        signal: abortController.signal,
      });

      if (result.complete && !abortController.signal.aborted) {
        await messageStore.setBackfillComplete();

        // Auto-mark backfilled conversations as read — historical messages
        // shouldn't show as unread. Only live subscription messages should.
        const convs = queryClient.getQueryData<Conversation[]>(QUERY_KEYS.conversations) ?? [];
        const readState = queryClient.getQueryData<ReadStateMap>(QUERY_KEYS.readState) ?? {};
        for (const conv of convs) {
          if (readState[conv.id] === undefined) {
            queryClient.setQueryData<ReadStateMap>(QUERY_KEYS.readState, (prev = {}) => ({
              ...prev,
              [conv.id]: conv.lastMessage.createdAt,
            }));
            void readStateStore.markRead(conv.id, conv.lastMessage.createdAt);
          }
        }
      }
    }

    startWithStore();

    return () => {
      abortController.abort();
      manager.stop();
      managerRef.current = null;
    };
  }, [signer, pubkey, dmRelays, pool, queryClient, hydrated]);

  return connectionStatus;
}
