import type { PrivdmDatabase } from './database';

export type ReadStateMap = Record<string, number>; // conversationId → lastReadAt

export class DexieReadStateStore {
  constructor(private db: PrivdmDatabase) {}

  async getAll(): Promise<ReadStateMap> {
    const entries = await this.db.readState.toArray();
    const map: ReadStateMap = {};
    for (const entry of entries) {
      map[entry.conversationId] = entry.lastReadAt;
    }
    return map;
  }

  async markRead(conversationId: string, timestamp: number): Promise<void> {
    await this.db.transaction('rw', this.db.readState, async () => {
      const existing = await this.db.readState.get(conversationId);
      if (existing && existing.lastReadAt >= timestamp) return;
      await this.db.readState.put({ conversationId, lastReadAt: timestamp });
    });
  }

  /** Merge remote state with local, taking max(local, remote) per key. Returns merged result. */
  async bulkMerge(remote: ReadStateMap): Promise<ReadStateMap> {
    const local = await this.getAll();
    const merged: ReadStateMap = { ...local };

    const toWrite: { conversationId: string; lastReadAt: number }[] = [];
    for (const [convId, remoteTs] of Object.entries(remote)) {
      const localTs = local[convId] ?? 0;
      const winner = Math.max(localTs, remoteTs);
      merged[convId] = winner;
      if (winner > localTs) {
        toWrite.push({ conversationId: convId, lastReadAt: winner });
      }
    }

    if (toWrite.length > 0) {
      await this.db.readState.bulkPut(toWrite);
    }

    return merged;
  }
}
