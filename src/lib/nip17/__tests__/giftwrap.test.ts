import { generateSecretKey, getPublicKey, verifyEvent } from 'nostr-tools/pure';
import { nip19 } from 'nostr-tools';
import { NsecSigner } from '../../signer/nsec-signer';
import { createSeal } from '../seal';
import { wrapSeal, createGiftWraps } from '../giftwrap';
import { createRumor } from '../rumor';

function makeSigner() {
  const sk = generateSecretKey();
  const nsec = nip19.nsecEncode(sk);
  const pubkey = getPublicKey(sk);
  return { signer: new NsecSigner(nsec), pubkey };
}

describe('createSeal', () => {
  it('creates a kind 13 event with empty tags', async () => {
    const alice = makeSigner();
    const bob = makeSigner();
    const rumor = createRumor(alice.pubkey, [{ pubkey: bob.pubkey }], 'test');

    const seal = await createSeal(alice.signer, rumor, bob.pubkey);

    expect(seal.kind).toBe(13);
    expect(seal.tags).toEqual([]);
    expect(seal.content).toBeDefined();
    expect(seal.content.length).toBeGreaterThan(0);
  });

  it('seal is signed and verifiable', async () => {
    const alice = makeSigner();
    const bob = makeSigner();
    const rumor = createRumor(alice.pubkey, [{ pubkey: bob.pubkey }], 'test');

    const seal = await createSeal(alice.signer, rumor, bob.pubkey);

    expect(seal.sig).toBeDefined();
    expect(verifyEvent(seal)).toBe(true);
  });
});

describe('wrapSeal', () => {
  it('creates a kind 1059 event', async () => {
    const alice = makeSigner();
    const bob = makeSigner();
    const rumor = createRumor(alice.pubkey, [{ pubkey: bob.pubkey }], 'test');
    const seal = await createSeal(alice.signer, rumor, bob.pubkey);

    const wrap = wrapSeal(seal, bob.pubkey);

    expect(wrap.kind).toBe(1059);
    expect(verifyEvent(wrap)).toBe(true);
  });

  it('tags the recipient', async () => {
    const alice = makeSigner();
    const bob = makeSigner();
    const rumor = createRumor(alice.pubkey, [{ pubkey: bob.pubkey }], 'test');
    const seal = await createSeal(alice.signer, rumor, bob.pubkey);

    const wrap = wrapSeal(seal, bob.pubkey);

    expect(wrap.tags).toEqual([['p', bob.pubkey]]);
  });

  it('uses a different ephemeral key each time', async () => {
    const alice = makeSigner();
    const bob = makeSigner();
    const rumor = createRumor(alice.pubkey, [{ pubkey: bob.pubkey }], 'test');
    const seal = await createSeal(alice.signer, rumor, bob.pubkey);

    const wrap1 = wrapSeal(seal, bob.pubkey);
    const wrap2 = wrapSeal(seal, bob.pubkey);

    expect(wrap1.pubkey).not.toBe(wrap2.pubkey);
  });
});

describe('createGiftWraps', () => {
  it('returns N wraps + 1 self-wrap', async () => {
    const alice = makeSigner();
    const bob = makeSigner();
    const charlie = makeSigner();

    const result = await createGiftWraps(
      alice.signer,
      [{ pubkey: bob.pubkey }, { pubkey: charlie.pubkey }],
      'group message',
    );

    expect(result.wraps).toHaveLength(2);
    expect(result.selfWrap).toBeDefined();
    expect(result.selfWrap.kind).toBe(1059);
  });

  it('wraps are tagged to correct recipients', async () => {
    const alice = makeSigner();
    const bob = makeSigner();

    const result = await createGiftWraps(alice.signer, [{ pubkey: bob.pubkey }], 'hello');

    const bobWrap = result.wraps[0]!;
    expect(bobWrap.tags).toEqual([['p', bob.pubkey]]);

    expect(result.selfWrap.tags).toEqual([['p', alice.pubkey]]);
  });
});
