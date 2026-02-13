import type { NIP44Signer } from '@/lib/signer/types';
import { KeycastHttpSigner } from '@/lib/signer/keycast-http-signer';
import { ExtensionSigner } from '@/lib/signer/extension-signer';
import { BunkerNIP44Signer } from '@/lib/signer/bunker-signer';
import { nip19 } from 'nostr-tools';
import type { StoredSession } from './session-storage';

export async function restoreSession(session: StoredSession): Promise<NIP44Signer> {
  switch (session.type) {
    case 'keycast':
      return new KeycastHttpSigner(session.accessToken);
    case 'extension':
      return new ExtensionSigner();
    case 'bunker':
      return BunkerNIP44Signer.fromBunkerUrl(session.bunkerUrl);
    case 'nostrconnect': {
      const { type, data } = nip19.decode(session.clientNsec);
      if (type !== 'nsec') throw new Error('Invalid client nsec');
      return BunkerNIP44Signer.reconnect(data, session.bunkerUrl);
    }
  }
}
