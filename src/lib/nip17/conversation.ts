import type { Rumor, ConversationId } from './types';

/** Derives a conversation identity from a rumor's pubkey + all p-tag pubkeys. */
export function getConversationId(rumor: Rumor): ConversationId {
  const pubkeys = new Set<string>();
  pubkeys.add(rumor.pubkey);

  for (const tag of rumor.tags) {
    if (tag[0] === 'p' && tag[1]) {
      pubkeys.add(tag[1]);
    }
  }

  return [...pubkeys].sort().join('+');
}
