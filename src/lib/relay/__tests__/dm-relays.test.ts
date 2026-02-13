import type { Event } from 'nostr-tools/pure';
import { normalizeRelayUrl, parseDMRelayList, fetchDMRelays } from '../dm-relays';

describe('normalizeRelayUrl', () => {
  it('lowercases the URL', () => {
    expect(normalizeRelayUrl('WSS://Relay.Damus.IO')).toBe('wss://relay.damus.io');
  });

  it('strips trailing slash', () => {
    expect(normalizeRelayUrl('wss://relay.damus.io/')).toBe('wss://relay.damus.io');
  });

  it('trims whitespace', () => {
    expect(normalizeRelayUrl('  wss://nos.lol  ')).toBe('wss://nos.lol');
  });

  it('handles already-normalized URLs', () => {
    expect(normalizeRelayUrl('wss://nos.lol')).toBe('wss://nos.lol');
  });
});

describe('parseDMRelayList', () => {
  const baseEvent: Event = {
    id: 'abc',
    pubkey: 'pubkey123',
    created_at: 1700000000,
    kind: 10050,
    tags: [
      ['relay', 'wss://relay.damus.io'],
      ['relay', 'wss://nos.lol/'],
    ],
    content: '',
    sig: 'sig',
  };

  it('extracts relay URLs from tags', () => {
    const result = parseDMRelayList(baseEvent);
    expect(result.relays).toEqual(['wss://relay.damus.io', 'wss://nos.lol']);
  });

  it('returns the pubkey', () => {
    const result = parseDMRelayList(baseEvent);
    expect(result.pubkey).toBe('pubkey123');
  });

  it('returns the created_at timestamp', () => {
    const result = parseDMRelayList(baseEvent);
    expect(result.createdAt).toBe(1700000000);
  });

  it('ignores non-relay tags', () => {
    const event: Event = {
      ...baseEvent,
      tags: [
        ['relay', 'wss://relay.damus.io'],
        ['p', 'somepubkey'],
        ['e', 'someeventid'],
        ['relay', 'wss://nos.lol'],
      ],
    };

    const result = parseDMRelayList(event);
    expect(result.relays).toEqual(['wss://relay.damus.io', 'wss://nos.lol']);
  });

  it('returns empty relays when no relay tags', () => {
    const event: Event = { ...baseEvent, tags: [] };
    const result = parseDMRelayList(event);
    expect(result.relays).toEqual([]);
  });

  it('skips relay tags with empty value', () => {
    const event: Event = {
      ...baseEvent,
      tags: [
        ['relay', ''],
        ['relay', 'wss://nos.lol'],
      ],
    };

    const result = parseDMRelayList(event);
    expect(result.relays).toEqual(['wss://nos.lol']);
  });
});

describe('fetchDMRelays', () => {
  it('returns parsed relay list when event found', async () => {
    const mockPool = {
      get: vi.fn().mockResolvedValue({
        id: 'abc',
        pubkey: 'user1',
        created_at: 1700000000,
        kind: 10050,
        tags: [['relay', 'wss://inbox.nostr.wine']],
        content: '',
        sig: 'sig',
      }),
    };

    const result = await fetchDMRelays(mockPool as never, 'user1');

    expect(result).toEqual({
      pubkey: 'user1',
      relays: ['wss://inbox.nostr.wine'],
      createdAt: 1700000000,
    });

    expect(mockPool.get).toHaveBeenCalledWith(
      expect.any(Array),
      { kinds: [10050], authors: ['user1'] },
    );
  });

  it('returns null when no event found', async () => {
    const mockPool = {
      get: vi.fn().mockResolvedValue(null),
    };

    const result = await fetchDMRelays(mockPool as never, 'user1');
    expect(result).toBeNull();
  });

  it('uses custom lookup relays when provided', async () => {
    const mockPool = {
      get: vi.fn().mockResolvedValue(null),
    };

    await fetchDMRelays(mockPool as never, 'user1', ['wss://custom.relay']);

    expect(mockPool.get).toHaveBeenCalledWith(
      ['wss://custom.relay'],
      { kinds: [10050], authors: ['user1'] },
    );
  });
});
