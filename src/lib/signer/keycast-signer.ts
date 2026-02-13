import { KeycastHttpSigner } from './keycast-http-signer';
import { loadAuthorizationHandle, saveAuthorizationHandle } from '@/lib/session/session-storage';
import type { NIP44Signer } from './types';

export const DIVINE_API = import.meta.env.VITE_DIVINE_API || 'https://login.divine.video';
const CLIENT_ID = 'privdm';

function getRedirectUri(): string {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/auth/callback`;
  }
  return 'http://localhost:5173/auth/callback';
}

// ── PKCE helpers ──────────────────────────────────────────────

function base64URLEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function generateCodeVerifier(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64URLEncode(bytes.buffer);
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64URLEncode(hash);
}

// ── OAuth state storage ──────────────────────────────────────

const OAUTH_STATE_KEY = 'nostr_dm_oauth_state';

interface OAuthState {
  codeVerifier: string;
  nonce: string;
}

function saveOAuthState(state: OAuthState): void {
  localStorage.setItem(OAUTH_STATE_KEY, JSON.stringify(state));
}

export function getOAuthState(): OAuthState | null {
  const json = localStorage.getItem(OAUTH_STATE_KEY);
  if (!json) return null;
  try {
    return JSON.parse(json) as OAuthState;
  } catch {
    return null;
  }
}

export function clearOAuthState(): void {
  localStorage.removeItem(OAUTH_STATE_KEY);
}

// ── Step 1: Start OAuth redirect ─────────────────────────────

export async function startDivineOAuth(options?: { defaultRegister?: boolean }): Promise<void> {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const nonce = generateCodeVerifier().substring(0, 16);

  saveOAuthState({ codeVerifier, nonce });

  const url = new URL('/api/oauth/authorize', DIVINE_API);
  url.searchParams.set('client_id', CLIENT_ID);
  url.searchParams.set('redirect_uri', getRedirectUri());
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'policy:full');
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', nonce);

  if (options?.defaultRegister) {
    url.searchParams.set('default_register', 'true');
  }

  const handle = loadAuthorizationHandle();
  if (handle) {
    url.searchParams.set('authorization_handle', handle);
  }

  window.location.href = url.toString();
}

// ── Step 2: Exchange code for access token ───────────────────

interface TokenResponse {
  access_token?: string;
  authorization_handle?: string;
}

export interface OAuthResult {
  signer: NIP44Signer;
  accessToken: string;
}

export async function exchangeCodeForSigner(
  code: string,
  state: string,
  fetchImpl: typeof fetch = (...args) => fetch(...args),
): Promise<OAuthResult> {
  const storedState = getOAuthState();
  if (!storedState) {
    throw new Error('OAuth session expired. Please try again.');
  }

  if (state !== storedState.nonce) {
    throw new Error('OAuth state mismatch. Please try again.');
  }

  const redirectUri = getRedirectUri();

  const res = await fetchImpl(`${DIVINE_API}/api/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      client_id: CLIENT_ID,
      redirect_uri: redirectUri,
      code_verifier: storedState.codeVerifier,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const msg = body?.error_description ?? body?.error ?? `HTTP ${res.status}`;
    throw new Error(`diVine token exchange failed: ${msg}`);
  }

  const data = (await res.json()) as TokenResponse;

  clearOAuthState();

  if (!data.access_token) {
    throw new Error('diVine token exchange failed: no access_token in response');
  }

  if (data.authorization_handle) {
    saveAuthorizationHandle(data.authorization_handle);
  }

  return {
    signer: new KeycastHttpSigner(data.access_token),
    accessToken: data.access_token,
  };
}
