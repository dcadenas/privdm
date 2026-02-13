import { exchangeCodeForSigner, getOAuthState } from '../keycast-signer';
import { KeycastHttpSigner } from '../keycast-http-signer';
import { loadAuthorizationHandle } from '@/lib/session/session-storage';

const OAUTH_STATE_KEY = 'nostr_dm_oauth_state';

function setOAuthState(nonce: string, codeVerifier = 'test-verifier') {
  localStorage.setItem(OAUTH_STATE_KEY, JSON.stringify({ codeVerifier, nonce }));
}

describe('exchangeCodeForSigner', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('throws when OAuth state is missing', async () => {
    await expect(
      exchangeCodeForSigner('code', 'state'),
    ).rejects.toThrow('OAuth session expired');
  });

  it('throws on state mismatch', async () => {
    setOAuthState('correct-nonce');

    await expect(
      exchangeCodeForSigner('code', 'wrong-nonce'),
    ).rejects.toThrow('OAuth state mismatch');
  });

  it('throws on token exchange HTTP failure', async () => {
    setOAuthState('nonce');
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: 'invalid_grant', error_description: 'Invalid code' }),
    });

    await expect(
      exchangeCodeForSigner('code', 'nonce', mockFetch),
    ).rejects.toThrow('diVine token exchange failed: Invalid code');
  });

  it('throws when response has no access_token', async () => {
    setOAuthState('nonce');
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    await expect(
      exchangeCodeForSigner('code', 'nonce', mockFetch),
    ).rejects.toThrow('no access_token in response');
  });

  it('returns OAuthResult with signer and accessToken', async () => {
    setOAuthState('nonce', 'my-verifier');
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ access_token: 'jwt-token-123' }),
    });

    const result = await exchangeCodeForSigner('auth-code', 'nonce', mockFetch);

    expect(result.signer).toBeInstanceOf(KeycastHttpSigner);
    expect(result.signer.type).toBe('keycast');
    expect(result.accessToken).toBe('jwt-token-123');

    // Verify the token exchange request
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0]!;
    expect(url).toBe('https://login.divine.video/api/oauth/token');
    const body = JSON.parse(opts.body);
    expect(body.grant_type).toBe('authorization_code');
    expect(body.code).toBe('auth-code');
    expect(body.code_verifier).toBe('my-verifier');
  });

  it('clears OAuth state after successful exchange', async () => {
    setOAuthState('nonce');
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ access_token: 'token' }),
    });

    await exchangeCodeForSigner('code', 'nonce', mockFetch);

    expect(getOAuthState()).toBeNull();
  });

  it('saves authorization_handle when present in response', async () => {
    setOAuthState('nonce');
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        access_token: 'token',
        authorization_handle: 'handle-xyz',
      }),
    });

    await exchangeCodeForSigner('code', 'nonce', mockFetch);

    expect(loadAuthorizationHandle()).toBe('handle-xyz');
  });

  it('does not save authorization_handle when absent', async () => {
    setOAuthState('nonce');
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ access_token: 'token' }),
    });

    await exchangeCodeForSigner('code', 'nonce', mockFetch);

    expect(loadAuthorizationHandle()).toBeNull();
  });
});
