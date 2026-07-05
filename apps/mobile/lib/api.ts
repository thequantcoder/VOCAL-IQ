import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

/**
 * Mobile API client (Day 65). Uses the SAME self-hosted JWT + `x-tenant-id` contract as the web
 * app, so tenant scoping + RBAC are identical on mobile (self-audit B/C). The token is kept in the
 * device secure enclave (Keychain/Keystore) via expo-secure-store — never in plain storage.
 */
const BASE = (Constants.expoConfig?.extra?.apiBaseUrl as string) ?? 'https://api.vocaliq.dev';
const TOKEN_KEY = 'vq_token';
const TENANT_KEY = 'vq_tenant';

export async function setSession(token: string, tenantId?: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  if (tenantId) await SecureStore.setItemAsync(TENANT_KEY, tenantId);
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(TENANT_KEY);
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  const tenant = await SecureStore.getItemAsync(TENANT_KEY);
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(tenant ? { 'x-tenant-id': tenant } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return (await res.json()) as T;
}

// Core operations the app exposes (agents, live calls, Agent Desk transfers).
export const login = (email: string, password: string) =>
  apiFetch<{ token: string }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
export const listAgents = () => apiFetch<{ id: string; name: string }[]>('/agents');
export const liveCalls = () => apiFetch<{ activeCalls: number }>('/analytics/live');
