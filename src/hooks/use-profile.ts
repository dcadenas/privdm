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
  banner?: string;
  website?: string;
}

const STRING_FIELDS = ['name', 'picture', 'about', 'nip05', 'banner', 'website'] as const;

export function parseProfile(raw: Record<string, unknown>): NostrProfile {
  const profile: NostrProfile = {};
  for (const key of STRING_FIELDS) {
    if (typeof raw[key] === 'string') {
      profile[key] = raw[key] as string;
    }
  }
  // Normalize display_name → displayName (display_name is the canonical JSON field)
  const dn = raw['display_name'] ?? raw['displayName'];
  if (typeof dn === 'string') {
    profile.displayName = dn;
  }
  return profile;
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
        const raw = JSON.parse(event.content) as Record<string, unknown>;
        const profile = parseProfile(raw);
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
