import type { OAuthStorage } from 'divine-signer';

const PKCE_KEY = 'nostr_dm_oauth_state';
const HANDLE_KEY = 'nostr_dm_auth_handle';

export const oauthStorage: OAuthStorage = {
  savePkceState: (state) => localStorage.setItem(PKCE_KEY, JSON.stringify(state)),
  loadPkceState: () => { try { return JSON.parse(localStorage.getItem(PKCE_KEY)!); } catch { return null; } },
  clearPkceState: () => localStorage.removeItem(PKCE_KEY),
  saveAuthorizationHandle: (h) => localStorage.setItem(HANDLE_KEY, h),
  loadAuthorizationHandle: () => localStorage.getItem(HANDLE_KEY),
  clearAuthorizationHandle: () => localStorage.removeItem(HANDLE_KEY),
};
