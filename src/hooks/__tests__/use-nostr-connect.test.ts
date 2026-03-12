import { renderHook, act } from '@testing-library/react';
import { useNostrConnect } from '../use-nostr-connect';
import { BunkerNIP44Signer } from 'divine-signer';
import QRCode from 'qrcode';
import { createNostrConnectURI } from 'nostr-tools/nip46';

const mockSigner = {
  type: 'nostrconnect' as const,
  getBunkerUrl: vi.fn(() => 'bunker://remote-pubkey?relay=wss://relay.test'),
  getPublicKey: vi.fn(async () => 'user-pubkey'),
  signEvent: vi.fn(),
  nip44Encrypt: vi.fn(),
  nip44Decrypt: vi.fn(),
  close: vi.fn(),
};

function createMockHandle(resolveWith?: unknown, rejectWith?: Error) {
  let resolve: (v: unknown) => void;
  let reject: (e: Error) => void;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });

  if (resolveWith !== undefined) {
    Promise.resolve().then(() => resolve(resolveWith));
  } else if (rejectWith) {
    Promise.resolve().then(() => reject(rejectWith));
  }

  return {
    handle: {
      waitForSigner: () => promise,
      abort: vi.fn(),
    },
    resolve: (v: unknown) => resolve(v),
    reject: (e: Error) => reject(e),
  };
}

vi.mock('divine-signer', async () => {
  const actual = await vi.importActual('divine-signer');
  return {
    ...actual,
    BunkerNIP44Signer: {
      prepareNostrConnect: vi.fn(),
      fromNostrConnect: vi.fn(),
      fromBunkerUrl: vi.fn(),
      reconnect: vi.fn(),
    },
  };
});
vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn() },
  toDataURL: vi.fn(),
}));
vi.mock('nostr-tools/nip46', () => ({
  createNostrConnectURI: vi.fn(() => 'nostrconnect://abc123?relay=wss://relay.test&secret=s'),
}));

describe('useNostrConnect', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    (QRCode.toDataURL as ReturnType<typeof vi.fn>).mockResolvedValue('data:image/png;base64,qr-image');
    const { handle } = createMockHandle(mockSigner);
    vi.mocked(BunkerNIP44Signer.prepareNostrConnect).mockResolvedValue(
      handle as never,
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

  it('passes AbortSignal to prepareNostrConnect', async () => {
    const onConnect = vi.fn();
    const { result } = renderHook(() => useNostrConnect(onConnect));

    act(() => { result.current.generate(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    expect(BunkerNIP44Signer.prepareNostrConnect).toHaveBeenCalledWith(
      'nostrconnect://abc123?relay=wss://relay.test&secret=s',
      expect.any(Uint8Array),
      {},
      expect.any(AbortSignal),
    );
  });

  it('sets error status on prepare failure', async () => {
    vi.mocked(BunkerNIP44Signer.prepareNostrConnect).mockRejectedValue(
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

  it('sets error status on waitForSigner failure', async () => {
    const { handle } = createMockHandle(undefined, new Error('Signer refused'));
    vi.mocked(BunkerNIP44Signer.prepareNostrConnect).mockResolvedValue(handle as never);

    const onConnect = vi.fn();
    const { result } = renderHook(() => useNostrConnect(onConnect));

    act(() => { result.current.generate(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('Signer refused');
  });

  it('sets timeout status on timeout error', async () => {
    const { handle } = createMockHandle(undefined, new Error('Connection timeout'));
    vi.mocked(BunkerNIP44Signer.prepareNostrConnect).mockResolvedValue(handle as never);

    const onConnect = vi.fn();
    const { result } = renderHook(() => useNostrConnect(onConnect));

    act(() => { result.current.generate(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    expect(result.current.status).toBe('timeout');
    expect(result.current.error).toBe('Connection timed out — the signer did not respond');
  });

  it('cancel resets to idle and aborts handle', async () => {
    const { handle } = createMockHandle();
    vi.mocked(BunkerNIP44Signer.prepareNostrConnect).mockResolvedValue(handle as never);

    const onConnect = vi.fn();
    const { result } = renderHook(() => useNostrConnect(onConnect));

    act(() => { result.current.generate(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.status).toBe('waiting');

    act(() => { result.current.cancel(); });

    expect(result.current.status).toBe('idle');
    expect(result.current.qrCodeUrl).toBeNull();
    expect(result.current.connectUri).toBeNull();
    expect(result.current.error).toBeNull();
    expect(handle.abort).toHaveBeenCalled();
  });

  it('aborts previous attempt when generate is called again', async () => {
    const first = createMockHandle();
    const second = createMockHandle(mockSigner);
    let callCount = 0;

    vi.mocked(BunkerNIP44Signer.prepareNostrConnect).mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve(first.handle as never);
      return Promise.resolve(second.handle as never);
    });

    const onConnect = vi.fn();
    const { result } = renderHook(() => useNostrConnect(onConnect));

    // First attempt — will hang on waitForSigner
    act(() => { result.current.generate(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.status).toBe('waiting');

    // Second attempt — should abort first and succeed
    act(() => { result.current.generate(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });

    expect(first.handle.abort).toHaveBeenCalled();
    expect(result.current.status).toBe('connected');
    expect(onConnect).toHaveBeenCalledTimes(1);
  });

  it('times out after 60s if signer never responds', async () => {
    const { handle } = createMockHandle(); // never resolves
    vi.mocked(BunkerNIP44Signer.prepareNostrConnect).mockResolvedValue(handle as never);

    const onConnect = vi.fn();
    const { result } = renderHook(() => useNostrConnect(onConnect));

    act(() => { result.current.generate(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.status).toBe('waiting');

    // Advance past the 60s timeout
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });

    expect(result.current.status).toBe('timeout');
    expect(result.current.error).toBe('Connection timed out — the signer did not respond');
    expect(onConnect).not.toHaveBeenCalled();
  });

  it('clears timeout when signer responds before 60s', async () => {
    const { handle, resolve } = createMockHandle();
    vi.mocked(BunkerNIP44Signer.prepareNostrConnect).mockResolvedValue(handle as never);

    const onConnect = vi.fn();
    const { result } = renderHook(() => useNostrConnect(onConnect));

    act(() => { result.current.generate(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.status).toBe('waiting');

    // Signer responds at 30s
    await act(async () => {
      resolve(mockSigner);
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(result.current.status).toBe('connected');

    // Advance well past 60s — should NOT transition to timeout
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(result.current.status).toBe('connected');
  });

  it('does not show timeout when user cancels before 60s', async () => {
    const { handle } = createMockHandle(); // never resolves
    vi.mocked(BunkerNIP44Signer.prepareNostrConnect).mockResolvedValue(handle as never);

    const onConnect = vi.fn();
    const { result } = renderHook(() => useNostrConnect(onConnect));

    act(() => { result.current.generate(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.status).toBe('waiting');

    // User cancels
    act(() => { result.current.cancel(); });
    expect(result.current.status).toBe('idle');

    // Advance past 60s — should stay idle, not flip to timeout
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(result.current.status).toBe('idle');
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
