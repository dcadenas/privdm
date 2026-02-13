import { useState, useEffect } from 'react';
import { useAuth } from '@/context/auth-context';
import { NsecSigner } from '@/lib/signer/nsec-signer';
import { ExtensionSigner } from '@/lib/signer/extension-signer';
import { BunkerNIP44Signer } from '@/lib/signer/bunker-signer';
import { startDivineOAuth } from '@/lib/signer/keycast-signer';
import { useNostrConnect } from '@/hooks/use-nostr-connect';

type NostrMethod = 'nsec' | 'extension' | 'bunker' | 'nostrconnect';

const nostrMethods: { id: NostrMethod; label: string; icon: string }[] = [
  { id: 'extension', label: 'Extension', icon: '\u{1F50C}' },
  { id: 'nostrconnect', label: 'Connect', icon: '\u{1F4F1}' },
  { id: 'bunker', label: 'Bunker', icon: '\u{1F510}' },
  { id: 'nsec', label: 'nsec', icon: '\u{1F511}' },
];

export function LoginScreen() {
  const { login } = useAuth();
  const [method, setMethod] = useState<NostrMethod | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [nsec, setNsec] = useState('');
  const [bunkerUrl, setBunkerUrl] = useState('');

  const nostrConnect = useNostrConnect(async ({ signer, session }) => {
    await login(signer, session);
  });

  // Auto-generate QR when switching to nostrconnect; cancel when switching away
  useEffect(() => {
    if (method === 'nostrconnect') {
      nostrConnect.generate();
    } else {
      nostrConnect.cancel();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method]);

  async function handleDivineLogin(defaultRegister?: boolean) {
    setError(null);
    try {
      await startDivineOAuth(defaultRegister ? { defaultRegister: true } : undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    }
  }

  async function handleLogin() {
    setLoading(true);
    setError(null);

    try {
      switch (method) {
        case 'nsec': {
          const signer = new NsecSigner(nsec.trim());
          await login(signer); // nsec not persisted — too dangerous
          break;
        }
        case 'extension': {
          const signer = new ExtensionSigner();
          await login(signer, { type: 'extension' });
          break;
        }
        case 'bunker': {
          const url = bunkerUrl.trim();
          const signer = await BunkerNIP44Signer.fromBunkerUrl(url);
          await login(signer, { type: 'bunker', bunkerUrl: url });
          break;
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  function canSubmit(): boolean {
    if (loading) return false;
    switch (method) {
      case 'nsec': return nsec.trim().length > 0;
      case 'extension': return true;
      case 'bunker': return bunkerUrl.trim().length > 0;
      case 'nostrconnect': return false; // no submit button — connection is automatic
      default: return false;
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gray-950 text-gray-100">
      {/* Ambient glow */}
      <div className="login-glow pointer-events-none absolute inset-0" />

      {/* Subtle grid texture */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      <div className="relative z-10 w-full max-w-md px-6 animate-fade-in">
        {/* Header */}
        <div className="mb-10 text-center">
          <div className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-500/20 bg-amber-500/10 text-2xl">
            💬
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-gray-50">
            PrivDM
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            Private encrypted messaging
          </p>
        </div>

        {/* Primary diVine CTA */}
        <button
          onClick={() => handleDivineLogin()}
          className="btn-primary w-full py-3 text-base flex items-center justify-center gap-2.5"
          data-testid="divine-login-button"
        >
          <img src="/divine-icon.png" alt="" className="h-5 w-5" />
          Sign in with diVine
        </button>
        <p className="text-center text-xs text-gray-500 mt-2">
          or{' '}
          <button
            onClick={() => handleDivineLogin(true)}
            className="text-amber-400/80 hover:text-amber-300 transition-colors"
          >
            create an account
          </button>
        </p>

        {/* Divider */}
        <div className="flex items-center gap-3 my-6">
          <div className="h-px flex-1 bg-gray-800/60" />
          <span className="text-xs text-gray-600">more nostr ways to connect</span>
          <div className="h-px flex-1 bg-gray-800/60" />
        </div>

        {/* Nostr method grid */}
        <div className="grid grid-cols-2 gap-2">
          {nostrMethods.map((m) => (
            <button
              key={m.id}
              onClick={() => { setMethod(method === m.id ? null : m.id); setError(null); }}
              className={`rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2 ${
                method === m.id
                  ? 'border border-amber-500/30 bg-amber-500/10 text-amber-400'
                  : 'btn-ghost'
              }`}
            >
              <span>{m.icon}</span>
              {m.label}
            </button>
          ))}
        </div>

        {/* Method form panel */}
        {method && (
          <div className="mt-4 space-y-4 animate-slide-up" key={method}>
            {method === 'extension' && (
              <div className="rounded-xl border border-gray-800/50 bg-gray-900/40 p-5">
                <p className="text-sm text-gray-400 leading-relaxed">
                  Connect with a NIP-07 browser extension.
                  The extension handles signing and encryption.
                </p>
                <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                  <a href="https://chromewebstore.google.com/detail/soapbox-signer/nnodjkgakfpkckcnbacpcjbpmlmbihdd" target="_blank" rel="noopener noreferrer" className="text-amber-400/80 hover:text-amber-300 transition-colors">Soapbox Signer</a>
                  <a href="https://chromewebstore.google.com/detail/alby-bitcoin-wallet-for-l/iokeahhehimjnekafflcihljlcjccdbe" target="_blank" rel="noopener noreferrer" className="text-amber-400/80 hover:text-amber-300 transition-colors">Alby</a>
                  <a href="https://chromewebstore.google.com/detail/nos2x/kpgefcfmnafjgpblomihpgmejjdanjjp" target="_blank" rel="noopener noreferrer" className="text-amber-400/80 hover:text-amber-300 transition-colors">nos2x</a>
                  <a href="https://addons.mozilla.org/en-US/firefox/addon/nos2x-fox/" target="_blank" rel="noopener noreferrer" className="text-amber-400/80 hover:text-amber-300 transition-colors">nos2x-fox <span className="text-gray-600">(Firefox)</span></a>
                </div>
              </div>
            )}

            {method === 'nsec' && (
              <>
                <div className="rounded-xl border border-red-900/30 bg-red-950/20 p-4">
                  <div className="flex items-start gap-2.5">
                    <span className="mt-0.5 text-red-400 text-sm">⚠</span>
                    <p className="text-xs text-red-300/80 leading-relaxed">
                      Your secret key gives full access to your Nostr identity.
                      Only use this on a device you trust. Prefer a browser extension
                      or remote signer for better security.
                    </p>
                  </div>
                </div>
                <input
                  type="password"
                  placeholder="nsec1..."
                  value={nsec}
                  onChange={(e) => setNsec(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && canSubmit() && handleLogin()}
                  className="input-dark"
                  autoComplete="off"
                  data-testid="nsec-input"
                />
              </>
            )}

            {method === 'bunker' && (
              <>
                <div className="rounded-xl border border-gray-800/50 bg-gray-900/40 p-4">
                  <p className="text-xs text-gray-500 leading-relaxed">
                    Paste a <span className="font-mono text-gray-400">bunker://</span> URL
                    from your remote signer (nsecBunker, Amber).
                  </p>
                </div>
                <input
                  type="text"
                  placeholder="bunker://..."
                  value={bunkerUrl}
                  onChange={(e) => setBunkerUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && canSubmit() && handleLogin()}
                  className="input-dark"
                  autoComplete="off"
                  data-testid="bunker-input"
                />
              </>
            )}

            {method === 'nostrconnect' && (
              <div className="rounded-xl border border-gray-800/50 bg-gray-900/40 p-5">
                <p className="mb-4 text-sm text-gray-400 leading-relaxed">
                  Scan this QR code with a NIP-46 signer app
                  <span className="text-gray-600"> (Amber, Primal, nsec.app)</span>.
                  Grant full access when prompted to allow signing and encryption.
                </p>

                {nostrConnect.status === 'generating' && (
                  <div className="flex justify-center py-8">
                    <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-gray-700 border-t-amber-400" />
                  </div>
                )}

                {nostrConnect.qrCodeUrl && (nostrConnect.status === 'waiting' || nostrConnect.status === 'logging-in' || nostrConnect.status === 'connected') && (
                  <div className="flex justify-center" data-testid="nostrconnect-qr">
                    <img
                      src={nostrConnect.qrCodeUrl}
                      alt="Nostrconnect QR code"
                      className="h-56 w-56 rounded-lg"
                    />
                  </div>
                )}

                {nostrConnect.status === 'waiting' && (
                  <p className="mt-4 text-center text-xs text-gray-500">
                    Waiting for connection...
                  </p>
                )}

                {nostrConnect.status === 'logging-in' && (
                  <div className="mt-4 text-center">
                    <p className="text-xs text-amber-400 inline-flex items-center justify-center gap-2 w-full">
                      <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-amber-400/30 border-t-amber-400" />
                      Waiting for approval...
                    </p>
                  </div>
                )}

                {nostrConnect.status === 'connected' && (
                  <p className="mt-4 text-center text-xs text-green-400">
                    Connected!
                  </p>
                )}

                {(nostrConnect.status === 'error' || nostrConnect.status === 'timeout') && (
                  <div className="mt-4 space-y-3">
                    <p className="text-center text-xs text-red-400" data-testid="nostrconnect-error">
                      {nostrConnect.status === 'timeout'
                        ? 'Signer didn\u2019t respond. Make sure to grant full access when connecting \u2014 restricted permissions may silently block requests.'
                        : nostrConnect.error}
                    </p>
                    <button
                      onClick={() => nostrConnect.generate()}
                      className="btn-primary w-full text-sm"
                    >
                      Try again
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Error display */}
            {error && (
              <div className="rounded-lg border border-red-800/40 bg-red-950/30 px-4 py-3 animate-slide-up">
                <p className="text-xs text-red-400" data-testid="login-error">{error}</p>
              </div>
            )}

            {/* Submit (hidden for nostrconnect — connection is automatic) */}
            {method !== 'nostrconnect' && (
              <button
                onClick={handleLogin}
                disabled={!canSubmit()}
                className="btn-primary w-full text-sm"
                data-testid="login-button"
              >
                {loading ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-950/30 border-t-gray-950" />
                    Connecting...
                  </span>
                ) : (
                  'Connect'
                )}
              </button>
            )}
          </div>
        )}

        {/* Error display (when no method selected) */}
        {!method && error && (
          <div className="mt-4 rounded-lg border border-red-800/40 bg-red-950/30 px-4 py-3 animate-slide-up">
            <p className="text-xs text-red-400" data-testid="login-error">{error}</p>
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 space-y-2 text-center">
          <p className="text-[10px] leading-relaxed text-gray-600">
            Messages are end-to-end encrypted using the Nostr protocol
            (NIP-17/NIP-44). This software is provided as-is with no warranty.{' '}
            <a
              href="https://github.com/dcadenas/privdm"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-500 hover:text-gray-400 transition-colors"
            >
              Open source (MIT)
            </a>
          </p>
          <p className="text-[11px] text-gray-700">
            <span className="font-mono text-gray-800">{__COMMIT_HASH__}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
