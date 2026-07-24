import { describe, it, expect, vi } from 'vitest';
import { generateSecretKey } from 'nostr-tools/pure';
import { nip19 } from 'nostr-tools';
import { NsecSigner } from 'divine-signer';
import { fetchRawProfile, publishProfile } from '../publish-profile';

function makeSigner() {
  const sk = generateSecretKey();
  const nsec = nip19.nsecEncode(sk);
  return new NsecSigner(nsec);
}

function makePool(event: unknown = null) {
  return {
    get: vi.fn().mockResolvedValue(event),
    publish: vi.fn(() => [Promise.resolve('ok')]),
  };
}

function firstPublishCall(pool: ReturnType<typeof makePool>): [string[], {
  kind: number;
  content: string;
  pubkey?: string;
  sig?: string;
}] {
  const call = pool.publish.mock.calls[0];
  if (!call) throw new Error('publish was not called');
  return call as unknown as [string[], {
    kind: number;
    content: string;
    pubkey?: string;
    sig?: string;
  }];
}

describe('fetchRawProfile', () => {
  it('returns parsed JSON and createdAt when event exists', async () => {
    const raw = { name: 'alice', lud16: 'alice@getalby.com' };
    const pool = makePool({
      kind: 0,
      content: JSON.stringify(raw),
      created_at: 1700000000,
    });

    const result = await fetchRawProfile(pool as never, 'aabbcc', ['wss://relay.test']);

    expect(result).toEqual({ rawJson: raw, createdAt: 1700000000 });
    expect(pool.get).toHaveBeenCalledWith(['wss://relay.test'], {
      kinds: [0],
      authors: ['aabbcc'],
    });
  });

  it('returns null when no event found', async () => {
    const pool = makePool(null);
    const result = await fetchRawProfile(pool as never, 'aabbcc', ['wss://relay.test']);
    expect(result).toBeNull();
  });

  it('returns null for malformed JSON', async () => {
    const pool = makePool({
      kind: 0,
      content: 'not json',
      created_at: 1700000000,
    });
    const result = await fetchRawProfile(pool as never, 'aabbcc', ['wss://relay.test']);
    expect(result).toBeNull();
  });
});

describe('publishProfile', () => {
  it('publishes a kind 0 event with updated fields', async () => {
    const signer = makeSigner();
    const pool = makePool();

    await publishProfile(signer, pool as never, { name: 'bob' }, null, ['wss://relay.test']);

    expect(pool.publish).toHaveBeenCalledTimes(1);
    const [relays, event] = firstPublishCall(pool);

    expect(relays).toContain('wss://relay.test');
    expect(event.kind).toBe(0);

    const content = JSON.parse(event.content);
    expect(content.name).toBe('bob');
  });

  it('merges updates into existing raw JSON, preserving unknown fields', async () => {
    const signer = makeSigner();
    const pool = makePool();
    const existingRaw = {
      name: 'old',
      lud16: 'alice@getalby.com',
      lud06: 'lnurl...',
      custom: 42,
    };

    await publishProfile(
      signer,
      pool as never,
      { name: 'new-name', about: 'hello' },
      existingRaw,
      ['wss://relay.test'],
    );

    const [, event] = firstPublishCall(pool);
    const content = JSON.parse(event.content);

    expect(content.name).toBe('new-name');
    expect(content.about).toBe('hello');
    // Unknown fields preserved
    expect(content.lud16).toBe('alice@getalby.com');
    expect(content.lud06).toBe('lnurl...');
    expect(content.custom).toBe(42);
  });

  it('converts displayName back to display_name in JSON', async () => {
    const signer = makeSigner();
    const pool = makePool();

    await publishProfile(
      signer,
      pool as never,
      { displayName: 'Alice W' },
      null,
      ['wss://relay.test'],
    );

    const [, event] = firstPublishCall(pool);
    const content = JSON.parse(event.content);

    expect(content.display_name).toBe('Alice W');
    expect(content.displayName).toBeUndefined();
  });

  it('removes fields set to empty string', async () => {
    const signer = makeSigner();
    const pool = makePool();
    const existingRaw = { name: 'alice', about: 'old bio', lud16: 'keep' };

    await publishProfile(
      signer,
      pool as never,
      { about: '' },
      existingRaw,
      ['wss://relay.test'],
    );

    const [, event] = firstPublishCall(pool);
    const content = JSON.parse(event.content);

    expect(content.about).toBeUndefined();
    expect(content.name).toBe('alice');
    expect(content.lud16).toBe('keep');
  });

  it('signs with correct pubkey', async () => {
    const signer = makeSigner();
    const pool = makePool();

    await publishProfile(signer, pool as never, { name: 'test' }, null, ['wss://relay.test']);

    const [, event] = firstPublishCall(pool);
    const pubkey = await signer.getPublicKey();
    expect(event.pubkey).toBe(pubkey);
    expect(event.sig).toBeDefined();
  });
});
