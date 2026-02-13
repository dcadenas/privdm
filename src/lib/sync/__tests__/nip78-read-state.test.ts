import {
  encryptReadState,
  decryptReadState,
  createReadStateEventTemplate,
  readStateFilter,
} from '../nip78-read-state';
import type { NIP44Signer } from '@/lib/signer/types';
import type { ReadStateMap } from '@/lib/storage/read-state-store';

// Simple mock signer that uses base64 as "encryption"
function makeMockSigner(): NIP44Signer {
  return {
    type: 'nsec',
    getPublicKey: async () => 'deadbeef',
    signEvent: vi.fn(),
    nip44Encrypt: async (_pubkey: string, plaintext: string) => btoa(plaintext),
    nip44Decrypt: async (_pubkey: string, ciphertext: string) => atob(ciphertext),
  };
}

describe('nip78-read-state', () => {
  const myPubkey = 'deadbeef';

  describe('encrypt/decrypt round-trip', () => {
    it('round-trips a ReadStateMap', async () => {
      const signer = makeMockSigner();
      const state: ReadStateMap = {
        'alice+bob': 1000,
        'alice+carol': 2000,
      };

      const ciphertext = await encryptReadState(signer, myPubkey, state);
      expect(typeof ciphertext).toBe('string');
      expect(ciphertext).not.toContain('alice');

      const decrypted = await decryptReadState(signer, myPubkey, ciphertext);
      expect(decrypted).toEqual(state);
    });

    it('handles empty state', async () => {
      const signer = makeMockSigner();
      const ciphertext = await encryptReadState(signer, myPubkey, {});
      const decrypted = await decryptReadState(signer, myPubkey, ciphertext);
      expect(decrypted).toEqual({});
    });
  });

  describe('createReadStateEventTemplate', () => {
    it('creates kind 30078 event with d tag', () => {
      const template = createReadStateEventTemplate('encrypted-data');

      expect(template.kind).toBe(30078);
      expect(template.content).toBe('encrypted-data');
      expect(template.tags).toEqual([['d', 'privdm/read-state']]);
      expect(template.created_at).toBeGreaterThan(0);
    });
  });

  describe('readStateFilter', () => {
    it('creates correct filter shape', () => {
      const filter = readStateFilter('abc123');

      expect(filter).toEqual({
        kinds: [30078],
        authors: ['abc123'],
        '#d': ['privdm/read-state'],
      });
    });
  });
});
