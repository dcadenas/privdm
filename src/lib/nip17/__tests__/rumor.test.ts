import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { createRumor } from '../rumor';

describe('createRumor', () => {
  const sender = getPublicKey(generateSecretKey());
  const recipientA = getPublicKey(generateSecretKey());
  const recipientB = getPublicKey(generateSecretKey());

  it('creates a kind 14 event', () => {
    const rumor = createRumor(sender, [{ pubkey: recipientA }], 'hello');
    expect(rumor.kind).toBe(14);
  });

  it('has no signature (deniability)', () => {
    const rumor = createRumor(sender, [{ pubkey: recipientA }], 'hello');
    expect(rumor).not.toHaveProperty('sig');
  });

  it('has an id', () => {
    const rumor = createRumor(sender, [{ pubkey: recipientA }], 'hello');
    expect(rumor.id).toBeDefined();
    expect(rumor.id.length).toBe(64);
  });

  it('sets sender pubkey', () => {
    const rumor = createRumor(sender, [{ pubkey: recipientA }], 'hello');
    expect(rumor.pubkey).toBe(sender);
  });

  it('includes p-tags for all recipients', () => {
    const rumor = createRumor(
      sender,
      [{ pubkey: recipientA }, { pubkey: recipientB }],
      'group message',
    );
    const pTags = rumor.tags.filter((t) => t[0] === 'p');
    expect(pTags).toHaveLength(2);
    expect(pTags[0]![1]).toBe(recipientA);
    expect(pTags[1]![1]).toBe(recipientB);
  });

  it('includes relay hints in p-tags when provided', () => {
    const rumor = createRumor(
      sender,
      [{ pubkey: recipientA, relayHint: 'wss://relay.example.com' }],
      'hi',
    );
    const pTag = rumor.tags.find((t) => t[0] === 'p');
    expect(pTag).toEqual(['p', recipientA, 'wss://relay.example.com']);
  });

  it('includes reply tag when replyTo is set', () => {
    const rumor = createRumor(sender, [{ pubkey: recipientA }], 'reply', {
      replyTo: { eventId: 'abc123', relayHint: 'wss://r.example.com' },
    });
    const eTag = rumor.tags.find((t) => t[0] === 'e');
    expect(eTag).toEqual(['e', 'abc123', 'wss://r.example.com']);
  });

  it('includes subject tag when provided', () => {
    const rumor = createRumor(sender, [{ pubkey: recipientA }], 'hi', {
      subject: 'Topic',
    });
    const subjectTag = rumor.tags.find((t) => t[0] === 'subject');
    expect(subjectTag).toEqual(['subject', 'Topic']);
  });
});
