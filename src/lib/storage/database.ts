import Dexie from 'dexie';
import type { Rumor } from '../nip17/types';

export interface StoredMessage {
  id: string;
  conversationId: string;
  senderPubkey: string;
  content: string;
  createdAt: number;
  rumor: Rumor;
  wrapId: string;
  wrapCreatedAt: number;
}

export interface StoredConversation {
  id: string;
  participants: string[];
  lastMessage: StoredMessage;
  messageCount: number;
}

export interface SyncMetaEntry {
  key: string;
  value: number;
}

export interface ReadStateEntry {
  conversationId: string;
  lastReadAt: number;
}

export interface StoredProfile {
  pubkey: string;
  name?: string;
  displayName?: string;
  picture?: string;
  about?: string;
  nip05?: string;
  banner?: string;
  website?: string;
  createdAt: number;
}

export interface StoredHandlerUrl {
  template: string;
  nip19Type?: string;
}

export interface StoredHandler {
  /** Composite key: pubkey+dTag */
  id: string;
  pubkey: string;
  dTag: string;
  name: string;
  picture?: string;
  about?: string;
  kinds: number[];
  urls: StoredHandlerUrl[];
  fetchedAt: number;
}

const DB_NAME = 'privdm';

export class PrivdmDatabase extends Dexie {
  messages!: Dexie.Table<StoredMessage, string>;
  conversations!: Dexie.Table<StoredConversation, string>;
  syncMeta!: Dexie.Table<SyncMetaEntry, string>;
  readState!: Dexie.Table<ReadStateEntry, string>;
  profiles!: Dexie.Table<StoredProfile, string>;
  handlers!: Dexie.Table<StoredHandler, string>;

  constructor() {
    super(DB_NAME);
    this.version(1).stores({
      messages: 'id, conversationId, createdAt, wrapId',
      conversations: 'id',
      syncMeta: 'key',
    });
    this.version(2).stores({
      messages: 'id, conversationId, createdAt, wrapId',
      conversations: 'id',
      syncMeta: 'key',
      readState: 'conversationId',
    });
    this.version(3).stores({
      messages: 'id, conversationId, createdAt, wrapId',
      conversations: 'id',
      syncMeta: 'key',
      readState: 'conversationId',
      profiles: 'pubkey',
    });
    this.version(4).stores({
      messages: 'id, conversationId, createdAt, wrapId',
      conversations: 'id',
      syncMeta: 'key',
      readState: 'conversationId',
      profiles: 'pubkey',
      handlers: 'id, *kinds',
    });
  }
}

export const db = new PrivdmDatabase();
