import {
  saveSession,
  loadSession,
  clearSession,
  saveAuthorizationHandle,
  loadAuthorizationHandle,
  clearAuthorizationHandle,
} from '../session-storage';
import type { StoredSession } from '../session-storage';

describe('session-storage', () => {
  afterEach(() => {
    localStorage.clear();
  });

  describe('saveSession / loadSession', () => {
    it('round-trips a keycast session', () => {
      const session: StoredSession = { type: 'keycast', accessToken: 'tok-123' };
      saveSession(session);
      expect(loadSession()).toEqual(session);
    });

    it('round-trips a bunker session', () => {
      const session: StoredSession = { type: 'bunker', bunkerUrl: 'bunker://abc' };
      saveSession(session);
      expect(loadSession()).toEqual(session);
    });

    it('round-trips a nostrconnect session', () => {
      const session: StoredSession = {
        type: 'nostrconnect',
        clientNsec: 'nsec1abc',
        bunkerUrl: 'bunker://pubkey?relay=wss://relay.test',
      };
      saveSession(session);
      expect(loadSession()).toEqual(session);
    });

    it('round-trips an extension session', () => {
      const session: StoredSession = { type: 'extension' };
      saveSession(session);
      expect(loadSession()).toEqual(session);
    });

    it('returns null when nothing is stored', () => {
      expect(loadSession()).toBeNull();
    });

    it('returns null for invalid JSON', () => {
      localStorage.setItem('nostr_dm_session', 'not-json');
      expect(loadSession()).toBeNull();
    });

    it('returns null for unknown session type', () => {
      localStorage.setItem('nostr_dm_session', JSON.stringify({ type: 'nsec', nsec: 'secret' }));
      expect(loadSession()).toBeNull();
    });

    it('returns null for keycast session missing accessToken', () => {
      localStorage.setItem('nostr_dm_session', JSON.stringify({ type: 'keycast' }));
      expect(loadSession()).toBeNull();
    });

    it('returns null for bunker session missing bunkerUrl', () => {
      localStorage.setItem('nostr_dm_session', JSON.stringify({ type: 'bunker' }));
      expect(loadSession()).toBeNull();
    });

    it('returns null for nostrconnect session missing clientNsec', () => {
      localStorage.setItem('nostr_dm_session', JSON.stringify({ type: 'nostrconnect', bunkerUrl: 'bunker://abc' }));
      expect(loadSession()).toBeNull();
    });

    it('returns null for nostrconnect session missing bunkerUrl', () => {
      localStorage.setItem('nostr_dm_session', JSON.stringify({ type: 'nostrconnect', clientNsec: 'nsec1abc' }));
      expect(loadSession()).toBeNull();
    });

    it('returns null for non-object values', () => {
      localStorage.setItem('nostr_dm_session', '"just a string"');
      expect(loadSession()).toBeNull();
    });

    it('returns null for null value', () => {
      localStorage.setItem('nostr_dm_session', 'null');
      expect(loadSession()).toBeNull();
    });
  });

  describe('clearSession', () => {
    it('removes the stored session', () => {
      saveSession({ type: 'extension' });
      clearSession();
      expect(loadSession()).toBeNull();
    });
  });

  describe('authorization handle', () => {
    it('round-trips a handle', () => {
      saveAuthorizationHandle('handle-abc');
      expect(loadAuthorizationHandle()).toBe('handle-abc');
    });

    it('returns null when no handle stored', () => {
      expect(loadAuthorizationHandle()).toBeNull();
    });

    it('clears the handle', () => {
      saveAuthorizationHandle('handle-abc');
      clearAuthorizationHandle();
      expect(loadAuthorizationHandle()).toBeNull();
    });
  });
});
