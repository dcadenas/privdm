import { restoreSession } from '../restore-session';
import { KeycastHttpSigner } from '@/lib/signer/keycast-http-signer';
import { ExtensionSigner } from '@/lib/signer/extension-signer';
import { BunkerNIP44Signer } from '@/lib/signer/bunker-signer';
import { generateSecretKey } from 'nostr-tools/pure';
import { nip19 } from 'nostr-tools';

vi.mock('@/lib/signer/extension-signer');
vi.mock('@/lib/signer/bunker-signer');

describe('restoreSession', () => {
  it('creates KeycastHttpSigner for keycast session', async () => {
    const signer = await restoreSession({ type: 'keycast', accessToken: 'tok-123' });
    expect(signer).toBeInstanceOf(KeycastHttpSigner);
    expect(signer.type).toBe('keycast');
  });

  it('creates ExtensionSigner for extension session', async () => {
    const signer = await restoreSession({ type: 'extension' });
    expect(signer).toBeInstanceOf(ExtensionSigner);
  });

  it('calls BunkerNIP44Signer.fromBunkerUrl for bunker session', async () => {
    const mockSigner = { type: 'bunker' };
    vi.mocked(BunkerNIP44Signer.fromBunkerUrl).mockResolvedValue(mockSigner as unknown as BunkerNIP44Signer);

    const signer = await restoreSession({ type: 'bunker', bunkerUrl: 'bunker://abc' });
    expect(signer).toBe(mockSigner);
    expect(BunkerNIP44Signer.fromBunkerUrl).toHaveBeenCalledWith('bunker://abc');
  });

  it('propagates errors from signer construction', async () => {
    vi.mocked(BunkerNIP44Signer.fromBunkerUrl).mockRejectedValue(new Error('connection failed'));

    await expect(
      restoreSession({ type: 'bunker', bunkerUrl: 'bunker://bad' }),
    ).rejects.toThrow('connection failed');
  });

  it('calls BunkerNIP44Signer.reconnect for nostrconnect session', async () => {
    const mockSigner = { type: 'nostrconnect' };
    vi.mocked(BunkerNIP44Signer.reconnect).mockResolvedValue(mockSigner as unknown as BunkerNIP44Signer);

    const clientKey = generateSecretKey();
    const clientNsec = nip19.nsecEncode(clientKey);
    const bunkerUrl = 'bunker://remote-pubkey?relay=wss://relay.test';

    const signer = await restoreSession({ type: 'nostrconnect', clientNsec, bunkerUrl });
    expect(signer).toBe(mockSigner);
    expect(BunkerNIP44Signer.reconnect).toHaveBeenCalledWith(
      clientKey,
      bunkerUrl,
    );
  });

  it('throws for invalid nsec in nostrconnect session', async () => {
    await expect(
      restoreSession({ type: 'nostrconnect', clientNsec: 'not-an-nsec', bunkerUrl: 'bunker://abc' }),
    ).rejects.toThrow();
  });
});
