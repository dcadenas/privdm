import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/auth-context';
import { useRelayPool } from './use-relay-pool';
import { useReadState } from './use-read-state';
import { readStateStore } from '@/lib/storage/singleton';
import { QUERY_KEYS } from '@/lib/relay/query-keys';
import { DEFAULT_METADATA_RELAYS } from '@/lib/relay/defaults';
import {
  encryptReadState,
  decryptReadState,
  createReadStateEventTemplate,
  readStateFilter,
} from '@/lib/sync/nip78-read-state';
import type { ReadStateMap } from '@/lib/storage/read-state-store';
import type { Event } from 'nostr-tools/pure';

const DEBOUNCE_MS = 30_000;

export function useReadStateSync() {
  const { signer, pubkey } = useAuth();
  const pool = useRelayPool();
  const queryClient = useQueryClient();
  const { readState } = useReadState();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPublishedRef = useRef<string>('');

  const publish = useCallback(async () => {
    if (!signer || !pubkey) return;

    const current = queryClient.getQueryData<ReadStateMap>(QUERY_KEYS.readState) ?? {};
    const serialized = JSON.stringify(current);
    if (serialized === lastPublishedRef.current) return;

    try {
      const ciphertext = await encryptReadState(signer, pubkey, current);
      const template = createReadStateEventTemplate(ciphertext);
      const signed = await signer.signEvent(template);
      await Promise.any(pool.publish(DEFAULT_METADATA_RELAYS, signed));
      lastPublishedRef.current = serialized;
    } catch {
      // Sync is best-effort — local state is authoritative
    }
  }, [signer, pubkey, pool, queryClient]);

  // Fetch remote state on login
  useEffect(() => {
    if (!signer || !pubkey) return;

    let cancelled = false;

    async function fetchRemote() {
      try {
        const filter = readStateFilter(pubkey!);
        const event: Event | null = await pool.get(DEFAULT_METADATA_RELAYS, filter);
        if (cancelled || !event) return;

        const remote = await decryptReadState(signer!, pubkey!, event.content);
        const merged = await readStateStore.bulkMerge(remote);
        if (!cancelled) {
          queryClient.setQueryData<ReadStateMap>(QUERY_KEYS.readState, (local = {}) => {
            // Merge: take max of local and merged for each key
            const result = { ...local };
            for (const [k, v] of Object.entries(merged)) {
              result[k] = Math.max(result[k] ?? 0, v);
            }
            return result;
          });
        }
      } catch {
        // Sync is best-effort
      }
    }

    fetchRemote();
    return () => { cancelled = true; };
  }, [signer, pubkey, pool, queryClient]);

  // Debounced publish on readState changes
  useEffect(() => {
    if (!signer || !pubkey) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void publish();
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [readState, signer, pubkey, publish]);

  // Immediate publish on page blur
  useEffect(() => {
    if (!signer || !pubkey) return;

    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        void publish();
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [signer, pubkey, publish]);
}
