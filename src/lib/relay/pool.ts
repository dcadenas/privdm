import { SimplePool } from 'nostr-tools/pool';
import type { NostrSigner } from 'divine-signer';

let pool: SimplePool | null = null;
let currentSigner: NostrSigner | null = null;

export function getPool(): SimplePool {
  if (!pool) {
    pool = new SimplePool({ enableReconnect: true, enablePing: true });
    pool.automaticallyAuth = () => {
      if (!currentSigner) return null;
      const signer = currentSigner;
      return (event) => signer.signEvent(event);
    };
  }
  return pool;
}

export function setPoolAuth(signer: NostrSigner): void {
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
