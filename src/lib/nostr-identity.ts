import { nip19 } from 'nostr-tools';
import type { NostrProfile } from '@/hooks/use-profile';

export function toNpub(hexPubkey: string): string {
  return nip19.npubEncode(hexPubkey);
}

export function shortNpub(hexPubkey: string): string {
  const npub = toNpub(hexPubkey);
  return npub.slice(0, 13) + '...' + npub.slice(-4);
}

export interface ResolvedIdentity {
  primary: string;
  secondary: string | null;
  primaryIsMono: boolean;
  secondaryIsMono: boolean;
}

export function resolveIdentity(
  profile: NostrProfile | null | undefined,
  hexPubkey: string,
): ResolvedIdentity {
  const name = profile?.displayName?.trim() || profile?.name?.trim() || null;
  const nip05 = profile?.nip05?.trim() || null;
  const short = shortNpub(hexPubkey);

  if (name && nip05) {
    return { primary: name, secondary: nip05, primaryIsMono: false, secondaryIsMono: false };
  }
  if (name) {
    return { primary: name, secondary: short, primaryIsMono: false, secondaryIsMono: true };
  }
  if (nip05) {
    return { primary: nip05, secondary: short, primaryIsMono: false, secondaryIsMono: true };
  }
  return { primary: short, secondary: null, primaryIsMono: true, secondaryIsMono: false };
}
