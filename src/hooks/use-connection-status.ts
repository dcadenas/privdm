import { useState, useEffect, useCallback, useRef } from 'react';

// Force-reconnect if tab was hidden longer than this (catches half-open TCP)
const STALE_THRESHOLD_MS = 30_000;

export interface ConnectionStatus {
  isConnected: boolean;
  isReconnecting: boolean;
  reconnect: () => void;
}

export function useConnectionStatus(onReconnect?: () => void): ConnectionStatus {
  const [isConnected, setIsConnected] = useState(true);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const onReconnectRef = useRef(onReconnect);
  onReconnectRef.current = onReconnect;
  const hiddenAtRef = useRef<number | null>(null);

  const doReconnect = useCallback(() => {
    setIsReconnecting(true);
    onReconnectRef.current?.();
    setIsConnected(true);
    setIsReconnecting(false);
  }, []);

  useEffect(() => {
    const handleOffline = () => {
      console.log('[connection] browser went offline');
      setIsConnected(false);
    };

    const handleOnline = () => {
      console.log('[connection] browser came online, reconnecting');
      doReconnect();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAtRef.current = Date.now();
        return;
      }

      // Tab became visible — reconnect if hidden long enough for connections to go stale
      const hiddenAt = hiddenAtRef.current;
      hiddenAtRef.current = null;

      if (hiddenAt && Date.now() - hiddenAt >= STALE_THRESHOLD_MS) {
        console.debug(`[connection] tab was hidden for ${Math.round((Date.now() - hiddenAt) / 1000)}s, forcing reconnect`);
        doReconnect();
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [doReconnect]);

  return { isConnected, isReconnecting, reconnect: doReconnect };
}
