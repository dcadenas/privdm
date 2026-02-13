import { describe, it, expect } from 'vitest';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { nip19 } from 'nostr-tools';
import { shortNpub, toNpub, resolveIdentity } from '../nostr-identity';
import type { NostrProfile } from '@/hooks/use-profile';

const sk = generateSecretKey();
const pubkey = getPublicKey(sk);
const npub = nip19.npubEncode(pubkey);

describe('toNpub', () => {
  it('encodes hex pubkey to npub', () => {
    expect(toNpub(pubkey)).toBe(npub);
  });
});

describe('shortNpub', () => {
  it('returns truncated npub with ellipsis', () => {
    const short = shortNpub(pubkey);
    expect(short).toMatch(/^npub1.{8}\.{3}.{4}$/);
  });

  it('starts with npub prefix chars and ends with last 4 chars of npub', () => {
    const short = shortNpub(pubkey);
    expect(short.startsWith(npub.slice(0, 13))).toBe(true);
    expect(short.endsWith(npub.slice(-4))).toBe(true);
  });

  it('has fixed length of 20 characters', () => {
    expect(shortNpub(pubkey)).toHaveLength(20);
  });
});

describe('resolveIdentity', () => {
  const profile = (overrides: Partial<NostrProfile> = {}): NostrProfile => ({
    ...overrides,
  });

  it('uses displayName as primary and nip05 as secondary when both exist', () => {
    const result = resolveIdentity(profile({ displayName: 'Alice', nip05: 'alice@example.com' }), pubkey);
    expect(result.primary).toBe('Alice');
    expect(result.secondary).toBe('alice@example.com');
    expect(result.primaryIsMono).toBe(false);
    expect(result.secondaryIsMono).toBe(false);
  });

  it('uses name as primary when displayName is absent', () => {
    const result = resolveIdentity(profile({ name: 'alice', nip05: 'alice@example.com' }), pubkey);
    expect(result.primary).toBe('alice');
    expect(result.secondary).toBe('alice@example.com');
  });

  it('prefers displayName over name', () => {
    const result = resolveIdentity(profile({ displayName: 'Alice', name: 'alice' }), pubkey);
    expect(result.primary).toBe('Alice');
  });

  it('uses displayName + shortNpub when nip05 is absent', () => {
    const result = resolveIdentity(profile({ displayName: 'Alice' }), pubkey);
    expect(result.primary).toBe('Alice');
    expect(result.secondary).toBe(shortNpub(pubkey));
    expect(result.primaryIsMono).toBe(false);
    expect(result.secondaryIsMono).toBe(true);
  });

  it('uses nip05 as primary + shortNpub when no name/displayName', () => {
    const result = resolveIdentity(profile({ nip05: 'alice@example.com' }), pubkey);
    expect(result.primary).toBe('alice@example.com');
    expect(result.secondary).toBe(shortNpub(pubkey));
    expect(result.primaryIsMono).toBe(false);
    expect(result.secondaryIsMono).toBe(true);
  });

  it('uses shortNpub as primary with no secondary when profile is empty', () => {
    const result = resolveIdentity(profile(), pubkey);
    expect(result.primary).toBe(shortNpub(pubkey));
    expect(result.secondary).toBeNull();
    expect(result.primaryIsMono).toBe(true);
  });

  it('uses shortNpub when profile is null', () => {
    const result = resolveIdentity(null, pubkey);
    expect(result.primary).toBe(shortNpub(pubkey));
    expect(result.secondary).toBeNull();
    expect(result.primaryIsMono).toBe(true);
  });

  it('treats empty-string name as absent', () => {
    const result = resolveIdentity(profile({ name: '' }), pubkey);
    expect(result.primary).toBe(shortNpub(pubkey));
    expect(result.primaryIsMono).toBe(true);
  });

  it('treats whitespace-only displayName as absent', () => {
    const result = resolveIdentity(profile({ displayName: '   ' }), pubkey);
    expect(result.primary).toBe(shortNpub(pubkey));
  });
});
