import { useQuery } from '@tanstack/react-query';
import { useRelayPool } from './use-relay-pool';
import { DEFAULT_METADATA_RELAYS } from '@/lib/relay/defaults';
import { QUERY_KEYS } from '@/lib/relay/query-keys';
import { profileStore } from '@/lib/storage/singleton';

export interface NostrProfile {
  name?: string;
  displayName?: string;
  picture?: string;
  about?: string;
  nip05?: string;
}

export function useProfile(pubkey: string | null) {
  const pool = useRelayPool();

  return useQuery<NostrProfile | null>({
    queryKey: QUERY_KEYS.profile(pubkey ?? ''),
    queryFn: async () => {
      const event = await pool.get(DEFAULT_METADATA_RELAYS, {
        kinds: [0],
        authors: [pubkey!],
      });

      if (!event) return null;

      try {
        const profile = JSON.parse(event.content) as NostrProfile;
        profileStore.save(pubkey!, profile, event.created_at);
        return profile;
      } catch {
        return null;
      }
    },
    enabled: !!pubkey,
    staleTime: 60 * 60_000, // 1 hour — profiles change infrequently
  });
}
