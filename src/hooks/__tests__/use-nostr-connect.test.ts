import { renderHook, act } from '@testing-library/react';
import { useNostrConnect } from '../use-nostr-connect';
import { BunkerNIP44Signer } from '@/lib/signer/bunker-signer';
import QRCode from 'qrcode';
import { createNostrConnectURI } from 'nostr-tools/nip46';

vi.mock('@/lib/signer/bunker-signer');
vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn() },
  toDataURL: vi.fn(),
}));
vi.mock('nostr-tools/nip46', () => ({
  createNostrConnectURI: vi.fn(() => 'nostrconnect://abc123?relay=wss://relay.test&secret=s'),
}));

const mockSigner = {
  type: 'nostrconnect' as const,
  getBunkerUrl: vi.fn(() => 'bunker://remote-pubkey?relay=wss://relay.test'),
  getPublicKey: vi.fn(async () => 'user-pubkey'),
  signEvent: vi.fn(),
  nip44Encrypt: vi.fn(),
  nip44Decrypt: vi.fn(),
  close: vi.fn(),
};

describe('useNostrConnect', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    (QRCode.toDataURL as ReturnType<typeof vi.fn>).mockResolvedValue('data:image/png;base64,qr-image');
    vi.mocked(BunkerNIP44Signer.fromNostrConnect).mockResolvedValue(
      mockSigner as unknown as BunkerNIP44Signer,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts in idle status', () => {
    const onConnect = vi.fn();
    const { result } = renderHook(() => useNostrConnect(onConnect));
    expect(result.current.status).toBe('idle');
    expect(result.current.qrCodeUrl).toBeNull();
  });

  it('transitions through generating → waiting → connected', async () => {
    const onConnect = vi.fn();
    const { result } = renderHook(() => useNostrConnect(onConnect));

    act(() => { result.current.generate(); });
    // Flush microtasks + advance past the 5-second signer setup delay
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });

    expect(result.current.status).toBe('connected');
    expect(result.current.qrCodeUrl).toBe('data:image/png;base64,qr-image');
    expect(onConnect).toHaveBeenCalledWith({
      signer: mockSigner,
      session: expect.objectContaining({
        type: 'nostrconnect',
        bunkerUrl: 'bunker://remote-pubkey?relay=wss://relay.test',
      }),
    });
    // clientNsec should be a bech32-encoded nsec
    const session = onConnect.mock.calls[0]![0].session;
    expect(session.clientNsec).toMatch(/^nsec1/);
  });

  it('generates QR code from nostrconnect URI', async () => {
    const onConnect = vi.fn();
    const { result } = renderHook(() => useNostrConnect(onConnect));

    act(() => { result.current.generate(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    expect(createNostrConnectURI).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'PrivDM',
        perms: expect.arrayContaining(['nip44_encrypt', 'nip44_decrypt', 'sign_event:13']),
      }),
    );
    expect(QRCode.toDataURL).toHaveBeenCalledWith(
      'nostrconnect://abc123?relay=wss://relay.test&secret=s',
      { width: 512, margin: 2 },
    );
  });

  it('passes AbortSignal to fromNostrConnect', async () => {
    const onConnect = vi.fn();
    const { result } = renderHook(() => useNostrConnect(onConnect));

    act(() => { result.current.generate(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    expect(BunkerNIP44Signer.fromNostrConnect).toHaveBeenCalledWith(
      'nostrconnect://abc123?relay=wss://relay.test&secret=s',
      expect.any(Uint8Array),
      {},
      expect.any(AbortSignal),
    );
  });

  it('sets error status on failure', async () => {
    vi.mocked(BunkerNIP44Signer.fromNostrConnect).mockRejectedValue(
      new Error('Remote signer rejected'),
    );

    const onConnect = vi.fn();
    const { result } = renderHook(() => useNostrConnect(onConnect));

    act(() => { result.current.generate(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('Remote signer rejected');
    expect(onConnect).not.toHaveBeenCalled();
  });

  it('sets timeout status on timeout error', async () => {
    vi.mocked(BunkerNIP44Signer.fromNostrConnect).mockRejectedValue(
      new Error('Connection timeout'),
    );

    const onConnect = vi.fn();
    const { result } = renderHook(() => useNostrConnect(onConnect));

    act(() => { result.current.generate(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    expect(result.current.status).toBe('timeout');
    expect(result.current.error).toBe('Connection timeout');
  });

  it('cancel resets to idle', async () => {
    // Make fromNostrConnect hang
    vi.mocked(BunkerNIP44Signer.fromNostrConnect).mockImplementation(
      () => new Promise(() => {}),
    );

    const onConnect = vi.fn();
    const { result } = renderHook(() => useNostrConnect(onConnect));

    act(() => { result.current.generate(); });
    // Flush microtasks to reach 'waiting' (QR generated, fromNostrConnect hanging)
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.status).toBe('waiting');

    act(() => { result.current.cancel(); });

    expect(result.current.status).toBe('idle');
    expect(result.current.qrCodeUrl).toBeNull();
    expect(result.current.connectUri).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('aborts previous attempt when generate is called again', async () => {
    let resolveFirst: ((v: BunkerNIP44Signer) => void) | undefined;
    let callCount = 0;

    vi.mocked(BunkerNIP44Signer.fromNostrConnect).mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return new Promise((resolve) => { resolveFirst = resolve; });
      }
      return Promise.resolve(mockSigner as unknown as BunkerNIP44Signer);
    });

    const onConnect = vi.fn();
    const { result } = renderHook(() => useNostrConnect(onConnect));

    // First attempt — will hang on fromNostrConnect
    act(() => { result.current.generate(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.status).toBe('waiting');

    // Second attempt — should abort first and succeed
    act(() => { result.current.generate(); });
    // Flush microtasks + advance past the 5-second delay
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });

    // Resolve the first (should be ignored since aborted)
    resolveFirst?.(mockSigner as unknown as BunkerNIP44Signer);

    expect(result.current.status).toBe('connected');
    expect(onConnect).toHaveBeenCalledTimes(1);
  });

  it('exposes connectUri', async () => {
    const onConnect = vi.fn();
    const { result } = renderHook(() => useNostrConnect(onConnect));

    act(() => { result.current.generate(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    expect(result.current.connectUri).toBe(
      'nostrconnect://abc123?relay=wss://relay.test&secret=s',
    );
  });
});
