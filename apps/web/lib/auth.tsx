'use client';

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { messageFromError } from './api-error';

/**
 * Self-hosted auth context (replaces Clerk). The session JWT lives in a `vq_token` cookie
 * so both the client (sent as `Authorization: Bearer`) and the Next middleware (route
 * protection) can read it. `useAuth()` keeps the SAME shape Clerk exposed — `{ getToken }`
 * — so the entire typed API layer (`lib/api.ts`) needs no change beyond its import.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
export const TOKEN_COOKIE = 'vq_token';
const TOKEN_MAX_AGE = 7 * 24 * 60 * 60; // 7 days (matches the API JWT TTL)

export interface AuthUser {
  userId: string;
  email: string;
  name: string | null;
  imageUrl: string | null;
  memberships: { tenantId: string; role: string; status: string }[];
}

export interface SignUpInput {
  email: string;
  password: string;
  name?: string;
  workspaceName?: string;
}

interface AuthContextValue {
  isLoaded: boolean;
  isSignedIn: boolean;
  user: AuthUser | null;
  getToken: (options?: { template?: string }) => Promise<string | null>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: SignUpInput) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}
function writeCookie(name: string, value: string): void {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${TOKEN_MAX_AGE}; SameSite=Lax`;
}
function clearCookie(name: string): void {
  document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const data: unknown = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(messageFromError(data));
  return data as T;
}

async function fetchMe(token: string): Promise<AuthUser> {
  const res = await fetch(`${API_URL}/auth/me`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Session expired');
  return (await res.json()) as AuthUser;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  // On mount, hydrate the session from the cookie (if any).
  useEffect(() => {
    const token = readCookie(TOKEN_COOKIE);
    if (!token) {
      setIsLoaded(true);
      return;
    }
    fetchMe(token)
      .then((u) => {
        setUser(u);
        setSignedIn(true);
      })
      .catch(() => {
        clearCookie(TOKEN_COOKIE);
      })
      .finally(() => setIsLoaded(true));
  }, []);

  const getToken = useCallback(async () => readCookie(TOKEN_COOKIE), []);

  const applyToken = useCallback(async (token: string) => {
    writeCookie(TOKEN_COOKIE, token);
    const u = await fetchMe(token);
    setUser(u);
    setSignedIn(true);
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const { token } = await post<{ token: string }>('/auth/login', { email, password });
      await applyToken(token);
    },
    [applyToken],
  );

  const signUp = useCallback(
    async (input: SignUpInput) => {
      const { token } = await post<{ token: string }>('/auth/register', input);
      await applyToken(token);
    },
    [applyToken],
  );

  const signOut = useCallback(() => {
    clearCookie(TOKEN_COOKIE);
    setUser(null);
    setSignedIn(false);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ isLoaded, isSignedIn: signedIn, user, getToken, signIn, signUp, signOut }),
    [isLoaded, signedIn, user, getToken, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
