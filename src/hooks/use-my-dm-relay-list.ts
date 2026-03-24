import { useQuery } from '@tanstack/react-query';
import { useRelayPool } from './use-relay-pool';
import { useAuth } from '@/context/auth-context';
import { DEFAULT_DM_RELAYS } from '@/lib/relay/defaults';
import { dmRelaysQueryOptions } from './use-dm-relays';

export interface MyDMRelayListResult {
  relays: string[];
  isPublished: boolean;
  isLoading: boolean;
}

export function useMyDMRelayList(): MyDMRelayListResult {
  const { pubkey } = useAuth();
  const pool = useRelayPool();

  const { data, isLoading } = useQuery(dmRelaysQueryOptions(pool, pubkey));

  return {
    relays: data?.relays ?? DEFAULT_DM_RELAYS,
    isPublished: data != null,
    isLoading,
  };
}
