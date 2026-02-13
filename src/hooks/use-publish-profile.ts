import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/auth-context';
import { useRelayPool } from './use-relay-pool';
import { useMyDMRelayList } from './use-my-dm-relay-list';
import { fetchRawProfile, publishProfile, type ProfileUpdate } from '@/lib/relay/publish-profile';
import { parseProfile } from './use-profile';
import { DEFAULT_METADATA_RELAYS } from '@/lib/relay/defaults';
import { QUERY_KEYS } from '@/lib/relay/query-keys';
import { profileStore } from '@/lib/storage/singleton';

export function usePublishProfile() {
  const { signer, pubkey } = useAuth();
  const pool = useRelayPool();
  const queryClient = useQueryClient();
  const { relays: myDMRelays } = useMyDMRelayList();

  return useMutation({
    mutationFn: async (update: ProfileUpdate) => {
      if (!signer || !pubkey) throw new Error('Not authenticated');

      // Fresh fetch to get latest raw JSON (preserves unknown fields)
      const existing = await fetchRawProfile(pool, pubkey, DEFAULT_METADATA_RELAYS);

      const broadcastRelays = [...new Set([...DEFAULT_METADATA_RELAYS, ...myDMRelays])];
      await publishProfile(signer, pool, update, existing?.rawJson ?? null, broadcastRelays);

      return { update, existingRaw: existing?.rawJson ?? null };
    },
    onSuccess: ({ update, existingRaw }) => {
      if (!pubkey) return;

      // Build merged profile for cache update
      const merged: Record<string, unknown> = { ...(existingRaw ?? {}) };
      for (const [key, value] of Object.entries(update)) {
        if (value === undefined) continue;
        const jsonKey = key === 'displayName' ? 'display_name' : key;
        if (value === '') {
          delete merged[jsonKey];
        } else {
          merged[jsonKey] = value;
        }
      }

      const profile = parseProfile(merged);
      queryClient.setQueryData(QUERY_KEYS.profile(pubkey), profile);
      void profileStore.save(pubkey, profile, Math.floor(Date.now() / 1000));
    },
  });
}
