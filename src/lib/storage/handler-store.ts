import type { PrivdmDatabase, StoredHandler } from './database';
import type { HandlerInfo } from '../nip89/types';

export class DexieHandlerStore {
  constructor(private db: PrivdmDatabase) {}

  async getByKind(kind: number): Promise<HandlerInfo[]> {
    const stored = await this.db.handlers
      .where('kinds')
      .equals(kind)
      .toArray();
    return stored.map(toHandlerInfo);
  }

  async saveAll(handlers: HandlerInfo[]): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    await this.db.transaction('rw', this.db.handlers, async () => {
      for (const h of handlers) {
        const id = `${h.pubkey}:${h.dTag}`;
        await this.db.handlers.put({
          id,
          pubkey: h.pubkey,
          dTag: h.dTag,
          name: h.name,
          picture: h.picture,
          about: h.about,
          kinds: h.kinds,
          urls: h.urls,
          fetchedAt: now,
        });
      }
    });
  }
}

function toHandlerInfo(stored: StoredHandler): HandlerInfo {
  return {
    pubkey: stored.pubkey,
    dTag: stored.dTag,
    name: stored.name,
    picture: stored.picture,
    about: stored.about,
    kinds: stored.kinds,
    urls: stored.urls,
  };
}
