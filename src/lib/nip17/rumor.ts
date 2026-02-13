import { getEventHash } from 'nostr-tools/pure';
import { nowSeconds } from './timestamp';
import type { Rumor, Recipient, CreateRumorOptions } from './types';

export function createRumor(
  senderPubkey: string,
  recipients: Recipient[],
  message: string,
  options?: CreateRumorOptions,
): Rumor {
  const tags: string[][] = recipients.map((r) =>
    r.relayHint ? ['p', r.pubkey, r.relayHint] : ['p', r.pubkey],
  );

  if (options?.replyTo) {
    const replyTag = options.replyTo.relayHint
      ? ['e', options.replyTo.eventId, options.replyTo.relayHint]
      : ['e', options.replyTo.eventId];
    tags.push(replyTag);
  }

  if (options?.subject) {
    tags.push(['subject', options.subject]);
  }

  const unsigned = {
    pubkey: senderPubkey,
    created_at: nowSeconds(),
    kind: 14,
    tags,
    content: message,
  };

  const id = getEventHash(unsigned);

  return { ...unsigned, id };
}
