import type { UnsignedEvent } from 'nostr-tools/pure';

/** A rumor is an unsigned event with an id but no signature (for deniability). */
export type Rumor = UnsignedEvent & { id: string };

export interface Recipient {
  pubkey: string;
  relayHint?: string;
}

export interface ReplyTo {
  eventId: string;
  relayHint?: string;
}

export interface CreateRumorOptions {
  replyTo?: ReplyTo;
  subject?: string;
}

export interface UnwrappedMessage {
  rumor: Rumor;
  senderPubkey: string;
  conversationId: string;
}

export type ConversationId = string;
