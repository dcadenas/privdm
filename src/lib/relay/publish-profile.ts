import type { SimplePool } from 'nostr-tools/pool';
import type { NIP44Signer } from '@/lib/signer/types';

export interface RawProfile {
  rawJson: Record<string, unknown>;
  createdAt: number;
}

export async function fetchRawProfile(
  pool: SimplePool,
  pubkey: string,
  relays: string[],
): Promise<RawProfile | null> {
  const event = await pool.get(relays, {
    kinds: [0],
    authors: [pubkey],
  });

  if (!event) return null;

  try {
    const rawJson = JSON.parse(event.content) as Record<string, unknown>;
    return { rawJson, createdAt: event.created_at };
  } catch {
    return null;
  }
}

/** Fields from NostrProfile that can be updated. Empty string = delete. */
export interface ProfileUpdate {
  name?: string;
  displayName?: string;
  picture?: string;
  about?: string;
  nip05?: string;
  banner?: string;
  website?: string;
}

// Maps our interface field names to their JSON wire names
const FIELD_TO_JSON: Record<string, string> = {
  displayName: 'display_name',
};

export async function publishProfile(
  signer: NIP44Signer,
  pool: SimplePool,
  update: ProfileUpdate,
  existingRaw: Record<string, unknown> | null,
  broadcastRelays: string[],
): Promise<void> {
  const merged: Record<string, unknown> = { ...(existingRaw ?? {}) };

  for (const [key, value] of Object.entries(update)) {
    if (value === undefined) continue;
    const jsonKey = FIELD_TO_JSON[key] ?? key;
    if (value === '') {
      delete merged[jsonKey];
    } else {
      merged[jsonKey] = value;
    }
  }

  const event = await signer.signEvent({
    kind: 0,
    content: JSON.stringify(merged),
    tags: [],
    created_at: Math.floor(Date.now() / 1000),
  });

  await Promise.any(pool.publish(broadcastRelays, event));
}
