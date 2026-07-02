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

// ── Voices (Day 26): library + tuning + gated cloning ─────────────────────────

export interface VoiceDto {
  id: string;
  provider: string;
  providerVoiceId: string;
  name: string;
  language: string | null;
  gender: string | null;
  age: string | null;
  accent: string | null;
  style: string | null;
  isCloned: boolean;
  approved: boolean;
  isPreset: boolean;
  usable: boolean;
  settings: { stability: number; similarity: number; style: number; pace: number; pitch: number };
  createdAt: string;
}

export interface VoiceFilterParams {
  gender?: string;
  accent?: string;
  age?: string;
  language?: string;
}

export function useVoices(params: VoiceFilterParams = {}) {
  const { getToken } = useAuth();
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v) as [string, string][],
  ).toString();
  return useQuery({
    queryKey: ['voices', params],
    queryFn: () => apiFetch<VoiceDto[]>(getToken, `/voices${qs ? `?${qs}` : ''}`),
  });
}

export function useUpdateVoiceSettings() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; settings: Partial<VoiceDto['settings']> }) =>
      apiFetch<VoiceDto>(getToken, `/voices/${vars.id}/settings`, {
        method: 'PATCH',
        body: JSON.stringify(vars.settings),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['voices'] }),
  });
}

export interface CloneVoiceBody {
  name: string;
  language?: string;
  gender?: string;
  sampleUrls: string[];
  consent: { consentGiven: true; subjectName: string; statement: string };
}

export function useCloneVoice() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CloneVoiceBody) =>
      apiFetch<VoiceDto>(getToken, '/voices/clone', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['voices'] }),
  });
}

export function useApproveVoice() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<VoiceDto>(getToken, `/voices/${id}/approve`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['voices'] }),
  });
}

// ── Squads (Day 27): multi-agent teams ────────────────────────────────────────

export interface SquadListItem {
  id: string;
  name: string;
  memberCount: number;
  updatedAt: string;
}

export interface HandoffRule {
  fromAgentId: string;
  on: string;
  toAgentId: string;
}

export interface SquadDetail {
  id: string;
  name: string;
  description: string | null;
  entryAgentId: string | null;
  handoffRules: HandoffRule[];
  members: Array<{ agentId: string; role: string; order: number }>;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertSquadBody {
  name: string;
  description?: string;
  entryAgentId?: string | null;
  members: Array<{ agentId: string; role: string; order: number }>;
  handoffRules: HandoffRule[];
}

export function useSquads() {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ['squads'],
    queryFn: () => apiFetch<SquadListItem[]>(getToken, '/squads'),
  });
}

export function useSquad(id: string) {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ['squads', id],
    queryFn: () => apiFetch<SquadDetail>(getToken, `/squads/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateSquad() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpsertSquadBody) =>
      apiFetch<SquadDetail>(getToken, '/squads', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['squads'] }),
  });
}

export function useDeleteSquad() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ id: string }>(getToken, `/squads/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['squads'] }),
  });
}

// ── Campaigns (Day 28): bulk outbound ─────────────────────────────────────────

export interface CampaignListItem {
  id: string;
  name: string;
  status: string;
  contactCount: number;
  createdAt: string;
}

export interface CampaignDetail {
  id: string;
  name: string;
  agentId: string;
  status: string;
  schedule: unknown;
  pacing: number;
  concurrency: number;
  retryPolicy: unknown;
  createdAt: string;
}

export interface ImportSummary {
  imported: number;
  invalid: number;
  duplicates: number;
  suppressed: number;
}

export interface MonitorSummary {
  total: number;
  byStatus: Record<string, number>;
}

export function useCampaigns() {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ['campaigns'],
    queryFn: () => apiFetch<CampaignListItem[]>(getToken, '/campaigns'),
  });
}

export function useCampaignMonitor(id: string) {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ['campaigns', id, 'monitor'],
    queryFn: () => apiFetch<MonitorSummary>(getToken, `/campaigns/${id}/monitor`),
    enabled: Boolean(id),
    refetchInterval: 5000, // live monitor
  });
}

export function useCreateCampaign() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; agentId: string; pacing?: number; concurrency?: number }) =>
      apiFetch<CampaignDetail>(getToken, '/campaigns', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
  });
}

export function useImportContacts(campaignId: string) {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      csv: string;
      mapping: { phone: string; name?: string; email?: string };
    }) =>
      apiFetch<ImportSummary>(getToken, `/campaigns/${campaignId}/import`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
  });
}

export function useSetCampaignStatus() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; status: string }) =>
      apiFetch<CampaignDetail>(getToken, `/campaigns/${vars.id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status: vars.status }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
  });
}

// ── Leads (Day 29): scored pipeline ───────────────────────────────────────────

export interface LeadListItem {
  id: string;
  contactId: string;
  contactName: string | null;
  phone: string | null;
  tags: string[];
  status: string;
  score: number;
  pipelineStage: string | null;
  owner: string | null;
  updatedAt: string;
}

export function useLeads(params: { status?: string; stage?: string; owner?: string } = {}) {
  const { getToken } = useAuth();
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v) as [string, string][],
  ).toString();
  return useQuery({
    queryKey: ['leads', params],
    queryFn: () => apiFetch<LeadListItem[]>(getToken, `/leads${qs ? `?${qs}` : ''}`),
  });
}

export function useMoveLeadStage() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; stage: string }) =>
      apiFetch<LeadListItem>(getToken, `/leads/${vars.id}/stage`, {
        method: 'POST',
        body: JSON.stringify({ stage: vars.stage }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads'] }),
  });
}

// ── Experiments (Day 30): A/B testing ─────────────────────────────────────────

export interface ExperimentListItem {
  id: string;
  name: string;
  status: string;
  metric: string;
  variantCount: number;
  updatedAt: string;
}

export interface ExperimentVariant {
  id: string;
  label: string;
  weight: number;
  config: Record<string, string | number | boolean | null>;
}

export interface VariantResultRow {
  variant: string;
  label: string;
  total: number;
  conversions: number;
  rate: number;
  isControl: boolean;
  lift: number;
  pValue: number;
  significant: boolean;
}

export interface ExperimentResults {
  metric: string;
  totalCalls: number;
  rows: VariantResultRow[];
}

export function useExperiments() {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ['experiments'],
    queryFn: () => apiFetch<ExperimentListItem[]>(getToken, '/experiments'),
  });
}

export function useExperimentResults(id: string) {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ['experiments', id, 'results'],
    queryFn: () => apiFetch<ExperimentResults>(getToken, `/experiments/${id}/results`),
    enabled: Boolean(id),
    refetchInterval: 10000,
  });
}

export function useCreateExperiment() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      metric: string;
      variants: Array<{ id: string; label: string; weight: number }>;
    }) =>
      apiFetch<ExperimentListItem>(getToken, '/experiments', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['experiments'] }),
  });
}

export function useSetExperimentStatus() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; status: string }) =>
      apiFetch<ExperimentListItem>(getToken, `/experiments/${vars.id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status: vars.status }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['experiments'] }),
  });
}
