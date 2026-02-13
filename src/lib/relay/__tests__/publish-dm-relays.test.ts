import { describe, it, expect, vi } from 'vitest';
import { generateSecretKey } from 'nostr-tools/pure';
import { nip19 } from 'nostr-tools';
import { NsecSigner } from '@/lib/signer/nsec-signer';
import { publishDMRelayList } from '../publish-dm-relays';

function makeSigner() {
  const sk = generateSecretKey();
  const nsec = nip19.nsecEncode(sk);
  return new NsecSigner(nsec);
}

function makePool() {
  return {
    publish: vi.fn(() => [Promise.resolve('ok')]),
  } as any;
}

describe('publishDMRelayList', () => {
  it('creates and publishes a kind 10050 event', async () => {
    const signer = makeSigner();
    const pool = makePool();
    const relays = ['wss://relay1.example.com', 'wss://relay2.example.com'];
    const broadcastRelays = ['wss://purplepag.es'];

    await publishDMRelayList(signer, pool, relays, broadcastRelays);

    expect(pool.publish).toHaveBeenCalledTimes(1);
    const [publishedRelays, event] = pool.publish.mock.calls[0]!;

    // Should publish to both DM relays and broadcast relays (deduplicated)
    expect(publishedRelays).toContain('wss://relay1.example.com');
    expect(publishedRelays).toContain('wss://relay2.example.com');
    expect(publishedRelays).toContain('wss://purplepag.es');

    // Event structure
    expect(event.kind).toBe(10050);
    expect(event.tags).toEqual([
      ['relay', 'wss://relay1.example.com'],
      ['relay', 'wss://relay2.example.com'],
    ]);
    expect(event.content).toBe('');

    // Signed correctly
    const pubkey = await signer.getPublicKey();
    expect(event.pubkey).toBe(pubkey);
    expect(event.sig).toBeDefined();
  });

  it('normalizes relay URLs', async () => {
    const signer = makeSigner();
    const pool = makePool();

    await publishDMRelayList(signer, pool, ['WSS://Relay.Example.Com/'], []);

    const [, event] = pool.publish.mock.calls[0]!;
    expect(event.tags).toEqual([['relay', 'wss://relay.example.com']]);
  });

  it('deduplicates publish targets', async () => {
    const signer = makeSigner();
    const pool = makePool();
    const relays = ['wss://relay1.example.com'];
    const broadcastRelays = ['wss://relay1.example.com', 'wss://relay2.example.com'];

    await publishDMRelayList(signer, pool, relays, broadcastRelays);

    const [publishedRelays] = pool.publish.mock.calls[0]!;
    // relay1 appears in both lists but should only appear once in publish targets
    const relay1Count = publishedRelays.filter((r: string) => r === 'wss://relay1.example.com').length;
    expect(relay1Count).toBe(1);
    expect(publishedRelays).toHaveLength(2);
  });

  it('throws if relays array is empty', async () => {
    const signer = makeSigner();
    const pool = makePool();

    await expect(
      publishDMRelayList(signer, pool, [], ['wss://purplepag.es']),
    ).rejects.toThrow('At least one DM relay is required');
  });
});
