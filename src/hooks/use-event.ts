import { useQuery } from '@tanstack/react-query';
import { useRelayPool } from '@/hooks/use-relay-pool';
import { DEFAULT_METADATA_RELAYS } from '@/lib/relay/defaults';
import { QUERY_KEYS } from '@/lib/relay/query-keys';

export function useEvent(eventId: string, relayHints?: string[]) {
  const pool = useRelayPool();
  const relays = relayHints?.length ? relayHints : DEFAULT_METADATA_RELAYS;

  return useQuery({
    queryKey: QUERY_KEYS.event(eventId),
    queryFn: () => pool.get(relays, { ids: [eventId] }),
    staleTime: Infinity, // events are immutable
    enabled: !!eventId,
  });
}
