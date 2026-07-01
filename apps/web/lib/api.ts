'use client';

import { useAuth } from '@clerk/nextjs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { messageFromError } from './api-error';

/**
 * Typed API layer for the dashboard. The Clerk session token is attached per request
 * (`Authorization: Bearer`); the active tenant is resolved server-side from the user's
 * membership (TenantGuard), so no un-scoped call is possible. Errors surface only the
 * API's safe message (`messageFromError`).
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

type GetToken = (options?: { template?: string }) => Promise<string | null>;

async function apiFetch<T>(getToken: GetToken, path: string, init?: RequestInit): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  const text = await res.text();
  const data: unknown = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(messageFromError(data));
  return data as T;
}

// ── Types (mirror the api DTOs) ───────────────────────────────────────────────

export interface AgentListItem {
  id: string;
  name: string;
  type: string;
  status: string;
  languages: string[];
  updatedAt: string;
}

export interface AgentDetail extends AgentListItem {
  description: string | null;
  persona: { systemPrompt?: string } | null;
  turnTimeoutMs: number;
  defaultVoiceId: string | null;
  createdAt: string;
}

export interface CostBreakdown {
  stt: number;
  llm: number;
  tts: number;
  telephony: number;
  total: number;
  billable: number;
}

export interface CallListItem {
  id: string;
  direction: string;
  channel: string;
  status: string;
  disposition: string | null;
  durationSec: number | null;
  costBreakdown: CostBreakdown;
  createdAt: string;
  agent: { id: string; name: string };
}

export interface TranscriptSegment {
  speaker: string;
  text: string;
  startMs: number;
  endMs: number;
}

export interface CallDetail extends CallListItem {
  sentiment: number | null;
  recordingUrl: string | null;
  startedAt: string | null;
  endedAt: string | null;
  transcript: { segments: TranscriptSegment[]; summary: string | null; keywords: string[] } | null;
}

export interface AgentInput {
  name: string;
  systemPrompt: string;
  type: string;
  status: string;
  languages: string[];
  turnTimeoutMs: number;
}

export interface OutboundInput {
  agentId: string;
  to: string;
  consentBasis: string;
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function useAgents() {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ['agents'],
    queryFn: () => apiFetch<AgentListItem[]>(getToken, '/agents'),
  });
}

export function useAgent(id: string) {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ['agents', id],
    queryFn: () => apiFetch<AgentDetail>(getToken, `/agents/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateAgent() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AgentInput) =>
      apiFetch<AgentDetail>(getToken, '/agents', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agents'] }),
  });
}

export function useCalls(params: { status?: string; agentId?: string } = {}) {
  const { getToken } = useAuth();
  const search = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v) as [string, string][],
  ).toString();
  return useQuery({
    queryKey: ['calls', params],
    queryFn: () =>
      apiFetch<{ items: CallListItem[]; nextCursor: string | null }>(
        getToken,
        `/calls${search ? `?${search}` : ''}`,
      ),
  });
}

export function useCall(id: string) {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ['calls', id],
    queryFn: () => apiFetch<CallDetail>(getToken, `/calls/${id}`),
    enabled: Boolean(id),
  });
}

export function usePlaceTestCall() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: OutboundInput) =>
      apiFetch<{ callId: string; status: string }>(getToken, '/calls/outbound', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['calls'] }),
  });
}

// ── Builder flow graph ────────────────────────────────────────────────────────

export interface FlowDraft {
  flowId: string;
  versionId: string;
  version: number;
  graph: unknown;
}

export interface KbListItem {
  id: string;
  name: string;
}

export function useKbs() {
  const { getToken } = useAuth();
  return useQuery({ queryKey: ['kb'], queryFn: () => apiFetch<KbListItem[]>(getToken, '/kb') });
}

export interface AgentTemplateDto {
  id: string;
  name: string;
  category: string;
  description: string;
  type: string;
  languages: string[];
  persona: { role: string; tone: string; guardrails: string[]; bannedWords: string[] };
}

export function useTemplates() {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ['templates'],
    queryFn: () => apiFetch<AgentTemplateDto[]>(getToken, '/templates'),
  });
}

export function useCloneTemplate() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; name?: string }) =>
      apiFetch<{ agentId: string; name: string }>(getToken, `/templates/${vars.id}/clone`, {
        method: 'POST',
        body: JSON.stringify(vars.name ? { name: vars.name } : {}),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agents'] }),
  });
}

export function useFlow(agentId: string) {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ['flow', agentId],
    queryFn: () => apiFetch<FlowDraft>(getToken, `/agents/${agentId}/flow`),
    enabled: Boolean(agentId),
    staleTime: Number.POSITIVE_INFINITY, // load once; the canvas owns the live state
  });
}

export function useSaveFlow(agentId: string) {
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: (graph: unknown) =>
      apiFetch<{ versionId: string; version: number; savedAt: string }>(
        getToken,
        `/agents/${agentId}/flow`,
        { method: 'PUT', body: JSON.stringify(graph) },
      ),
  });
}

export function usePublishFlow(agentId: string) {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ publishedVersion: number; nextDraftVersion: number }>(
        getToken,
        `/agents/${agentId}/flow/publish`,
        { method: 'POST' },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['flow-versions', agentId] }),
  });
}

export interface VersionSummary {
  version: number;
  publishedAt: string | null;
  createdAt: string;
  isDraft: boolean;
}

export function useFlowVersions(agentId: string) {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ['flow-versions', agentId],
    queryFn: () => apiFetch<VersionSummary[]>(getToken, `/agents/${agentId}/flow/versions`),
    enabled: Boolean(agentId),
  });
}

export function useRestoreVersion(agentId: string) {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (version: number) =>
      apiFetch<{ restoredFrom: number; draftVersion: number }>(
        getToken,
        `/agents/${agentId}/flow/restore`,
        { method: 'POST', body: JSON.stringify({ version }) },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['flow', agentId] }),
  });
}
