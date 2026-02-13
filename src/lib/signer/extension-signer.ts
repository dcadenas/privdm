import type { EventTemplate, VerifiedEvent } from 'nostr-tools/pure';
import type { NIP44Signer } from './types';

interface WindowNostrNIP44 {
  encrypt(pubkey: string, plaintext: string): Promise<string>;
  decrypt(pubkey: string, ciphertext: string): Promise<string>;
}

interface WindowNostr {
  getPublicKey(): Promise<string>;
  signEvent(event: EventTemplate): Promise<VerifiedEvent>;
  nip44?: WindowNostrNIP44;
}

declare global {
  interface Window {
    nostr?: WindowNostr;
  }
}

export class ExtensionSigner implements NIP44Signer {
  readonly type = 'extension' as const;
  private readonly nostr: WindowNostr;

  constructor() {
    if (!window.nostr) {
      throw new Error('No NIP-07 extension found (window.nostr is undefined)');
    }
    if (!window.nostr.nip44) {
      throw new Error(
        'Your browser extension does not support NIP-44 encryption, which is required for private messages. ' +
        'Try updating your extension, or use a different one (Soapbox Signer, Alby, or nos2x).',
      );
    }
    this.nostr = window.nostr;
  }

  async getPublicKey(): Promise<string> {
    return this.nostr.getPublicKey();
  }

  async signEvent(event: EventTemplate): Promise<VerifiedEvent> {
    return this.nostr.signEvent(event);
  }

  async nip44Encrypt(pubkey: string, plaintext: string): Promise<string> {
    return this.nostr.nip44!.encrypt(pubkey, plaintext);
  }

  async nip44Decrypt(pubkey: string, ciphertext: string): Promise<string> {
    return this.nostr.nip44!.decrypt(pubkey, ciphertext);
  }
}
