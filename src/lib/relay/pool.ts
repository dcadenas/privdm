import { SimplePool } from 'nostr-tools/pool';
import type { NIP44Signer } from '@/lib/signer/types';

let pool: SimplePool | null = null;
let currentSigner: NIP44Signer | null = null;

export function getPool(): SimplePool {
  if (!pool) {
    pool = new SimplePool();
    pool.automaticallyAuth = () => {
      if (!currentSigner) return null;
      const signer = currentSigner;
      return (event) => signer.signEvent(event);
    };
  }
  return pool;
}

export function setPoolAuth(signer: NIP44Signer): void {
  currentSigner = signer;
}

export function clearPoolAuth(): void {
  currentSigner = null;
}

export function destroyPool(): void {
  if (pool) {
    pool.close([]);
    pool = null;
  }
  currentSigner = null;
}
