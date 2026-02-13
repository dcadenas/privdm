import { useQuery } from '@tanstack/react-query';
import { useRelayPool } from '@/hooks/use-relay-pool';
import { DEFAULT_METADATA_RELAYS } from '@/lib/relay/defaults';
import { QUERY_KEYS } from '@/lib/relay/query-keys';
import { parseHandlerEvent } from '@/lib/nip89/handlers';
import { handlerStore } from '@/lib/storage/singleton';
import type { HandlerInfo } from '@/lib/nip89/types';

export function useHandlers(kind: number | null) {
  const pool = useRelayPool();

  return useQuery({
    queryKey: QUERY_KEYS.handlers(kind ?? 0),
    queryFn: async (): Promise<HandlerInfo[]> => {
      // Load from IndexedDB first for instant display
      const cached = await handlerStore.getByKind(kind!);

      // Fetch fresh from relays in background
      pool.querySync(DEFAULT_METADATA_RELAYS, {
        kinds: [31990],
        '#k': [String(kind!)],
      }).then(events => {
        const fresh = events.map(parseHandlerEvent);
        if (fresh.length > 0) {
          void handlerStore.saveAll(fresh);
        }
      }).catch(() => {
        // Relay fetch failed — cached data still available
      });

      if (cached.length > 0) return cached;

      // No cache — wait for relay response
      const events = await pool.querySync(DEFAULT_METADATA_RELAYS, {
        kinds: [31990],
        '#k': [String(kind!)],
      });
      const handlers = events.map(parseHandlerEvent);
      if (handlers.length > 0) {
        void handlerStore.saveAll(handlers);
      }
      return handlers;
    },
    enabled: kind != null,
    staleTime: 60 * 60_000,
  });
}
