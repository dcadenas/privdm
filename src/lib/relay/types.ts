import type { Rumor, ConversationId } from '../nip17/types';

export interface DecryptedMessage {
  id: string;
  conversationId: ConversationId;
  senderPubkey: string;
  content: string;
  createdAt: number;
  rumor: Rumor;
  wrapId: string;
}

export interface Conversation {
  id: ConversationId;
  participants: string[];
  lastMessage: DecryptedMessage;
  /** Number of messages in this conversation. */
  messageCount: number;
}

export interface DMRelayList {
  pubkey: string;
  relays: string[];
  createdAt: number;
}
