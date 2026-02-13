import { DexieProfileStore } from '../profile-store';
import { PrivdmDatabase } from '../database';

describe('DexieProfileStore', () => {
  let store: DexieProfileStore;
  let db: PrivdmDatabase;

  beforeEach(async () => {
    db = new PrivdmDatabase();
    store = new DexieProfileStore(db);
    await db.profiles.clear();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('returns empty array when no profiles saved', async () => {
    const profiles = await store.getAll();
    expect(profiles).toEqual([]);
  });

  it('saves and loads a profile', async () => {
    await store.save('abc123', { name: 'Alice', picture: 'https://example.com/pic.jpg' }, 1000);

    const profiles = await store.getAll();
    expect(profiles).toHaveLength(1);
    expect(profiles[0]!.pubkey).toBe('abc123');
    expect(profiles[0]!.name).toBe('Alice');
    expect(profiles[0]!.picture).toBe('https://example.com/pic.jpg');
    expect(profiles[0]!.createdAt).toBe(1000);
  });

  it('updates profile when newer', async () => {
    await store.save('abc123', { name: 'Alice' }, 1000);
    await store.save('abc123', { name: 'Alice Updated' }, 2000);

    const profiles = await store.getAll();
    expect(profiles).toHaveLength(1);
    expect(profiles[0]!.name).toBe('Alice Updated');
    expect(profiles[0]!.createdAt).toBe(2000);
  });

  it('keeps existing profile when incoming is older', async () => {
    await store.save('abc123', { name: 'Alice New' }, 2000);
    await store.save('abc123', { name: 'Alice Old' }, 1000);

    const profiles = await store.getAll();
    expect(profiles).toHaveLength(1);
    expect(profiles[0]!.name).toBe('Alice New');
    expect(profiles[0]!.createdAt).toBe(2000);
  });

  it('stores multiple profiles', async () => {
    await store.save('pub1', { name: 'Alice' }, 1000);
    await store.save('pub2', { name: 'Bob' }, 2000);

    const profiles = await store.getAll();
    expect(profiles).toHaveLength(2);
    const names = profiles.map((p) => p.name).sort();
    expect(names).toEqual(['Alice', 'Bob']);
  });
});
