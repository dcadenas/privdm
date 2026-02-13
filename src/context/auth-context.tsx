import { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { NIP44Signer } from '@/lib/signer/types';
import type { StoredSession } from '@/lib/session/session-storage';
import {
  saveSession,
  loadSession,
  clearSession,
  clearAuthorizationHandle,
} from '@/lib/session/session-storage';
import { restoreSession } from '@/lib/session/restore-session';
import { messageStore } from '@/lib/storage/singleton';
import { setPoolAuth, clearPoolAuth } from '@/lib/relay/pool';
interface AuthState {
  signer: NIP44Signer | null;
  pubkey: string | null;
}

interface AuthContextValue {
  signer: NIP44Signer | null;
  pubkey: string | null;
  isAuthenticated: boolean;
  isRestoring: boolean;
  login: (signer: NIP44Signer, session?: StoredSession) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ signer: null, pubkey: null });
  const [isRestoring, setIsRestoring] = useState(true);
  const restoredRef = useRef(false);
  const queryClient = useQueryClient();

  const login = useCallback(async (signer: NIP44Signer, session?: StoredSession) => {
    const pubkey = await signer.getPublicKey();
    if (session) {
      saveSession(session);
    }
    setPoolAuth(signer);
    setState({ signer, pubkey });
  }, []);

  const logout = useCallback(() => {
    setState({ signer: null, pubkey: null });
    clearSession();
    clearAuthorizationHandle();
    clearPoolAuth();
    queryClient.clear();
    void messageStore.clear();
  }, [queryClient]);

  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;

    async function restore() {
      try {
        const stored = loadSession();
        if (!stored) return;

        const signer = await Promise.race([
          restoreSession(stored).then(async (s) => {
            await s.getPublicKey(); // validate the session is still good
            return s;
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Session restore timed out')), 10_000),
          ),
        ]);
        await login(signer, stored);
      } catch {
        clearSession();
      } finally {
        setIsRestoring(false);
      }
    }

    restore();
  }, [login]);

  const value = useMemo<AuthContextValue>(
    () => ({
      signer: state.signer,
      pubkey: state.pubkey,
      isAuthenticated: state.signer !== null,
      isRestoring,
      login,
      logout,
    }),
    [state, isRestoring, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
