import { useState, useEffect, useCallback, useRef } from 'react';

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

  const doReconnect = useCallback(() => {
    setIsReconnecting(true);
    onReconnectRef.current?.();
    setIsConnected(true);
    setIsReconnecting(false);
  }, []);

  useEffect(() => {
    const handleOffline = () => setIsConnected(false);

    const handleOnline = () => doReconnect();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Only reconnect if we were disconnected
        setIsConnected((prev) => {
          if (!prev) {
            doReconnect();
          }
          return prev;
        });
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
