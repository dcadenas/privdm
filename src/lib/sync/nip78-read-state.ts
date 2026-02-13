import type { EventTemplate } from 'nostr-tools/pure';
import type { Filter } from 'nostr-tools/filter';
import type { NIP44Signer } from '@/lib/signer/types';
import type { ReadStateMap } from '@/lib/storage/read-state-store';

const D_TAG = 'privdm/read-state';
const KIND_APP_DATA = 30078;

export async function encryptReadState(
  signer: NIP44Signer,
  myPubkey: string,
  readState: ReadStateMap,
): Promise<string> {
  const json = JSON.stringify(readState);
  return signer.nip44Encrypt(myPubkey, json);
}

export async function decryptReadState(
  signer: NIP44Signer,
  myPubkey: string,
  ciphertext: string,
): Promise<ReadStateMap> {
  const json = await signer.nip44Decrypt(myPubkey, ciphertext);
  return JSON.parse(json) as ReadStateMap;
}

export function createReadStateEventTemplate(ciphertext: string): EventTemplate {
  return {
    kind: KIND_APP_DATA,
    created_at: Math.floor(Date.now() / 1000),
    tags: [['d', D_TAG]],
    content: ciphertext,
  };
}

export function readStateFilter(pubkey: string): Filter {
  return {
    kinds: [KIND_APP_DATA],
    authors: [pubkey],
    '#d': [D_TAG],
  };
}
