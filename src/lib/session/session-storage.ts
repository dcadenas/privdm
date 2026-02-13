export type StoredSession =
  | { type: 'keycast'; accessToken: string }
  | { type: 'bunker'; bunkerUrl: string }
  | { type: 'nostrconnect'; clientNsec: string; bunkerUrl: string }
  | { type: 'extension' };
// nsec intentionally excluded — too dangerous to persist

const SESSION_KEY = 'nostr_dm_session';
const AUTH_HANDLE_KEY = 'nostr_dm_auth_handle';

export function saveSession(session: StoredSession): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function loadSession(): StoredSession | null {
  const json = localStorage.getItem(SESSION_KEY);
  if (!json) return null;
  try {
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object') return null;
    const obj = parsed as Record<string, unknown>;

    switch (obj.type) {
      case 'keycast':
        if (typeof obj.accessToken === 'string') {
          return { type: 'keycast', accessToken: obj.accessToken };
        }
        return null;
      case 'bunker':
        if (typeof obj.bunkerUrl === 'string') {
          return { type: 'bunker', bunkerUrl: obj.bunkerUrl };
        }
        return null;
      case 'nostrconnect':
        if (typeof obj.clientNsec === 'string' && typeof obj.bunkerUrl === 'string') {
          return { type: 'nostrconnect', clientNsec: obj.clientNsec, bunkerUrl: obj.bunkerUrl };
        }
        return null;
      case 'extension':
        return { type: 'extension' };
      default:
        return null;
    }
  } catch {
    return null;
  }
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

export function saveAuthorizationHandle(handle: string): void {
  localStorage.setItem(AUTH_HANDLE_KEY, handle);
}

export function loadAuthorizationHandle(): string | null {
  return localStorage.getItem(AUTH_HANDLE_KEY);
}

export function clearAuthorizationHandle(): void {
  localStorage.removeItem(AUTH_HANDLE_KEY);
}
