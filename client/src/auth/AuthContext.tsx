import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import * as authApi from './api';
import type { User } from './api';
import { setToken, clearToken, getToken } from '../lib/apiClient';

type Status = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthState {
  user: User | null;
  status: Status;
  login: (email: string, password: string) => Promise<void>;
  register: (input: { email: string; password: string; name?: string }) => Promise<void>;
  logout: () => void;
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

  const logout: AuthState['logout'] = () => {
    clearToken();
    setUser(null);
    setStatus('unauthenticated');
  };

  return (
    <AuthContext.Provider value={{ user, status, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
