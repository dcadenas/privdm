import { DexieReadStateStore } from '../read-state-store';
import { PrivdmDatabase } from '../database';

describe('DexieReadStateStore', () => {
  let db: PrivdmDatabase;
  let store: DexieReadStateStore;

  beforeEach(async () => {
    db = new PrivdmDatabase();
    store = new DexieReadStateStore(db);
    await db.delete();
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('returns empty map when no read state exists', async () => {
    expect(await store.getAll()).toEqual({});
  });

  it('marks a conversation as read', async () => {
    await store.markRead('alice+bob', 1000);

    const state = await store.getAll();
    expect(state).toEqual({ 'alice+bob': 1000 });
  });

  it('is monotonic — never goes backward', async () => {
    await store.markRead('alice+bob', 2000);
    await store.markRead('alice+bob', 1000); // older timestamp

    const state = await store.getAll();
    expect(state['alice+bob']).toBe(2000);
  });

  it('advances timestamp forward', async () => {
    await store.markRead('alice+bob', 1000);
    await store.markRead('alice+bob', 3000);

    const state = await store.getAll();
    expect(state['alice+bob']).toBe(3000);
  });

  it('tracks multiple conversations independently', async () => {
    await store.markRead('alice+bob', 1000);
    await store.markRead('alice+carol', 2000);

    const state = await store.getAll();
    expect(state).toEqual({
      'alice+bob': 1000,
      'alice+carol': 2000,
    });
  });

  describe('bulkMerge', () => {
    it('imports remote state when local is empty', async () => {
      const remote = { 'alice+bob': 1000, 'alice+carol': 2000 };
      const merged = await store.bulkMerge(remote);

      expect(merged).toEqual(remote);
      expect(await store.getAll()).toEqual(remote);
    });

    it('keeps local when local > remote', async () => {
      await store.markRead('alice+bob', 3000);
      const merged = await store.bulkMerge({ 'alice+bob': 1000 });

      expect(merged['alice+bob']).toBe(3000);
      expect((await store.getAll())['alice+bob']).toBe(3000);
    });

    it('takes remote when remote > local', async () => {
      await store.markRead('alice+bob', 1000);
      const merged = await store.bulkMerge({ 'alice+bob': 5000 });

      expect(merged['alice+bob']).toBe(5000);
      expect((await store.getAll())['alice+bob']).toBe(5000);
    });

    it('adds new keys from remote without touching existing', async () => {
      await store.markRead('alice+bob', 1000);
      const merged = await store.bulkMerge({ 'alice+carol': 2000 });

      expect(merged).toEqual({
        'alice+bob': 1000,
        'alice+carol': 2000,
      });
    });

    it('handles mixed local-wins and remote-wins', async () => {
      await store.markRead('a+b', 5000);
      await store.markRead('c+d', 1000);

      const merged = await store.bulkMerge({
        'a+b': 2000,  // local wins
        'c+d': 9000,  // remote wins
        'e+f': 3000,  // new key
      });

      expect(merged).toEqual({
        'a+b': 5000,
        'c+d': 9000,
        'e+f': 3000,
      });
    });
  });
});
