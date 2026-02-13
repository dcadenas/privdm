import type { SimplePool } from 'nostr-tools/pool';
import type { Event } from 'nostr-tools/pure';
import type { DMRelayList } from './types';
import { DEFAULT_METADATA_RELAYS } from './defaults';

export function normalizeRelayUrl(url: string): string {
  let normalized = url.toLowerCase().trim();
  if (normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

export function parseDMRelayList(event: Event): DMRelayList {
  const relays: string[] = [];

  for (const tag of event.tags) {
    if (tag[0] === 'relay' && tag[1]) {
      relays.push(normalizeRelayUrl(tag[1]));
    }
  }

  return {
    pubkey: event.pubkey,
    relays,
    createdAt: event.created_at,
  };
}

export async function fetchDMRelays(
  pool: SimplePool,
  pubkey: string,
  lookupRelays: string[] = DEFAULT_METADATA_RELAYS,
): Promise<DMRelayList | null> {
  const event = await pool.get(lookupRelays, {
    kinds: [10050],
    authors: [pubkey],
  });

  if (!event) return null;
  return parseDMRelayList(event);
}
