import { describe, it, expect } from 'vitest';
import type { Event } from 'nostr-tools/pure';
import {
  parseHandlerEvent,
  buildHandlerUrl,
  njumpFallbackUrl,
  resolveHandlers,
} from '../handlers';
import type { HandlerInfo } from '../types';

function makeHandlerEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: 'a'.repeat(64),
    pubkey: 'b'.repeat(64),
    created_at: 1700000000,
    kind: 31990,
    tags: [
      ['d', 'app-id-1'],
      ['k', '30023'],
      ['k', '1'],
      ['web', 'https://app.example.com/a/<bech32>', 'naddr'],
      ['web', 'https://app.example.com/e/<bech32>', 'nevent'],
    ],
    content: JSON.stringify({
      name: 'TestApp',
      picture: 'https://app.example.com/icon.png',
      about: 'A test app',
    }),
    sig: 'c'.repeat(128),
    ...overrides,
  };
}

describe('parseHandlerEvent', () => {
  it('extracts metadata from content JSON', () => {
    const handler = parseHandlerEvent(makeHandlerEvent());
    expect(handler.name).toBe('TestApp');
    expect(handler.picture).toBe('https://app.example.com/icon.png');
    expect(handler.about).toBe('A test app');
  });

  it('extracts d-tag and pubkey', () => {
    const handler = parseHandlerEvent(makeHandlerEvent());
    expect(handler.dTag).toBe('app-id-1');
    expect(handler.pubkey).toBe('b'.repeat(64));
  });

  it('extracts supported kinds from k tags', () => {
    const handler = parseHandlerEvent(makeHandlerEvent());
    expect(handler.kinds).toEqual([30023, 1]);
  });

  it('extracts web URLs with nip19 types', () => {
    const handler = parseHandlerEvent(makeHandlerEvent());
    expect(handler.urls).toEqual([
      { template: 'https://app.example.com/a/<bech32>', nip19Type: 'naddr' },
      { template: 'https://app.example.com/e/<bech32>', nip19Type: 'nevent' },
    ]);
  });

  it('handles empty content gracefully', () => {
    const handler = parseHandlerEvent(makeHandlerEvent({ content: '' }));
    expect(handler.name).toBe('');
    expect(handler.picture).toBeUndefined();
  });

  it('handles invalid JSON content', () => {
    const handler = parseHandlerEvent(makeHandlerEvent({ content: 'not json' }));
    expect(handler.name).toBe('');
  });

  it('handles missing d-tag', () => {
    const handler = parseHandlerEvent(makeHandlerEvent({ tags: [] }));
    expect(handler.dTag).toBe('');
    expect(handler.kinds).toEqual([]);
    expect(handler.urls).toEqual([]);
  });
});

describe('buildHandlerUrl', () => {
  const handler: HandlerInfo = {
    pubkey: 'x'.repeat(64),
    dTag: 'test',
    name: 'TestApp',
    kinds: [30023],
    urls: [
      { template: 'https://app.example.com/a/<bech32>', nip19Type: 'naddr' },
      { template: 'https://app.example.com/e/<bech32>', nip19Type: 'nevent' },
      { template: 'https://app.example.com/<bech32>' },
    ],
  };

  it('matches exact nip19Type', () => {
    expect(buildHandlerUrl(handler, 'naddr1abc', 'naddr')).toBe(
      'https://app.example.com/a/naddr1abc',
    );
  });

  it('falls back to generic URL when no exact match', () => {
    expect(buildHandlerUrl(handler, 'nprofile1abc', 'nprofile')).toBe(
      'https://app.example.com/nprofile1abc',
    );
  });

  it('returns null when no matching URL', () => {
    const noGeneric: HandlerInfo = {
      ...handler,
      urls: [{ template: 'https://x.com/a/<bech32>', nip19Type: 'naddr' }],
    };
    expect(buildHandlerUrl(noGeneric, 'nevent1abc', 'nevent')).toBeNull();
  });
});

describe('njumpFallbackUrl', () => {
  it('builds njump.me URL', () => {
    expect(njumpFallbackUrl('naddr1abc')).toBe('https://njump.me/naddr1abc');
  });
});

describe('resolveHandlers', () => {
  const appA: HandlerInfo = {
    pubkey: 'a'.repeat(64),
    dTag: 'a',
    name: 'Bravo',
    kinds: [30023],
    urls: [{ template: 'https://bravo.app/<bech32>', nip19Type: 'naddr' }],
  };

  const appB: HandlerInfo = {
    pubkey: 'b'.repeat(64),
    dTag: 'b',
    name: 'Alpha',
    kinds: [30023],
    urls: [{ template: 'https://alpha.app/<bech32>', nip19Type: 'naddr' }],
  };

  const appNoUrl: HandlerInfo = {
    pubkey: 'c'.repeat(64),
    dTag: 'c',
    name: 'NoUrl',
    kinds: [30023],
    urls: [{ template: 'https://nope.app/<bech32>', nip19Type: 'nevent' }],
  };

  it('filters out handlers without matching URL', () => {
    const resolved = resolveHandlers([appNoUrl], 'naddr1x', 'naddr', new Set());
    expect(resolved).toHaveLength(0);
  });

  it('sorts followed handlers first, then alphabetical', () => {
    const followed = new Set([appA.pubkey]);
    const resolved = resolveHandlers([appA, appB], 'naddr1x', 'naddr', followed);
    expect(resolved).toHaveLength(2);
    expect(resolved[0]!.handler.name).toBe('Bravo');
    expect(resolved[0]!.isFollowed).toBe(true);
    expect(resolved[1]!.handler.name).toBe('Alpha');
    expect(resolved[1]!.isFollowed).toBe(false);
  });

  it('sorts alphabetically when no follows', () => {
    const resolved = resolveHandlers([appA, appB], 'naddr1x', 'naddr', new Set());
    expect(resolved[0]!.handler.name).toBe('Alpha');
    expect(resolved[1]!.handler.name).toBe('Bravo');
  });

  it('builds correct URLs', () => {
    const resolved = resolveHandlers([appA], 'naddr1xyz', 'naddr', new Set());
    expect(resolved[0]!.url).toBe('https://bravo.app/naddr1xyz');
  });
});
