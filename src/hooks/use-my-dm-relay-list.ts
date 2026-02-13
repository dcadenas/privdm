import { useQuery } from '@tanstack/react-query';
import { useRelayPool } from './use-relay-pool';
import { useAuth } from '@/context/auth-context';
import { fetchDMRelays } from '@/lib/relay/dm-relays';
import { DEFAULT_DM_RELAYS } from '@/lib/relay/defaults';
import { QUERY_KEYS } from '@/lib/relay/query-keys';
import type { DMRelayList } from '@/lib/relay/types';

export interface MyDMRelayListResult {
  relays: string[];
  isPublished: boolean;
  isLoading: boolean;
}

export function useMyDMRelayList(): MyDMRelayListResult {
  const { pubkey } = useAuth();
  const pool = useRelayPool();

  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEYS.dmRelays(pubkey ?? ''),
    queryFn: async (): Promise<DMRelayList | null> => {
      return fetchDMRelays(pool, pubkey!);
    },
    enabled: !!pubkey,
    staleTime: 5 * 60_000,
  });

  return {
    relays: data?.relays ?? DEFAULT_DM_RELAYS,
    isPublished: data != null,
    isLoading,
  };
}
