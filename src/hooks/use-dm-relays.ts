import { useQuery } from '@tanstack/react-query';
import { useRelayPool } from './use-relay-pool';
import { useAuth } from '@/context/auth-context';
import { fetchDMRelays } from '@/lib/relay/dm-relays';
import { DEFAULT_DM_RELAYS } from '@/lib/relay/defaults';
import { QUERY_KEYS } from '@/lib/relay/query-keys';
import type { DMRelayList } from '@/lib/relay/types';

export function useDMRelays(pubkey: string | null) {
  const pool = useRelayPool();

  return useQuery({
    queryKey: QUERY_KEYS.dmRelays(pubkey ?? ''),
    queryFn: async (): Promise<DMRelayList | null> => {
      return fetchDMRelays(pool, pubkey!);
    },
    select: (data): string[] => data?.relays ?? DEFAULT_DM_RELAYS,
    enabled: !!pubkey,
    staleTime: 5 * 60_000,
  });
}

export function useMyDMRelays() {
  const { pubkey } = useAuth();
  return useDMRelays(pubkey);
}
