import type { VerifiedEvent } from 'nostr-tools/pure';
import type { NostrSigner } from 'divine-signer';
import { randomPastTimestamp } from './timestamp';
import type { Rumor } from './types';

export async function createSeal(
  signer: NostrSigner,
  rumor: Rumor,
  recipientPubkey: string,
): Promise<VerifiedEvent> {
  const encrypted = await signer.nip44Encrypt(recipientPubkey, JSON.stringify(rumor));

  return signer.signEvent({
    kind: 13,
    content: encrypted,
    created_at: randomPastTimestamp(),
    tags: [], // MUST be empty per NIP-17
  });
}
