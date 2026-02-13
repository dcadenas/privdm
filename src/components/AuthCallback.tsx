import { useEffect, useState } from 'react';
import { useAuth } from '@/context/auth-context';
import { exchangeCodeForSigner, clearOAuthState } from '@/lib/signer/keycast-signer';

// Prevent double-execution from React StrictMode (codes are single-use)
const usedCodes = new Set<string>();

export function AuthCallback() {
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');

  useEffect(() => {
    async function handleCallback() {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const state = params.get('state');
      const errorParam = params.get('error');

      if (errorParam) {
        setError(params.get('error_description') || 'Authentication failed');
        setStatus('error');
        return;
      }

      if (!code || !state) {
        setError('Missing authorization code');
        setStatus('error');
        return;
      }

      // usedCodes prevents double-execution from React StrictMode
      // (authorization codes are single-use)
      if (usedCodes.has(code)) {
        return;
      }
      usedCodes.add(code);

      try {
        const { signer, accessToken } = await exchangeCodeForSigner(code, state);
        await login(signer, { type: 'keycast', accessToken });
        setStatus('success');
        window.history.replaceState({}, '', '/');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Login failed');
        setStatus('error');
        clearOAuthState();
      }
    }

    handleCallback();
  }, [login]);

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950 text-gray-100">
        <div className="text-center">
          <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-gray-600 border-t-amber-500" />
          <p className="mt-3 text-sm text-gray-400">Completing login...</p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950 text-gray-100">
        <div className="text-center max-w-sm">
          <p className="text-red-400 text-sm">{error}</p>
          <button
            onClick={() => { window.location.href = '/'; }}
            className="btn-primary mt-4 text-sm"
          >
            Back to login
          </button>
        </div>
      </div>
    );
  }

  return null;
}
