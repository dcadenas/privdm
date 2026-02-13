import { db } from './database';
import { DexieMessageStore } from './dexie-message-store';
import { DexieReadStateStore } from './read-state-store';
import { DexieProfileStore } from './profile-store';
import { DexieHandlerStore } from './handler-store';

export const messageStore = new DexieMessageStore(db);
export const readStateStore = new DexieReadStateStore(db);
export const profileStore = new DexieProfileStore(db);
export const handlerStore = new DexieHandlerStore(db);
