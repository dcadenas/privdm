import { useState, useCallback, useRef } from 'react';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { nip19 } from 'nostr-tools';
import { createNostrConnectURI } from 'nostr-tools/nip46';
import QRCode from 'qrcode';
import { BunkerNIP44Signer } from '@/lib/signer/bunker-signer';
import { DEFAULT_METADATA_RELAYS } from '@/lib/relay/defaults';
import type { StoredSession } from '@/lib/session/session-storage';

export type NostrConnectStatus = 'idle' | 'generating' | 'waiting' | 'connected' | 'logging-in' | 'error' | 'timeout';

export interface NostrConnectResult {
  signer: BunkerNIP44Signer;
  session: StoredSession;
}

const CONNECT_RELAYS = [
  'wss://relay.nsec.app',
  'wss://relay.primal.net',
  ...DEFAULT_METADATA_RELAYS.slice(0, 2),
];
const PERMISSIONS = 'get_public_key,nip44_encrypt,nip44_decrypt,sign_event:13,sign_event:14,sign_event:1059';

export function useNostrConnect(onConnect: (result: NostrConnectResult) => Promise<void> | void) {
  const [status, setStatus] = useState<NostrConnectStatus>('idle');
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [connectUri, setConnectUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const onConnectRef = useRef(onConnect);
  onConnectRef.current = onConnect;

  const generate = useCallback(async () => {
    // Cancel any previous attempt
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    setStatus('generating');
    setError(null);
    setQrCodeUrl(null);
    setConnectUri(null);

    try {
      const clientSecretKey = generateSecretKey();
      const clientPubkey = getPublicKey(clientSecretKey);
      const secret = crypto.randomUUID().replace(/-/g, '').slice(0, 16);

      const uri = createNostrConnectURI({
        clientPubkey,
        relays: CONNECT_RELAYS,
        secret,
        perms: PERMISSIONS.split(','),
        name: 'PrivDM',
      });

      const qr = await QRCode.toDataURL(uri, { width: 512, margin: 2 });

      if (abort.signal.aborted) return;

      setQrCodeUrl(qr);
      setConnectUri(uri);
      setStatus('waiting');

      const signer = await BunkerNIP44Signer.fromNostrConnect(
        uri,
        clientSecretKey,
        {},
        abort.signal,
      );

      if (abort.signal.aborted) return;

      const clientNsec = nip19.nsecEncode(clientSecretKey);
      const bunkerUrl = signer.getBunkerUrl();
      const session: StoredSession = { type: 'nostrconnect', clientNsec, bunkerUrl };

      setStatus('logging-in');
      await onConnectRef.current({ signer, session });
      setStatus('connected');
    } catch (err) {
      if (abort.signal.aborted) return;
      const message = err instanceof Error ? err.message : 'Connection failed';
      const isTimeout = message.toLowerCase().includes('timeout');
      setStatus(isTimeout ? 'timeout' : 'error');
      setError(message);
    }
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus('idle');
    setQrCodeUrl(null);
    setConnectUri(null);
    setError(null);
  }, []);

  return { status, qrCodeUrl, connectUri, error, generate, cancel };
}
