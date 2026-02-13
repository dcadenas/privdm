import type { SimplePool } from 'nostr-tools/pool';
import type { NIP44Signer } from '@/lib/signer/types';
import { normalizeRelayUrl } from './dm-relays';

export async function publishDMRelayList(
  signer: NIP44Signer,
  pool: SimplePool,
  relays: string[],
  broadcastRelays: string[],
): Promise<void> {
  if (relays.length === 0) {
    throw new Error('At least one DM relay is required');
  }

  const normalized = relays.map(normalizeRelayUrl);

  const event = await signer.signEvent({
    kind: 10050,
    content: '',
    tags: normalized.map((url) => ['relay', url]),
    created_at: Math.floor(Date.now() / 1000),
  });

  // Publish to DM relays + broadcast relays, deduplicated
  const allTargets = [...new Set([...normalized, ...broadcastRelays.map(normalizeRelayUrl)])];
  await Promise.any(pool.publish(allTargets, event));
}
