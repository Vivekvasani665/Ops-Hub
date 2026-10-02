'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError } from '@/lib/api';
import type { Customer } from '@/lib/types';

interface AuthState {
  customer: Customer | null;
  /** true until the initial session check has finished */
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: { name: string; email: string; password: string; phone?: string }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await api.me().catch(async (err) => {
          // Access cookie expired but the refresh cookie may still be valid.
          if (err instanceof ApiError && err.status === 401 && (await api.refresh())) return api.me();
          throw err;
        });
        if (!cancelled) setCustomer(me);
      } catch {
        if (!cancelled) setCustomer(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setCustomer(await api.login(email, password));
  }, []);

  const register = useCallback(async (input: { name: string; email: string; password: string; phone?: string }) => {
    setCustomer(await api.register(input));
  }, []);

  const logout = useCallback(async () => {
    await api.logout().catch(() => undefined);
    setCustomer(null);
  }, []);

  const value = useMemo(() => ({ customer, loading, login, register, logout }), [customer, loading, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
