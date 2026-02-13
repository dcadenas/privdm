import { verifyEvent, type VerifiedEvent } from 'nostr-tools/pure';
import type { NIP44Signer } from '../signer/types';
import { getConversationId } from './conversation';
import type { Rumor, UnwrappedMessage } from './types';

export async function unwrapGiftWrap(
  signer: NIP44Signer,
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

  // Step 4: Anti-impersonation check — seal author must match rumor author
  if (seal.pubkey !== rumor.pubkey) {
    throw new Error(
      `Anti-impersonation check failed: seal.pubkey (${seal.pubkey}) !== rumor.pubkey (${rumor.pubkey})`,
    );
  }

  return {
    rumor,
    senderPubkey: rumor.pubkey,
    conversationId: getConversationId(rumor),
  };
}
