import type { ConversationId } from '../nip17/types';

export const QUERY_KEYS = {
  conversations: ['conversations'] as const,
  messages: (conversationId: ConversationId) => ['messages', conversationId] as const,
  dmRelays: (pubkey: string) => ['dmRelays', pubkey] as const,
  profile: (pubkey: string) => ['profile', pubkey] as const,
  readState: ['readState'] as const,
  event: (id: string) => ['event', id] as const,
  handlers: (kind: number) => ['handlers', kind] as const,
  contacts: (pubkey: string) => ['contacts', pubkey] as const,
};
