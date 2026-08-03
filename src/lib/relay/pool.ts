import { SimplePool } from 'nostr-tools/pool';
import type { NostrSigner } from 'divine-signer';

let pool: SimplePool | null = null;
let currentSigner: NostrSigner | null = null;

export function getPool(): SimplePool {
  if (!pool) {
    pool = new SimplePool({ enableReconnect: true, enablePing: true });
    // PrivDM keeps a live gift-wrap subscription open indefinitely.
    // nostr-tools otherwise closes idle relay sockets after 20 seconds.
    pool.idleTimeout = 0;
    pool.automaticallyAuth = () => {
      if (!currentSigner) return null;
      const signer = currentSigner;
      return async (event) => {
        try {
          return await signer.signEvent(event);
        } catch (err) {
          // A relay re-challenges on reconnect. If signing the challenge fails
          // the relay silently stops serving us, so make that visible.
          console.warn('[pool] relay AUTH signing failed, relay will stop serving', {
            error: err instanceof Error ? err.message : String(err),
          });
          throw err;
        }
      };
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
