// src/auth/AuthContext.tsx
// Session state: current user, login/register/logout, boot restore.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { api, bootstrapSession, clearSession, setSession } from '../api/client';
import type { AuthResponse, User } from '../api/types';

interface AuthState {
  user: User | null;
  booting: boolean;
  login: (orgSlug: string, email: string, password: string) => Promise<void>;
  register: (input: {
    orgName: string;
    orgSlug: string;
    email: string;
    password: string;
    fullName: string;
  }) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    // On reload: refresh token -> new session -> fetch nothing extra,
    // the user payload comes with login/refresh flows. We keep a copy
    // in localStorage purely for display purposes across reloads.
    (async () => {
      const restored = await bootstrapSession();
      if (restored) {
        const cached = localStorage.getItem('pulseops.user');
        if (cached) setUser(JSON.parse(cached) as User);
      }
      setBooting(false);
    })();
  }, []);

  const login = useCallback(async (orgSlug: string, email: string, password: string) => {
    const auth = await api<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ orgSlug, email, password }),
    });
    setSession(auth);
    localStorage.setItem('pulseops.user', JSON.stringify(auth.user));
    setUser(auth.user);
  }, []);

  const register = useCallback(
    async (input: {
      orgName: string;
      orgSlug: string;
      email: string;
      password: string;
      fullName: string;
    }) => {
      const auth = await api<AuthResponse>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      setSession(auth);
      localStorage.setItem('pulseops.user', JSON.stringify(auth.user));
      setUser(auth.user);
    },
    []
  );

  const logout = useCallback(() => {
    clearSession();
    localStorage.removeItem('pulseops.user');
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, booting, login, register, logout }),
    [user, booting, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** Route guard: redirects to /login, remembering where the user was going. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, booting } = useAuth();
  const location = useLocation();

  if (booting) return <div className="auth-wrap">Restoring session…</div>;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return <>{children}</>;
}
