import { createContext, useContext } from 'react';
import type { SimplePool } from 'nostr-tools/pool';
import { getPool } from '@/lib/relay/pool';

export const RelayPoolContext = createContext<SimplePool>(getPool());

export function useRelayPool(): SimplePool {
  return useContext(RelayPoolContext);
}
