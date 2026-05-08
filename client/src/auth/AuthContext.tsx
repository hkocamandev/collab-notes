// Auth context: bootstraps from sessionStorage on mount, fetches /me to
// validate the token, and exposes login / register / logout / upgrade
// helpers via useAuth. status drives ProtectedRoute and per-page UI.
//
// Two integration points worth noting:
//   - logout() awaits a best-effort POST /api/documents/snapshot-mine so a
//     version is saved before the token is cleared. Failure is swallowed
//     so a flaky network never traps the user in the app.
//   - Token storage is sessionStorage (not localStorage) — see
//     lib/apiClient for the rationale.

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import * as authApi from './api';
import type { User } from './api';
import { setToken, clearToken, getToken } from '../lib/apiClient';
import { snapshotMine } from '../documents/api';

type Status = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthState {
  user: User | null;
  status: Status;
  login: (email: string, password: string) => Promise<void>;
  register: (input: { email: string; password: string; name?: string }) => Promise<void>;
  // Returns a promise so callers can await — but the snapshot call is a
  // best-effort; we always log out even if the snapshot fails.
  logout: () => Promise<void>;
  // Upgrade the current user's plan to "premium". Updates context state on
  // success; throws on failure so the caller can show an error.
  upgrade: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<Status>('loading');

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setStatus('unauthenticated');
      return;
    }
    authApi
      .fetchMe()
      .then(({ user }) => {
        setUser(user);
        setStatus('authenticated');
      })
      .catch(() => {
        clearToken();
        setStatus('unauthenticated');
      });
  }, []);

  const login: AuthState['login'] = async (email, password) => {
    const { token, user } = await authApi.login({ email, password });
    setToken(token);
    setUser(user);
    setStatus('authenticated');
  };

  const register: AuthState['register'] = async (input) => {
    const { token, user } = await authApi.register(input);
    setToken(token);
    setUser(user);
    setStatus('authenticated');
  };

  const logout: AuthState['logout'] = async () => {
    // Best-effort version snapshot of every doc this user was the last editor
    // of. Token must still be valid here, so we run BEFORE clearToken. Any
    // failure (network, server) is swallowed — the user gets logged out either
    // way; no-one wants a dead snapshot endpoint to lock them in.
    try {
      await snapshotMine();
    } catch {
      // intentionally swallowed
    }
    clearToken();
    setUser(null);
    setStatus('unauthenticated');
  };

  const upgrade: AuthState['upgrade'] = async () => {
    const { user: updated } = await authApi.upgradePlan();
    setUser(updated);
  };

  return (
    <AuthContext.Provider value={{ user, status, login, register, logout, upgrade }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
