import type { PrivdmDatabase, StoredProfile } from './database';

export class DexieProfileStore {
  constructor(private db: PrivdmDatabase) {}

  async getAll(): Promise<StoredProfile[]> {
    return this.db.profiles.toArray();
  }

  async save(pubkey: string, profile: Omit<StoredProfile, 'pubkey' | 'createdAt'>, createdAt: number): Promise<void> {
    await this.db.transaction('rw', this.db.profiles, async () => {
      const existing = await this.db.profiles.get(pubkey);
      if (existing && existing.createdAt >= createdAt) return;
      await this.db.profiles.put({
        pubkey,
        name: profile.name,
        displayName: profile.displayName,
        picture: profile.picture,
        about: profile.about,
        nip05: profile.nip05,
        createdAt,
      });
    });
  }
}
