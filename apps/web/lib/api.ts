'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { messageFromError } from './api-error';
import { useAuth } from './auth';

/**
 * Typed API layer for the dashboard. The self-hosted JWT session token is attached per request
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
  persona: { systemPrompt?: string; bannedWords?: string[] } | null;
  turnTimeoutMs: number;
  maxCallDurationSec: number;
  maxSilenceSec: number;
  endOnVoicemail: boolean;
  bannedWordsAction: 'flag' | 'redact' | 'block';
  keyTerms: string[];
  noVerbatim: boolean;
  defaultVoiceId: string | null;
  memoryEnabled: boolean;
  createdAt: string;
}

export type AgentUpdateBody = Partial<{
  name: string;
  systemPrompt: string;
  memoryEnabled: boolean;
  turnTimeoutMs: number;
  maxCallDurationSec: number;
  maxSilenceSec: number;
  endOnVoicemail: boolean;
  bannedWords: string[];
  bannedWordsAction: 'flag' | 'redact' | 'block';
  keyTerms: string[];
  noVerbatim: boolean;
}>;

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

export interface CallEntity {
  type: string;
  value: string;
}

export interface CallSource {
  chunkId: string;
  kbId: string | null;
  kbName: string | null;
  score: number;
  snippet: string;
}

export interface CallDetail extends CallListItem {
  sentiment: number | null;
  recordingUrl: string | null;
  startedAt: string | null;
  endedAt: string | null;
  transcript: {
    segments: TranscriptSegment[];
    cleanSegments: TranscriptSegment[] | null;
    sources: CallSource[];
    summary: string | null;
    keywords: string[];
    topics: string[];
    entities: CallEntity[];
    sentiment: string | null;
    intelAt: string | null;
  } | null;
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

// ── Agent testing (Day 33): scenarios + eval runs ─────────────────────────────

export interface Assertion {
  type:
    | 'outcome_is'
    | 'visited'
    | 'transcript_includes'
    | 'captured'
    | 'max_turns'
    | 'cost_under'
    | 'llm_rubric';
  value?: string | number;
  nodeId?: string;
  text?: string;
  name?: string;
  prompt?: string;
}

export interface ScenarioDef {
  name: string;
  caller: Array<{ text: string; intent?: string }>;
  assertions: Assertion[];
}

export interface ScenarioRow {
  id: string;
  name: string;
  definition: ScenarioDef;
  updatedAt: string;
}

export interface AssertionResult {
  type: string;
  label: string;
  pass: boolean;
  detail?: string;
}
export interface ScenarioResult {
  name: string;
  outcome: string;
  passed: boolean;
  estCostUsd: number;
  results: AssertionResult[];
}
export interface SuiteReport {
  runId: string;
  total: number;
  passed: number;
  failed: number;
  passRate: number;
  estCostUsd: number;
  scenarios: ScenarioResult[];
}

export function useScenarios(agentId: string) {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ['scenarios', agentId],
    queryFn: () => apiFetch<ScenarioRow[]>(getToken, `/agents/${agentId}/tests/scenarios`),
    enabled: Boolean(agentId),
  });
}

export function useCreateScenario(agentId: string) {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ScenarioDef) =>
      apiFetch<ScenarioRow>(getToken, `/agents/${agentId}/tests/scenarios`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scenarios', agentId] }),
  });
}

export function useDeleteScenario(agentId: string) {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ id: string }>(getToken, `/agents/${agentId}/tests/scenarios/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scenarios', agentId] }),
  });
}

export function useRunSuite(agentId: string) {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (opts: { llm?: boolean } = {}) =>
      apiFetch<SuiteReport>(getToken, `/agents/${agentId}/tests/run`, {
        method: 'POST',
        body: JSON.stringify(opts),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['test-runs', agentId] }),
  });
}

// ── Agent update + Agent Memory (Day 34) ──────────────────────────────────────

export function useUpdateAgent(id: string) {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AgentUpdateBody) =>
      apiFetch<AgentDetail>(getToken, `/agents/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agents', id] });
      qc.invalidateQueries({ queryKey: ['agents'] });
    },
  });
}

export interface MemoryFact {
  key: string;
  value: string;
  kind: string;
}
export interface MemoryDto {
  agentId: string;
  summary: string;
  facts: MemoryFact[];
  lastCallId: string | null;
  updatedAt: string;
}

export function useContactMemory(contactId: string) {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ['memory', contactId],
    queryFn: () => apiFetch<MemoryDto[]>(getToken, `/memory/contact/${contactId}`),
    enabled: Boolean(contactId),
  });
}

export function useEraseContactMemory() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (contactId: string) =>
      apiFetch<{ erased: number }>(getToken, `/memory/contact/${contactId}`, { method: 'DELETE' }),
    onSuccess: (_d, contactId) => qc.invalidateQueries({ queryKey: ['memory', contactId] }),
  });
}

// ── SIP trunks (Day 35): BYO-SIP ──────────────────────────────────────────────

export interface SipTrunkDto {
  id: string;
  name: string;
  providerTemplate: string;
  host: string;
  port: number;
  transport: string;
  inbound: boolean;
  outbound: boolean;
  concurrencyLimit: number;
  authUsernameMasked: string;
  hasCredentials: boolean;
  createdAt: string;
}

export interface SipTrunkCreateInput {
  providerTemplate: string;
  name: string;
  host?: string;
  port?: number;
  transport?: string;
  inbound: boolean;
  outbound: boolean;
  concurrencyLimit: number;
  credentials: { authUsername: string; authPassword: string; sipDomain?: string };
}

export function useSipTrunks() {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ['sip'],
    queryFn: () => apiFetch<SipTrunkDto[]>(getToken, '/sip'),
  });
}

export function useCreateSipTrunk() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SipTrunkCreateInput) =>
      apiFetch<SipTrunkDto>(getToken, '/sip', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sip'] }),
  });
}

export function useUpdateSipTrunk() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      id: string;
      body: Partial<Pick<SipTrunkDto, 'inbound' | 'outbound' | 'concurrencyLimit' | 'name'>>;
    }) =>
      apiFetch<SipTrunkDto>(getToken, `/sip/${vars.id}`, {
        method: 'PATCH',
        body: JSON.stringify(vars.body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sip'] }),
  });
}

export function useDeleteSipTrunk() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ id: string }>(getToken, `/sip/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sip'] }),
  });
}

// ── Appointments (Day 36) ─────────────────────────────────────────────────────

export interface AppointmentDto {
  id: string;
  contactId: string;
  contactName: string | null;
  startsAt: string;
  endsAt: string;
  status: string;
  calendarProvider: string | null;
  externalEventId: string | null;
  createdAt: string;
}

export interface AppointmentStats {
  booked: number;
  rescheduled: number;
  completed: number;
  cancelled: number;
  upcoming: number;
}

export function useAppointments(status?: string) {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ['appointments', status ?? 'all'],
    queryFn: () =>
      apiFetch<AppointmentDto[]>(getToken, `/appointments${status ? `?status=${status}` : ''}`),
  });
}

export function useAppointmentStats() {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ['appointments', 'stats'],
    queryFn: () => apiFetch<AppointmentStats>(getToken, '/appointments/stats'),
  });
}

export function useBookAppointment() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { contactId: string; startsAt: string; endsAt: string }) =>
      apiFetch<AppointmentDto>(getToken, '/appointments', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['appointments'] }),
  });
}

export function useSetAppointmentStatus() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; status: string }) =>
      apiFetch<AppointmentDto>(getToken, `/appointments/${vars.id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status: vars.status }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['appointments'] }),
  });
}

// ── Forms (Day 37) ────────────────────────────────────────────────────────────

export type FormFieldType =
  | 'text'
  | 'textarea'
  | 'email'
  | 'phone'
  | 'number'
  | 'select'
  | 'date'
  | 'checkbox';

export interface FormFieldDto {
  key: string;
  label: string;
  type: FormFieldType;
  required?: boolean;
  options?: string[];
}

export interface FormRoutingDto {
  webhookUrl?: string;
  sheetId?: string;
  triggerAgentId?: string;
}

export interface FormDto {
  id: string;
  name: string;
  fields: FormFieldDto[];
  routing: FormRoutingDto;
  active: boolean;
  submissionCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface FormSubmissionDto {
  id: string;
  values: Record<string, string>;
  synced: boolean;
  createdAt: string;
}

export interface FormConfigInput {
  name: string;
  fields: FormFieldDto[];
  routing?: FormRoutingDto;
}

export function useForms() {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ['forms'],
    queryFn: () => apiFetch<FormDto[]>(getToken, '/forms'),
  });
}

export function useFormSubmissions(id: string | null) {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ['forms', id, 'submissions'],
    enabled: !!id,
    queryFn: () => apiFetch<FormSubmissionDto[]>(getToken, `/forms/${id}/submissions`),
  });
}

export function useCreateForm() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: FormConfigInput) =>
      apiFetch<FormDto>(getToken, '/forms', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['forms'] }),
  });
}

export function useUpdateForm() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; body: FormConfigInput }) =>
      apiFetch<FormDto>(getToken, `/forms/${vars.id}`, {
        method: 'PUT',
        body: JSON.stringify(vars.body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['forms'] }),
  });
}

export function useSetFormActive() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; active: boolean }) =>
      apiFetch<FormDto>(getToken, `/forms/${vars.id}/active`, {
        method: 'POST',
        body: JSON.stringify({ active: vars.active }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['forms'] }),
  });
}

export function useDeleteForm() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ id: string }>(getToken, `/forms/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['forms'] }),
  });
}

// ── Platform key pool (Day 38, super-admin) ───────────────────────────────────

export interface KeyPoolDto {
  id: string;
  provider: string;
  label: string | null;
  weight: number;
  active: boolean;
  failureCount: number;
  ejected: boolean;
  lastUsedAt: string | null;
}

export function useKeyPool() {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ['key-pool'],
    queryFn: () => apiFetch<KeyPoolDto[]>(getToken, '/admin/key-pool'),
  });
}

export function useAddPoolKey() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { provider: string; apiKey: string; weight?: number; label?: string }) =>
      apiFetch<KeyPoolDto>(getToken, '/admin/key-pool', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['key-pool'] }),
  });
}

export function useSetPoolKeyActive() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; active: boolean }) =>
      apiFetch<{ id: string; active: boolean }>(getToken, `/admin/key-pool/${vars.id}/active`, {
        method: 'POST',
        body: JSON.stringify({ active: vars.active }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['key-pool'] }),
  });
}

export function useDeletePoolKey() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ id: string }>(getToken, `/admin/key-pool/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['key-pool'] }),
  });
}

// ── Integrations (Day 40) ─────────────────────────────────────────────────────

export interface ConnectorCatalogItem {
  type: string;
  label: string;
  capabilities: { contacts: boolean; tickets: boolean };
  implemented: boolean;
}

export interface IntegrationDto {
  id: string;
  type: string;
  label: string;
  ticketOnNegative: boolean;
  settings: Record<string, string>;
  createdAt: string;
}

export function useIntegrationCatalog() {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ['integrations', 'catalog'],
    queryFn: () => apiFetch<ConnectorCatalogItem[]>(getToken, '/integrations/catalog'),
  });
}

export function useIntegrations() {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ['integrations'],
    queryFn: () => apiFetch<IntegrationDto[]>(getToken, '/integrations'),
  });
}

export function useConnectIntegration() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      type: string;
      accessToken: string;
      ticketOnNegative?: boolean;
      settings?: Record<string, string>;
    }) =>
      apiFetch<IntegrationDto>(getToken, '/integrations', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['integrations'] }),
  });
}

export function useTestIntegration() {
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ ok: boolean }>(getToken, `/integrations/${id}/test`, { method: 'POST' }),
  });
}

export function useDisconnectIntegration() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ id: string }>(getToken, `/integrations/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['integrations'] }),
  });
}

// ── Analytics (Day 41) ────────────────────────────────────────────────────────

export interface LiveSnapshot {
  activeCalls: number;
  minutesToday: number;
  spendTodayUsd: number;
  callsToday: number;
  successRateToday: number;
}

export interface DayPoint {
  day: string;
  value: number;
}

export interface HistoricalAnalytics {
  from: string;
  to: string;
  totalCalls: number;
  totalMinutes: number;
  successRate: number;
  outcomes: Record<string, number>;
  sentimentTrend: DayPoint[];
  costByDay: DayPoint[];
  callsByDay: DayPoint[];
  talkListen: { agentMs: number; callerMs: number; agentRatio: number };
  avgInterruptions: number;
  dropOffRate: number;
}

export interface BudgetAlert {
  metric: 'daily' | 'monthly' | 'anomaly';
  level: 'ok' | 'warn' | 'critical';
  message: string;
}

export interface BudgetStatus {
  todaySpendUsd: number;
  monthSpendUsd: number;
  dailyPct: number | null;
  monthlyPct: number | null;
  anomaly: boolean;
  alerts: BudgetAlert[];
}

export function useLiveAnalytics() {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ['analytics', 'live'],
    queryFn: () => apiFetch<LiveSnapshot>(getToken, '/analytics/live'),
    refetchInterval: 10_000, // poll for the real-time tiles (no Socket.IO in the self-hosted stack)
  });
}

export function useHistoricalAnalytics(params: { from: string; to: string; agentId?: string }) {
  const { getToken } = useAuth();
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v) as [string, string][],
  ).toString();
  return useQuery({
    queryKey: ['analytics', 'historical', params],
    queryFn: () => apiFetch<HistoricalAnalytics>(getToken, `/analytics/historical?${qs}`),
  });
}

export function useBudget() {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ['analytics', 'budget'],
    queryFn: () => apiFetch<BudgetStatus>(getToken, '/analytics/budget'),
  });
}

// ── Transcript search (Day 42) ─────────────────────────────────────────────────

export type SearchMode = 'keyword' | 'semantic' | 'hybrid';

export interface SearchHit {
  callId: string;
  agentId: string | null;
  createdAt: string;
  score: number;
  snippet: string;
  startMs: number;
}

export function useTranscriptSearch(params: {
  q: string;
  mode?: SearchMode;
  agentId?: string;
  enabled?: boolean;
}) {
  const { getToken } = useAuth();
  const q = params.q.trim();
  const qs = new URLSearchParams({ q });
  if (params.mode) qs.set('mode', params.mode);
  if (params.agentId) qs.set('agentId', params.agentId);
  return useQuery({
    queryKey: ['search', 'transcripts', params.mode ?? 'hybrid', params.agentId ?? '', q],
    queryFn: () => apiFetch<SearchHit[]>(getToken, `/search/transcripts?${qs.toString()}`),
    enabled: (params.enabled ?? true) && q.length > 0,
  });
}

export function useReindexTranscripts() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ indexed: number }>(getToken, '/search/reindex', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['search'] }),
  });
}

// ── QA scoring (Day 43) ────────────────────────────────────────────────────────

export interface QaCriterion {
  key: string;
  description: string;
  weight: number;
}

export interface QaRubric {
  id: string;
  name: string;
  criteria: QaCriterion[];
  samplingRate: number;
  active: boolean;
  agentId: string | null;
  updatedAt: string;
}

export interface QaCriterionScore {
  key: string;
  score: number;
  weight: number;
  reason: string;
}

export interface QaScore {
  id: string;
  callId: string;
  rubricId: string;
  overall: number;
  criteria: QaCriterionScore[];
  model: string;
  createdAt: string;
}

export interface QaCriterionAggregate {
  key: string;
  avgScore: number;
  count: number;
}

export interface QaRubricAggregate {
  rubricId: string;
  avgOverall: number;
  count: number;
  criteria: QaCriterionAggregate[];
}

export interface QaRubricInput {
  name: string;
  criteria: QaCriterion[];
  samplingRate: number;
  agentId?: string | null;
  active?: boolean;
}

export function useQaRubrics() {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ['qa', 'rubrics'],
    queryFn: () => apiFetch<QaRubric[]>(getToken, '/qa/rubrics'),
  });
}

export function useCreateQaRubric() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: QaRubricInput) =>
      apiFetch<QaRubric>(getToken, '/qa/rubrics', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['qa'] }),
  });
}

export function useUpdateQaRubric() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; body: Partial<QaRubricInput> }) =>
      apiFetch<QaRubric>(getToken, `/qa/rubrics/${vars.id}`, {
        method: 'PATCH',
        body: JSON.stringify(vars.body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['qa'] }),
  });
}

export function useDeleteQaRubric() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ deleted: true }>(getToken, `/qa/rubrics/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['qa'] }),
  });
}

export function useQaAggregate(params: { from?: string; to?: string; agentId?: string } = {}) {
  const { getToken } = useAuth();
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v) as [string, string][],
  ).toString();
  return useQuery({
    queryKey: ['qa', 'aggregate', params],
    queryFn: () => apiFetch<QaRubricAggregate[]>(getToken, `/qa/aggregate${qs ? `?${qs}` : ''}`),
  });
}

export function useCallQaScores(callId: string) {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ['qa', 'scores', callId],
    queryFn: () => apiFetch<QaScore[]>(getToken, `/qa/calls/${callId}/scores`),
    enabled: Boolean(callId),
  });
}

export function useScoreCallNow(callId: string) {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<QaScore[]>(getToken, `/qa/calls/${callId}/score`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['qa', 'scores', callId] }),
  });
}

// ── Messaging (Day 44) ─────────────────────────────────────────────────────────

export type MessageChannel = 'WHATSAPP' | 'SMS';

export interface MessageTemplate {
  id: string;
  channel: MessageChannel;
  name: string;
  language: string;
  category: string;
  body: string;
  variables: string[];
  approvalStatus: string;
  active: boolean;
  updatedAt: string;
}

export interface MessageRow {
  id: string;
  channel: MessageChannel;
  direction: string;
  status: string;
  toAddr: string;
  body: string;
  costUsd: number;
  error: string | null;
  createdAt: string;
}

export interface MessageTemplateInput {
  channel: MessageChannel;
  name: string;
  language: string;
  category: string;
  body: string;
  active: boolean;
}

export interface SendMessageInput {
  channel: MessageChannel;
  to: string;
  templateId?: string;
  body?: string;
  variables?: Record<string, string>;
}

export function useMessageTemplates() {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ['messaging', 'templates'],
    queryFn: () => apiFetch<MessageTemplate[]>(getToken, '/messaging/templates'),
  });
}

export function useCreateMessageTemplate() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: MessageTemplateInput) =>
      apiFetch<MessageTemplate>(getToken, '/messaging/templates', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['messaging'] }),
  });
}

export function useDeleteMessageTemplate() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ deleted: true }>(getToken, `/messaging/templates/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['messaging'] }),
  });
}

export function useMessages() {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ['messaging', 'messages'],
    queryFn: () => apiFetch<MessageRow[]>(getToken, '/messaging/messages'),
  });
}

export function useSendMessage() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SendMessageInput) =>
      apiFetch<MessageRow>(getToken, '/messaging/send', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['messaging', 'messages'] }),
  });
}

// ── Multimodal chat (Day 45) ───────────────────────────────────────────────────

export type ChatChannel = 'VOICE' | 'CHAT' | 'WHATSAPP' | 'SMS';

export interface ChatMessage {
  role: 'agent' | 'user';
  text: string;
}

export interface ChatState {
  channel: ChatChannel;
  activeNode: string;
  captured: Record<string, string>;
  lastIntent?: string;
  turns: number;
  awaitingInput: boolean;
  done: boolean;
  outcome?: string;
}

export interface ChatAdvance {
  state: ChatState;
  messages: ChatMessage[];
  awaitingInput: boolean;
  done: boolean;
  outcome?: string;
}

export function useStartChat(agentId: string) {
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: (channel: ChatChannel) =>
      apiFetch<ChatAdvance>(getToken, `/agents/${agentId}/chat/start`, {
        method: 'POST',
        body: JSON.stringify({ channel }),
      }),
  });
}

export function useChatTurn(agentId: string) {
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: (vars: { state: ChatState; message: string; intent?: string }) =>
      apiFetch<ChatAdvance>(getToken, `/agents/${agentId}/chat/turn`, {
        method: 'POST',
        body: JSON.stringify(vars),
      }),
  });
}

// ── MCP / tool servers (Day 46) ────────────────────────────────────────────────

export type TrustContext = 'LOW' | 'HIGH' | 'UNKNOWN';

export interface McpTool {
  name: string;
  description?: string;
  readOnly?: boolean;
  destructive?: boolean;
}

export interface McpServer {
  id: string;
  name: string;
  url: string;
  transport: string;
  trustContext: TrustContext;
  timeoutMs: number;
  agentId: string | null;
  active: boolean;
  tools: McpTool[];
  hasAuth: boolean;
  updatedAt: string;
}

export interface McpServerInput {
  name: string;
  url: string;
  transport?: 'http' | 'sse';
  trustContext: TrustContext;
  timeoutMs?: number;
  authHeader?: string;
}

export function useMcpServers() {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ['mcp', 'servers'],
    queryFn: () => apiFetch<McpServer[]>(getToken, '/mcp/servers'),
  });
}

export function useRegisterMcpServer() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: McpServerInput) =>
      apiFetch<McpServer>(getToken, '/mcp/servers', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mcp'] }),
  });
}

export function useDeleteMcpServer() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ deleted: true }>(getToken, `/mcp/servers/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mcp'] }),
  });
}

export function useDiscoverMcpTools() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<McpTool[]>(getToken, `/mcp/servers/${id}/discover`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mcp'] }),
  });
}

// ── Automations (Day 47) ───────────────────────────────────────────────────────

export type AutomationEventType = 'call_ended' | 'disposition_set' | 'lead_status_changed';
export type ActionType = 'send_message' | 'crm_sync' | 'webhook' | 'task' | 'notify';

export type AutomationAction =
  | { type: 'send_message'; channel: 'WHATSAPP' | 'SMS'; templateId?: string; body?: string }
  | { type: 'crm_sync' }
  | { type: 'webhook'; url: string }
  | { type: 'task'; title: string }
  | { type: 'notify'; message: string };

export interface Automation {
  id: string;
  name: string;
  event: string;
  filters: { disposition?: string; leadStatus?: string; agentId?: string };
  actions: AutomationAction[];
  active: boolean;
  updatedAt: string;
}

export interface AutomationInput {
  name: string;
  trigger: {
    event: AutomationEventType;
    filters?: { disposition?: string; leadStatus?: string; agentId?: string };
  };
  actions: AutomationAction[];
  active: boolean;
}

export function useAutomations() {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ['automations'],
    queryFn: () => apiFetch<Automation[]>(getToken, '/automations'),
  });
}

export function useCreateAutomation() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AutomationInput) =>
      apiFetch<Automation>(getToken, '/automations', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automations'] }),
  });
}

export function useSetAutomationActive() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; active: boolean }) =>
      apiFetch<Automation>(getToken, `/automations/${vars.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: vars.active }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automations'] }),
  });
}

export function useDeleteAutomation() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ deleted: true }>(getToken, `/automations/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automations'] }),
  });
}

// ── Developer platform: API keys + webhooks (Day 48) ────────────────────────────

export const API_SCOPES = [
  'agents:read',
  'calls:read',
  'calls:write',
  'leads:read',
  'campaigns:read',
] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  rateLimitPerMin: number;
  requestCount: number;
  lastUsedAt: string | null;
  revoked: boolean;
  createdAt: string;
}

export interface CreatedApiKey extends ApiKey {
  key: string; // shown once
}

export interface Webhook {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  createdAt: string;
}

export interface CreatedWebhook extends Webhook {
  secret: string; // shown once
}

export function useApiKeys() {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ['api-keys'],
    queryFn: () => apiFetch<ApiKey[]>(getToken, '/api-keys'),
  });
}

export function useCreateApiKey() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; scopes: ApiScope[]; rateLimitPerMin?: number }) =>
      apiFetch<CreatedApiKey>(getToken, '/api-keys', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-keys'] }),
  });
}

export function useRevokeApiKey() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<ApiKey>(getToken, `/api-keys/${id}/revoke`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-keys'] }),
  });
}

export function useWebhooks() {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ['webhooks'],
    queryFn: () => apiFetch<Webhook[]>(getToken, '/webhooks'),
  });
}

export function useWebhookEvents() {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ['webhooks', 'events'],
    queryFn: () => apiFetch<string[]>(getToken, '/webhooks/events'),
  });
}

export function useCreateWebhook() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { url: string; events: string[] }) =>
      apiFetch<CreatedWebhook>(getToken, '/webhooks', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['webhooks'] }),
  });
}

export function useDeleteWebhook() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ deleted: true }>(getToken, `/webhooks/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['webhooks'] }),
  });
}

// ── SaaS ops toolkit: support + credits (Day 49) ────────────────────────────────

export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'WAITING' | 'RESOLVED' | 'CLOSED';

export interface SupportTicket {
  id: string;
  subject: string;
  body: string;
  status: TicketStatus;
  priority: string;
  assignee: string | null;
  createdAt: string;
}

export interface Wallet {
  prepaidCents: number;
  bonusCents: number;
  totalCents: number;
}

export function useTickets() {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ['tickets'],
    queryFn: () => apiFetch<SupportTicket[]>(getToken, '/ops/tickets'),
  });
}

export function useCreateTicket() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { subject: string; body: string; priority?: string }) =>
      apiFetch<SupportTicket>(getToken, '/ops/tickets', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tickets'] }),
  });
}

export function useSetTicketStatus() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; status: TicketStatus }) =>
      apiFetch<SupportTicket>(getToken, `/ops/tickets/${vars.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: vars.status }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tickets'] }),
  });
}

export function useWallet() {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ['wallet'],
    queryFn: () => apiFetch<Wallet>(getToken, '/ops/credits'),
  });
}

export interface PhoneNumberRow {
  id: string;
  e164: string;
  kycVerified: boolean;
  source: string;
  assignedAgentId: string | null;
}

export function useNumbers() {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ['numbers'],
    queryFn: () =>
      apiFetch<{ owned: PhoneNumberRow[]; available: PhoneNumberRow[] }>(getToken, '/ops/numbers'),
  });
}

// ── Reseller: sub-tenant provisioning (Day 51) ──────────────────────────────────

export interface SubTenant {
  id: string;
  name: string;
  slug: string;
  type: string;
  status: string;
  parentTenantId: string | null;
  createdAt: string;
}

export function useSubTenants() {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ['reseller', 'sub-tenants'],
    queryFn: () => apiFetch<SubTenant[]>(getToken, '/reseller/sub-tenants'),
  });
}

export function useCreateSubTenant() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; ownerEmail: string; ownerName?: string; status?: string }) =>
      apiFetch<SubTenant>(getToken, '/reseller/sub-tenants', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reseller'] }),
  });
}

export function useSetSubTenantStatus() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; action: 'suspend' | 'reactivate' }) =>
      apiFetch<{ affected: number; status: string }>(
        getToken,
        `/reseller/sub-tenants/${vars.id}/${vars.action}`,
        { method: 'POST' },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reseller'] }),
  });
}

// ── White-label: branding + custom domains (Day 52) ─────────────────────────────

export interface Branding {
  name?: string;
  logoUrl?: string;
  faviconUrl?: string;
  primaryColor?: string;
  accentColor?: string;
  hidePlatformName: boolean;
}

export interface DomainConfig {
  hostname: string;
  status: 'pending' | 'pending_validation' | 'active' | 'failed';
  cnameTarget: string;
  sslStatus?: string;
  cloudflareId?: string;
}

export function useBranding() {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ['branding'],
    queryFn: () => apiFetch<Branding>(getToken, '/whitelabel/branding'),
  });
}

export function useSetBranding() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Branding>) =>
      apiFetch<Branding>(getToken, '/whitelabel/branding', {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['branding'] }),
  });
}

export function useDomain() {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ['domain'],
    queryFn: () => apiFetch<DomainConfig | null>(getToken, '/whitelabel/domain'),
  });
}

export function useProvisionDomain() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (hostname: string) =>
      apiFetch<DomainConfig>(getToken, '/whitelabel/domain', {
        method: 'POST',
        body: JSON.stringify({ hostname }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['domain'] }),
  });
}

export function useRefreshDomain() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<DomainConfig | null>(getToken, '/whitelabel/domain/refresh', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['domain'] }),
  });
}

export function useRemoveDomain() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ removed: true }>(getToken, '/whitelabel/domain', { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['domain'] }),
  });
}

// ── Wallet + margin engine (Day 53) ─────────────────────────────────────────────

export interface WalletDetail {
  balanceCents: number;
  bonusCents: number;
  currency: string;
  ledgerSumCents: number;
  reconciled: boolean;
}

export interface PeriodMargin {
  revenueCents: number;
  costCents: number;
  marginCents: number;
}

export function useWalletDetail() {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ['wallet-detail'],
    queryFn: () => apiFetch<WalletDetail>(getToken, '/wallet'),
  });
}

export function useTopUp() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { amountCents: number; key: string }) =>
      apiFetch<WalletDetail>(getToken, '/wallet/topup', {
        method: 'POST',
        body: JSON.stringify(vars),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wallet-detail'] }),
  });
}

export function useMarginReconcile(period: string) {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ['wallet', 'reconcile', period],
    queryFn: () => apiFetch<PeriodMargin>(getToken, `/wallet/reconcile?period=${period}`),
    enabled: /^\d{4}-\d{2}$/.test(period),
  });
}

// ── Reseller portal dashboards + markup (Day 54) ────────────────────────────────

export interface ResellerClientMargin {
  childTenantId: string;
  name?: string;
  revenueCents: number;
  costCents: number;
  marginCents: number;
}

export interface ResellerOverview {
  period: string;
  totalRevenueCents: number;
  totalCostCents: number;
  totalMarginCents: number;
  marginRate: number;
  clientCount: number;
  topClients: ResellerClientMargin[];
}

export function useResellerOverview(period: string) {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ['reseller', 'overview', period],
    queryFn: () => apiFetch<ResellerOverview>(getToken, `/reseller/overview?period=${period}`),
    enabled: /^\d{4}-\d{2}$/.test(period),
  });
}

export function useResellerMarkup() {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ['reseller', 'markup'],
    queryFn: () => apiFetch<{ markupBps: number }>(getToken, '/reseller/markup'),
  });
}

export function useSetResellerMarkup() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (markupBps: number) =>
      apiFetch<{ markupBps: number }>(getToken, '/reseller/markup', {
        method: 'PUT',
        body: JSON.stringify({ markupBps }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reseller'] }),
  });
}

// ── Super-admin console (Day 55) ────────────────────────────────────────────────

export interface AdminTenantRow {
  id: string;
  name: string;
  slug: string;
  type: string;
  status: string;
  parentTenantId: string | null;
  createdAt: string;
}

export interface PlatformOverview {
  period: string;
  grossRevenueCents: number;
  providerCostCents: number;
  totalMarginCents: number;
  marginRate: number;
  tenants: {
    total: number;
    resellers: number;
    customers: number;
    active: number;
    suspended: number;
    trial: number;
  };
}

export interface ServiceHealth {
  name: string;
  status: 'ok' | 'degraded' | 'down';
  detail: string;
}

export interface ImpersonationGrant {
  token: string;
  tenantId: string;
  expiresInSeconds: number;
}

export function useAdminTenants(params: { query?: string; type?: string; status?: string }) {
  const { getToken } = useAuth();
  const qs = new URLSearchParams();
  if (params.query) qs.set('query', params.query);
  if (params.type) qs.set('type', params.type);
  if (params.status) qs.set('status', params.status);
  return useQuery({
    queryKey: ['admin', 'tenants', params],
    queryFn: () =>
      apiFetch<{ items: AdminTenantRow[]; total: number; page: number; pageSize: number }>(
        getToken,
        `/admin/superadmin/tenants?${qs.toString()}`,
      ),
  });
}

export function useAdminOverview(period: string) {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ['admin', 'overview', period],
    queryFn: () =>
      apiFetch<PlatformOverview>(getToken, `/admin/superadmin/overview?period=${period}`),
    enabled: /^\d{4}-\d{2}$/.test(period),
  });
}

export function useAdminHealth() {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ['admin', 'health'],
    queryFn: () =>
      apiFetch<{ overall: string; services: ServiceHealth[] }>(
        getToken,
        '/admin/superadmin/health',
      ),
    refetchInterval: 30_000,
  });
}

export function useSetAdminTenantStatus() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; action: 'suspend' | 'reactivate' }) =>
      apiFetch<AdminTenantRow>(getToken, `/admin/superadmin/tenants/${vars.id}/${vars.action}`, {
        method: 'POST',
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin'] }),
  });
}

export function useImpersonate() {
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: (vars: { tenantId: string; reason: string }) =>
      apiFetch<ImpersonationGrant>(getToken, '/admin/superadmin/impersonate', {
        method: 'POST',
        body: JSON.stringify(vars),
      }),
  });
}
