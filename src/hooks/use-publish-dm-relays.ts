import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/auth-context';
import { useRelayPool } from './use-relay-pool';
import { publishDMRelayList } from '@/lib/relay/publish-dm-relays';
import { DEFAULT_METADATA_RELAYS } from '@/lib/relay/defaults';
import { QUERY_KEYS } from '@/lib/relay/query-keys';

export function usePublishDMRelays() {
  const { signer, pubkey } = useAuth();
  const pool = useRelayPool();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (relays: string[]) => {
      if (!signer) throw new Error('Not authenticated');
      await publishDMRelayList(signer, pool, relays, DEFAULT_METADATA_RELAYS);
    },
    onSuccess: () => {
      if (pubkey) {
        void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dmRelays(pubkey) });
      }
    },
  });
}
