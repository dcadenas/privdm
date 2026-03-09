import { renderHook, act } from '@testing-library/react';
import { useConnectionStatus } from '../use-connection-status';

describe('useConnectionStatus', () => {
  let visibilityState: DocumentVisibilityState;

  beforeEach(() => {
    visibilityState = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibilityState);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('starts as connected and online', () => {
    const { result } = renderHook(() => useConnectionStatus());
    expect(result.current.isConnected).toBe(true);
    expect(result.current.isReconnecting).toBe(false);
  });

  it('sets isConnected to false on offline event', () => {
    const { result } = renderHook(() => useConnectionStatus());

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });

    expect(result.current.isConnected).toBe(false);
  });

  it('calls onReconnect and restores connection on online event', () => {
    const onReconnect = vi.fn();
    const { result } = renderHook(() => useConnectionStatus(onReconnect));

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current.isConnected).toBe(false);

    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    expect(onReconnect).toHaveBeenCalledTimes(1);
    expect(result.current.isConnected).toBe(true);
  });

  it('reconnects when tab was hidden longer than stale threshold', () => {
    const onReconnect = vi.fn();
    renderHook(() => useConnectionStatus(onReconnect));

    // Hide tab
    act(() => {
      visibilityState = 'hidden';
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // Advance past stale threshold (30s)
    act(() => {
      vi.advanceTimersByTime(31_000);
    });

    // Show tab
    act(() => {
      visibilityState = 'visible';
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(onReconnect).toHaveBeenCalledTimes(1);
  });

  it('does not reconnect when tab was hidden briefly', () => {
    const onReconnect = vi.fn();
    renderHook(() => useConnectionStatus(onReconnect));

    // Hide tab
    act(() => {
      visibilityState = 'hidden';
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // Only 5s — below threshold
    act(() => {
      vi.advanceTimersByTime(5_000);
    });

    // Show tab
    act(() => {
      visibilityState = 'visible';
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(onReconnect).not.toHaveBeenCalled();
  });

  it('manual reconnect() triggers onReconnect and restores state', () => {
    const onReconnect = vi.fn();
    const { result } = renderHook(() => useConnectionStatus(onReconnect));

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current.isConnected).toBe(false);

    act(() => {
      result.current.reconnect();
    });

    expect(onReconnect).toHaveBeenCalledTimes(1);
    expect(result.current.isConnected).toBe(true);
  });

  it('cleans up event listeners on unmount', () => {
    const addDoc = vi.spyOn(document, 'addEventListener');
    const removeDoc = vi.spyOn(document, 'removeEventListener');
    const addWin = vi.spyOn(window, 'addEventListener');
    const removeWin = vi.spyOn(window, 'removeEventListener');

    const { unmount } = renderHook(() => useConnectionStatus());

    expect(addDoc).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    expect(addWin).toHaveBeenCalledWith('online', expect.any(Function));
    expect(addWin).toHaveBeenCalledWith('offline', expect.any(Function));

    unmount();

    expect(removeDoc).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    expect(removeWin).toHaveBeenCalledWith('online', expect.any(Function));
    expect(removeWin).toHaveBeenCalledWith('offline', expect.any(Function));
  });
});
