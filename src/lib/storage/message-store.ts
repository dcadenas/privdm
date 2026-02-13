import type { DecryptedMessage, Conversation } from '../relay/types';

export interface BackfillStatus {
  complete: boolean;
  completedAt: number | null;
}

export interface MessageStore {
  saveMessage(message: DecryptedMessage, wrapCreatedAt: number): Promise<boolean>;
  loadConversations(): Promise<Conversation[]>;
  loadMessages(conversationId: string): Promise<DecryptedMessage[]>;
  getWrapIds(): Promise<Set<string>>;
  getSinceTimestamp(): Promise<number | undefined>;
  getBackfillStatus(): Promise<BackfillStatus>;
  setBackfillComplete(): Promise<void>;
  clear(): Promise<void>;
}
