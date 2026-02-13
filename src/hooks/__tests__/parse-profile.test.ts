import { describe, it, expect } from 'vitest';
import { parseProfile } from '../use-profile';

describe('parseProfile', () => {
  it('returns empty object for empty input', () => {
    expect(parseProfile({})).toEqual({});
  });

  it('extracts known string fields', () => {
    const raw = {
      name: 'alice',
      picture: 'https://example.com/pic.jpg',
      about: 'hello',
      nip05: 'alice@example.com',
      banner: 'https://example.com/banner.jpg',
      website: 'https://example.com',
    };
    expect(parseProfile(raw)).toEqual({
      name: 'alice',
      picture: 'https://example.com/pic.jpg',
      about: 'hello',
      nip05: 'alice@example.com',
      banner: 'https://example.com/banner.jpg',
      website: 'https://example.com',
    });
  });

  it('normalizes display_name to displayName', () => {
    const raw = { display_name: 'Alice Wonderland' };
    expect(parseProfile(raw)).toEqual({ displayName: 'Alice Wonderland' });
  });

  it('prefers display_name over displayName if both present', () => {
    const raw = { display_name: 'From JSON', displayName: 'From other' };
    expect(parseProfile(raw)).toEqual({ displayName: 'From JSON' });
  });

  it('uses displayName if display_name is absent', () => {
    const raw = { displayName: 'Fallback' };
    expect(parseProfile(raw)).toEqual({ displayName: 'Fallback' });
  });

  it('ignores non-string values', () => {
    const raw = { name: 123, picture: true, about: null, nip05: undefined };
    expect(parseProfile(raw as Record<string, unknown>)).toEqual({});
  });

  it('ignores unknown fields', () => {
    const raw = { name: 'bob', lud16: 'bob@getalby.com', custom_field: 42 };
    expect(parseProfile(raw)).toEqual({ name: 'bob' });
  });
});
