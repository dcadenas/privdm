import { useQuery } from '@tanstack/react-query';
import { useRelayPool } from '@/hooks/use-relay-pool';
import { DEFAULT_METADATA_RELAYS } from '@/lib/relay/defaults';
import { QUERY_KEYS } from '@/lib/relay/query-keys';

export function useContacts(pubkey: string | null) {
  const pool = useRelayPool();

  return useQuery({
    queryKey: QUERY_KEYS.contacts(pubkey ?? ''),
    queryFn: async () => {
      const event = await pool.get(DEFAULT_METADATA_RELAYS, {
        kinds: [3],
        authors: [pubkey!],
      });
      if (!event) return new Set<string>();
      return new Set<string>(
        event.tags
          .filter((t): t is [string, string, ...string[]] => t[0] === 'p' && !!t[1])
          .map((t) => t[1]),
      );
    },
    enabled: !!pubkey,
    staleTime: 60 * 60_000,
  });
}
