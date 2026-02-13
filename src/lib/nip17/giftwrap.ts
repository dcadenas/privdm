import {
  generateSecretKey,
  finalizeEvent,
  type VerifiedEvent,
} from 'nostr-tools/pure';
import * as nip44 from 'nostr-tools/nip44';
import type { NIP44Signer } from '../signer/types';
import { randomPastTimestamp } from './timestamp';
import { createRumor } from './rumor';
import { createSeal } from './seal';
import type { Recipient, CreateRumorOptions } from './types';

/** Wraps a seal for a single recipient using a local ephemeral key. */
export function wrapSeal(seal: VerifiedEvent, recipientPubkey: string): VerifiedEvent {
  const ephemeralKey = generateSecretKey();
  const convKey = nip44.v2.utils.getConversationKey(ephemeralKey, recipientPubkey);
  const encrypted = nip44.v2.encrypt(JSON.stringify(seal), convKey);

  return finalizeEvent(
    {
      kind: 1059,
      content: encrypted,
      created_at: randomPastTimestamp(),
      tags: [['p', recipientPubkey]],
    },
    ephemeralKey,
  );
}

export interface GiftWrapResult {
  wraps: VerifiedEvent[];
  /** The wrap addressed to the sender (for reading sent messages). */
  selfWrap: VerifiedEvent;
}

/** Creates gift wraps for all recipients + one for the sender. */
export async function createGiftWraps(
  signer: NIP44Signer,
  recipients: Recipient[],
  message: string,
  options?: CreateRumorOptions,
): Promise<GiftWrapResult> {
  const senderPubkey = await signer.getPublicKey();
  const rumor = createRumor(senderPubkey, recipients, message, options);

  const wraps: VerifiedEvent[] = [];

  for (const recipient of recipients) {
    const seal = await createSeal(signer, rumor, recipient.pubkey);
    wraps.push(wrapSeal(seal, recipient.pubkey));
  }

  // Self-wrap so sender can read their own sent messages
  const selfSeal = await createSeal(signer, rumor, senderPubkey);
  const selfWrap = wrapSeal(selfSeal, senderPubkey);

  return { wraps, selfWrap };
}
