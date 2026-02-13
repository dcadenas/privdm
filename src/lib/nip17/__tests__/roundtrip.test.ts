import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { nip19 } from 'nostr-tools';
import { NsecSigner } from '../../signer/nsec-signer';
import { createGiftWraps } from '../giftwrap';
import { unwrapGiftWrap } from '../unwrap';

function makeSigner() {
  const sk = generateSecretKey();
  const nsec = nip19.nsecEncode(sk);
  const pubkey = getPublicKey(sk);
  return { signer: new NsecSigner(nsec), pubkey };
}

describe('NIP-17 roundtrip', () => {
  it('Alice sends to Bob, Bob unwraps and reads the message', async () => {
    const alice = makeSigner();
    const bob = makeSigner();

    const result = await createGiftWraps(
      alice.signer,
      [{ pubkey: bob.pubkey }],
      'Hello Bob!',
    );

    const bobWrap = result.wraps[0]!;
    const unwrapped = await unwrapGiftWrap(bob.signer, bobWrap);

    expect(unwrapped.rumor.content).toBe('Hello Bob!');
    expect(unwrapped.senderPubkey).toBe(alice.pubkey);
    expect(unwrapped.rumor.kind).toBe(14);
  });

  it('Alice reads her own self-wrap', async () => {
    const alice = makeSigner();
    const bob = makeSigner();

    const result = await createGiftWraps(
      alice.signer,
      [{ pubkey: bob.pubkey }],
      'Hello Bob!',
    );

    const unwrapped = await unwrapGiftWrap(alice.signer, result.selfWrap);

    expect(unwrapped.rumor.content).toBe('Hello Bob!');
    expect(unwrapped.senderPubkey).toBe(alice.pubkey);
  });

  it('Alice and Bob derive the same conversation id', async () => {
    const alice = makeSigner();
    const bob = makeSigner();

    const result = await createGiftWraps(
      alice.signer,
      [{ pubkey: bob.pubkey }],
      'Hello!',
    );

    const bobUnwrapped = await unwrapGiftWrap(bob.signer, result.wraps[0]!);
    const aliceUnwrapped = await unwrapGiftWrap(alice.signer, result.selfWrap);

    expect(bobUnwrapped.conversationId).toBe(aliceUnwrapped.conversationId);

    // Verify it's the expected sorted pubkey pair
    const expected = [alice.pubkey, bob.pubkey].sort().join('+');
    expect(bobUnwrapped.conversationId).toBe(expected);
  });

  it('group DM: Alice sends to Bob + Charlie, all three can unwrap', async () => {
    const alice = makeSigner();
    const bob = makeSigner();
    const charlie = makeSigner();

    const result = await createGiftWraps(
      alice.signer,
      [{ pubkey: bob.pubkey }, { pubkey: charlie.pubkey }],
      'Group hello!',
    );

    expect(result.wraps).toHaveLength(2);

    // Bob unwraps
    const bobUnwrapped = await unwrapGiftWrap(bob.signer, result.wraps[0]!);
    expect(bobUnwrapped.rumor.content).toBe('Group hello!');
    expect(bobUnwrapped.senderPubkey).toBe(alice.pubkey);

    // Charlie unwraps
    const charlieUnwrapped = await unwrapGiftWrap(charlie.signer, result.wraps[1]!);
    expect(charlieUnwrapped.rumor.content).toBe('Group hello!');
    expect(charlieUnwrapped.senderPubkey).toBe(alice.pubkey);

    // Alice reads her self-wrap
    const aliceUnwrapped = await unwrapGiftWrap(alice.signer, result.selfWrap);
    expect(aliceUnwrapped.rumor.content).toBe('Group hello!');

    // All three should have the same conversation id
    expect(bobUnwrapped.conversationId).toBe(charlieUnwrapped.conversationId);
    expect(bobUnwrapped.conversationId).toBe(aliceUnwrapped.conversationId);
  });

  it('reply preserves replyTo info', async () => {
    const alice = makeSigner();
    const bob = makeSigner();

    const result = await createGiftWraps(
      alice.signer,
      [{ pubkey: bob.pubkey }],
      'This is a reply',
      { replyTo: { eventId: 'original-event-id' } },
    );

    const unwrapped = await unwrapGiftWrap(bob.signer, result.wraps[0]!);
    const eTag = unwrapped.rumor.tags.find((t) => t[0] === 'e');
    expect(eTag).toEqual(['e', 'original-event-id']);
  });

  it('Bob cannot decrypt a wrap addressed to Charlie', async () => {
    const alice = makeSigner();
    const bob = makeSigner();
    const charlie = makeSigner();

    const result = await createGiftWraps(
      alice.signer,
      [{ pubkey: charlie.pubkey }],
      'For Charlie only',
    );

    // Bob tries to unwrap Charlie's gift wrap — should fail
    await expect(unwrapGiftWrap(bob.signer, result.wraps[0]!)).rejects.toThrow();
  });
});
