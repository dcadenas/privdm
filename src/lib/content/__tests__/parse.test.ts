import { describe, it, expect } from 'vitest';
import { nip19, generateSecretKey, getPublicKey } from 'nostr-tools';
import { parseContent, shortenUrl, type ContentSegment } from '../parse';

function makeNpub(): { pubkey: string; npub: string } {
  const sk = generateSecretKey();
  const pubkey = getPublicKey(sk);
  const npub = nip19.npubEncode(pubkey);
  return { pubkey, npub };
}

describe('parseContent', () => {
  it('returns empty array for empty string', () => {
    expect(parseContent('')).toEqual([]);
  });

  it('returns single text segment for plain text', () => {
    expect(parseContent('hello world')).toEqual([
      { type: 'text', value: 'hello world' },
    ]);
  });

  it('returns single text segment for whitespace-only', () => {
    expect(parseContent('  \n  ')).toEqual([
      { type: 'text', value: '  \n  ' },
    ]);
  });

  // ─── URLs ─────────────────────────────────────────────────────

  it('parses a URL in text', () => {
    const segments = parseContent('check https://example.com out');
    expect(segments).toEqual([
      { type: 'text', value: 'check ' },
      { type: 'url', value: 'https://example.com' },
      { type: 'text', value: ' out' },
    ]);
  });

  it('strips trailing period from URL', () => {
    const segments = parseContent('Visit https://example.com.');
    expect(segments).toHaveLength(3);
    expect(segments[1]).toEqual({ type: 'url', value: 'https://example.com' });
    expect(segments[2]).toEqual({ type: 'text', value: '.' });
  });

  it('strips trailing comma from URL', () => {
    const segments = parseContent('https://a.com, https://b.com');
    expect(segments[0]).toEqual({ type: 'url', value: 'https://a.com' });
    // Comma stripped from URL becomes text, then space before next URL
    expect(segments[1]).toEqual({ type: 'text', value: ',' });
    expect(segments[2]).toEqual({ type: 'text', value: ' ' });
    expect(segments[3]).toEqual({ type: 'url', value: 'https://b.com' });
  });

  it('preserves balanced parentheses in URLs', () => {
    const segments = parseContent('https://en.wikipedia.org/wiki/Nostr_(protocol)');
    expect(segments[0]).toEqual({
      type: 'url',
      value: 'https://en.wikipedia.org/wiki/Nostr_(protocol)',
    });
  });

  it('strips unbalanced trailing paren from URL', () => {
    const segments = parseContent('(https://example.com)');
    expect(segments[0]).toEqual({ type: 'text', value: '(' });
    expect(segments[1]).toEqual({ type: 'url', value: 'https://example.com' });
    expect(segments[2]).toEqual({ type: 'text', value: ')' });
  });

  // ─── Images ───────────────────────────────────────────────────

  it('parses image URLs', () => {
    const exts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
    for (const ext of exts) {
      const url = `https://img.example.com/photo${ext}`;
      const segments = parseContent(url);
      expect(segments[0]).toEqual({ type: 'image', value: url });
    }
  });

  it('recognizes image URL with query params', () => {
    const url = 'https://img.example.com/photo.jpg?w=800&h=600';
    const segments = parseContent(url);
    expect(segments[0]).toEqual({ type: 'image', value: url });
  });

  // ─── Videos ───────────────────────────────────────────────────

  it('parses video URLs', () => {
    const exts = ['.mp4', '.webm', '.mov'];
    for (const ext of exts) {
      const url = `https://cdn.example.com/clip${ext}`;
      const segments = parseContent(url);
      expect(segments[0]).toEqual({ type: 'video', value: url });
    }
  });

  // ─── YouTube ──────────────────────────────────────────────────

  it('parses youtube.com/watch URL', () => {
    const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    const segments = parseContent(url);
    expect(segments[0]).toEqual({
      type: 'youtube',
      value: url,
      videoId: 'dQw4w9WgXcQ',
    });
  });

  it('parses youtu.be short URL', () => {
    const url = 'https://youtu.be/dQw4w9WgXcQ';
    const segments = parseContent(url);
    expect(segments[0]).toEqual({
      type: 'youtube',
      value: url,
      videoId: 'dQw4w9WgXcQ',
    });
  });

  it('parses youtube.com/shorts URL', () => {
    const url = 'https://youtube.com/shorts/abc123_XY';
    const segments = parseContent(url);
    expect(segments[0]).toEqual({
      type: 'youtube',
      value: url,
      videoId: 'abc123_XY',
    });
  });

  it('parses m.youtube.com URL', () => {
    const url = 'https://m.youtube.com/watch?v=test123';
    const segments = parseContent(url);
    expect(segments[0]).toEqual({
      type: 'youtube',
      value: url,
      videoId: 'test123',
    });
  });

  it('parses youtube embed URL', () => {
    const url = 'https://www.youtube.com/embed/dQw4w9WgXcQ';
    const segments = parseContent(url);
    expect(segments[0]).toEqual({
      type: 'youtube',
      value: url,
      videoId: 'dQw4w9WgXcQ',
    });
  });

  // ─── Nostr entities (nostr: prefix) ───────────────────────────

  it('parses nostr:npub1 mention', () => {
    const { pubkey, npub } = makeNpub();
    const segments = parseContent(`hey nostr:${npub} check this`);
    expect(segments).toEqual([
      { type: 'text', value: 'hey ' },
      { type: 'nostr-profile', value: `nostr:${npub}`, pubkey },
      { type: 'text', value: ' check this' },
    ]);
  });

  it('parses nostr:nprofile1 mention', () => {
    const { pubkey } = makeNpub();
    const nprofile = nip19.nprofileEncode({ pubkey, relays: ['wss://relay.example.com'] });
    const segments = parseContent(`nostr:${nprofile}`);
    expect(segments[0]).toMatchObject({
      type: 'nostr-profile',
      pubkey,
    });
  });

  it('parses nostr:note1 reference', () => {
    const eventId = '0'.repeat(64);
    const note = nip19.noteEncode(eventId);
    const segments = parseContent(`nostr:${note}`);
    expect(segments[0]).toEqual({
      type: 'nostr-event',
      value: `nostr:${note}`,
      bech32: note,
      eventId,
    });
  });

  it('parses nostr:nevent1 reference with relays', () => {
    const eventId = 'a'.repeat(64);
    const nevent = nip19.neventEncode({ id: eventId, relays: ['wss://relay.example.com'] });
    const segments = parseContent(`nostr:${nevent}`);
    expect(segments[0]).toMatchObject({
      type: 'nostr-event',
      bech32: nevent,
      eventId,
      relays: ['wss://relay.example.com'],
    });
  });

  // ─── naddr entities ─────────────────────────────────────────

  it('parses nostr:naddr1 as nostr-address segment', () => {
    const { pubkey } = makeNpub();
    const naddr = nip19.naddrEncode({
      kind: 30023,
      pubkey,
      identifier: 'my-article',
      relays: ['wss://relay.example.com'],
    });
    const segments = parseContent(`nostr:${naddr}`);
    expect(segments[0]).toEqual({
      type: 'nostr-address',
      value: `nostr:${naddr}`,
      bech32: naddr,
      kind: 30023,
      pubkey,
      identifier: 'my-article',
      relays: ['wss://relay.example.com'],
    });
  });

  it('parses naddr without relays', () => {
    const { pubkey } = makeNpub();
    const naddr = nip19.naddrEncode({
      kind: 31990,
      pubkey,
      identifier: 'test',
    });
    const segments = parseContent(`check nostr:${naddr} out`);
    expect(segments).toHaveLength(3);
    expect(segments[1]).toMatchObject({
      type: 'nostr-address',
      kind: 31990,
      pubkey,
      identifier: 'test',
    });
    expect(segments[1]).toHaveProperty('relays', undefined);
  });

  // ─── Bare bech32 references ──────────────────────────────────

  it('parses bare npub1 in text', () => {
    const { pubkey, npub } = makeNpub();
    const segments = parseContent(`dm ${npub} please`);
    expect(segments).toEqual([
      { type: 'text', value: 'dm ' },
      { type: 'nostr-profile', value: npub, pubkey },
      { type: 'text', value: ' please' },
    ]);
  });

  it('parses bare nevent1 in text', () => {
    const eventId = 'b'.repeat(64);
    const nevent = nip19.neventEncode({ id: eventId, relays: ['wss://relay.example.com'] });
    const segments = parseContent(`check this ${nevent}`);
    expect(segments).toHaveLength(2);
    expect(segments[1]).toMatchObject({
      type: 'nostr-event',
      value: nevent,
      bech32: nevent,
      eventId,
      relays: ['wss://relay.example.com'],
    });
  });

  it('parses bare note1 in text', () => {
    const eventId = 'c'.repeat(64);
    const note = nip19.noteEncode(eventId);
    const segments = parseContent(`look ${note} here`);
    expect(segments).toHaveLength(3);
    expect(segments[1]).toEqual({
      type: 'nostr-event',
      value: note,
      bech32: note,
      eventId,
    });
  });

  it('parses bare naddr1 in text', () => {
    const { pubkey } = makeNpub();
    const naddr = nip19.naddrEncode({ kind: 30023, pubkey, identifier: 'hello-world' });
    const segments = parseContent(`read ${naddr}`);
    expect(segments).toHaveLength(2);
    expect(segments[1]).toMatchObject({
      type: 'nostr-address',
      value: naddr,
      bech32: naddr,
      kind: 30023,
      pubkey,
      identifier: 'hello-world',
    });
  });

  it('parses bare nprofile1 in text', () => {
    const { pubkey } = makeNpub();
    const nprofile = nip19.nprofileEncode({ pubkey, relays: ['wss://relay.example.com'] });
    const segments = parseContent(`follow ${nprofile}`);
    expect(segments).toHaveLength(2);
    expect(segments[1]).toMatchObject({
      type: 'nostr-profile',
      value: nprofile,
      pubkey,
    });
  });

  // ─── Invalid entities ─────────────────────────────────────────

  it('falls back to text for invalid nostr entity', () => {
    const segments = parseContent('nostr:npub1invaliddata');
    expect(segments[0]!.type).toBe('text');
  });

  // ─── Mixed content ────────────────────────────────────────────

  it('parses multiple mixed content types', () => {
    const { pubkey, npub } = makeNpub();
    const text = `hey nostr:${npub} look at https://img.example.com/pic.jpg and https://youtube.com/watch?v=abc123`;
    const segments = parseContent(text);

    const types = segments.map((s) => s.type);
    expect(types).toEqual([
      'text',          // "hey "
      'nostr-profile', // nostr:npub1...
      'text',          // " look at "
      'image',         // image URL
      'text',          // " and "
      'youtube',       // YouTube URL
    ]);
    expect((segments[1] as Extract<ContentSegment, { type: 'nostr-profile' }>).pubkey).toBe(pubkey);
    expect((segments[5] as Extract<ContentSegment, { type: 'youtube' }>).videoId).toBe('abc123');
  });

  it('handles URL-only message', () => {
    const segments = parseContent('https://example.com');
    expect(segments).toEqual([{ type: 'url', value: 'https://example.com' }]);
  });

  it('handles multiple URLs on separate lines', () => {
    const text = 'https://a.com\nhttps://b.com';
    const segments = parseContent(text);
    expect(segments).toEqual([
      { type: 'url', value: 'https://a.com' },
      { type: 'text', value: '\n' },
      { type: 'url', value: 'https://b.com' },
    ]);
  });
});

describe('shortenUrl', () => {
  it('removes protocol and returns short URLs as-is', () => {
    expect(shortenUrl('https://example.com/page')).toBe('example.com/page');
  });

  it('truncates long URLs with ellipsis', () => {
    const long = 'https://example.com/' + 'a'.repeat(100);
    const short = shortenUrl(long);
    expect(short.length).toBeLessThanOrEqual(50);
    expect(short).toMatch(/\.\.\.$/);
  });
});
