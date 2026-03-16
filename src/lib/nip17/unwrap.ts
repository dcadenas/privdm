import { verifyEvent, type VerifiedEvent } from 'nostr-tools/pure';
import type { NostrSigner } from 'divine-signer';
import { getConversationId } from './conversation';
import type { Rumor, UnwrappedMessage } from './types';

export async function unwrapGiftWrap(
  signer: NostrSigner,
  giftWrap: VerifiedEvent,
): Promise<UnwrappedMessage> {
  // Step 1: Decrypt the gift wrap to get the seal
  const sealJson = await signer.nip44Decrypt(giftWrap.pubkey, giftWrap.content);
  const seal = JSON.parse(sealJson) as VerifiedEvent;

  // Step 2: Verify the seal's signature
  if (!verifyEvent(seal)) {
    throw new Error('Seal signature verification failed');
  }

  // Step 3: Decrypt the seal to get the rumor
  const rumorJson = await signer.nip44Decrypt(seal.pubkey, seal.content);
  const rumor = JSON.parse(rumorJson) as Rumor;

  // Step 4: Anti-impersonation — seal pubkey is the authenticated identity.
  // The rumor is unsigned (deniability), so if a buggy client puts the wrong
  // pubkey in the rumor, trust the seal's signed pubkey instead of rejecting.
  if (seal.pubkey !== rumor.pubkey) {
    console.warn('[unwrap] seal/rumor pubkey mismatch, using seal pubkey as authoritative sender');
    rumor.pubkey = seal.pubkey;
  }

  // Step 5: Reject non-DM rumors (must be kind 14 per NIP-17)
  if (rumor.kind !== 14) {
    console.warn('[unwrap] rejecting non-DM rumor:', {
      kind: rumor.kind,
      id: rumor.id,
      pubkey: rumor.pubkey.slice(0, 16),
      content: rumor.content.slice(0, 100),
      tags: rumor.tags,
    });
    throw new Error(`Expected kind 14 DM rumor, got kind ${rumor.kind}`);
  }

  return {
    rumor,
    senderPubkey: rumor.pubkey,
    conversationId: getConversationId(rumor),
  };
}
