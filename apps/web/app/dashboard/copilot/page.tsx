'use client';

import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@vocaliq/ui';
import { CheckCircle2, Info, Send, Swords } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { EmptyState, LoadingCard } from '../../../components/states';
import { StatusBadge } from '../../../components/ui-bits';
import {
  type AssistResult,
  type CopilotSession,
  type CopilotTurn,
  useConfirmCrm,
  useCopilotAssist,
  useCopilotSessions,
  useEndCopilotSession,
  useStartCopilotSession,
} from '../../../lib/api';
import { useI18n } from '../../../lib/i18n/provider';

/**
 * Live Call Co-Pilot (Day 90) — the standalone product for human sales teams. A rep runs a session on
 * their own live call; the co-pilot surfaces battlecards + objection handling live (agent-only, never
 * spoken to the caller) and drafts CRM notes after. No VocalIQ agent required.
 */
export default function CopilotPage() {
  const { t } = useI18n();
  const sessions = useCopilotSessions();
  const start = useStartCopilotSession();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [form, setForm] = useState({ title: '', contactName: '', company: '' });

  const active = activeId ? (sessions.data?.find((s) => s.id === activeId) ?? null) : null;

  if (activeId && active) {
    return <SessionWorkspace session={active} onBack={() => setActiveId(null)} />;
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 font-display font-semibold text-vq-text-hi text-xl">
          <Swords size={20} /> {t('Live Co-Pilot')}
        </h1>
        <p className="text-sm text-vq-text-lo">
          {t(
            'An AI wingman on your own sales calls — live battlecards, objection handling, and next-best action, then auto-drafted CRM notes. Works on any call; no AI agent needed.',
          )}
        </p>
      </div>

      <p className="flex items-start gap-2 rounded-vq border border-vq-border bg-vq-surface/40 p-3 text-vq-text-lo text-xs">
        <Info size={14} className="mt-0.5 shrink-0" />{' '}
        {t(
          'Everything the co-pilot suggests is shown only on your screen — it is never spoken or read to the caller.',
        )}
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('Start a session')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Input
              placeholder={t('Title (e.g. Globex cold call)')}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
            <Input
              placeholder={t('Contact name')}
              value={form.contactName}
              onChange={(e) => setForm({ ...form, contactName: e.target.value })}
            />
            <Input
              placeholder={t('Company')}
              value={form.company}
              onChange={(e) => setForm({ ...form, company: e.target.value })}
            />
          </div>
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              disabled={start.isPending}
              onClick={() =>
                start.mutate(
                  {
                    ...(form.title ? { title: form.title } : {}),
                    ...(form.contactName ? { contactName: form.contactName } : {}),
                    ...(form.company ? { company: form.company } : {}),
                  },
                  {
                    onSuccess: (s) => {
                      setActiveId(s.id);
                      setForm({ title: '', contactName: '', company: '' });
                    },
                  },
                )
              }
            >
              {start.isPending ? t('Starting…') : t('Start call')}
            </Button>
            <Link
              href="/dashboard/settings/battlecards"
              className="text-vq-accent text-xs hover:underline"
            >
              {t('Manage battlecards →')}
            </Link>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        <h2 className="font-medium text-sm text-vq-text-hi">{t('Recent sessions')}</h2>
        {sessions.isLoading ? (
          <LoadingCard rows={2} />
        ) : !sessions.data || sessions.data.length === 0 ? (
          <EmptyState
            title={t('No sessions yet')}
            hint={t('Start a call to see your co-pilot in action.')}
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {sessions.data.map((s) => (
              <li key={s.id}>
                <Card className="flex flex-row items-center justify-between px-4 py-3">
                  <div className="flex flex-col">
                    <span className="font-medium text-sm text-vq-text-hi">
                      {s.title || s.contactName || t('Untitled call')}
                    </span>
                    <span className="text-vq-text-lo text-xs">
                      {s.company ? `${s.company} · ` : ''}
                      {new Date(s.createdAt).toLocaleString()}
                      {s.crmConfirmed ? ` · ${t('CRM saved')}` : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={s.status} />
                    <Button size="sm" variant="secondary" onClick={() => setActiveId(s.id)}>
                      {s.status === 'live' ? t('Resume') : t('View')}
                    </Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** The live workspace for one session: transcript entry + live suggestions, then the CRM draft. */
function SessionWorkspace({ session, onBack }: { session: CopilotSession; onBack: () => void }) {
  const { t } = useI18n();
  const assist = useCopilotAssist(session.id);
  const end = useEndCopilotSession(session.id);
  const [callerLine, setCallerLine] = useState('');
  const [repLine, setRepLine] = useState('');
  const [transcript, setTranscript] = useState<CopilotTurn[]>(session.turns ?? []);
  const [result, setResult] = useState<AssistResult | null>(null);
  const ended = session.status !== 'live' || end.isSuccess;

  function sendTurns() {
    const turns: CopilotTurn[] = [];
    if (repLine.trim()) turns.push({ role: 'agent', text: repLine.trim() });
    if (callerLine.trim()) turns.push({ role: 'caller', text: callerLine.trim() });
    if (turns.length === 0) return;
    assist.mutate(
      { turns },
      {
        onSuccess: (r) => {
          setResult(r);
          setTranscript((t) => [...t, ...turns]);
          setCallerLine('');
          setRepLine('');
        },
      },
    );
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <button
        type="button"
        onClick={onBack}
        className="w-fit text-sm text-vq-text-lo hover:text-vq-text-hi"
      >
        {t('← All sessions')}
      </button>
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 font-display font-semibold text-lg text-vq-text-hi">
          <Swords size={18} /> {session.title || session.contactName || t('Live call')}
        </h1>
        <StatusBadge status={ended ? 'ended' : 'live'} />
      </div>

      {ended ? (
        <CrmPanel session={session} endedResult={end.data} />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Left: transcript entry */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('Live transcript')}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex max-h-56 flex-col gap-1 overflow-y-auto text-sm">
                {transcript.length === 0 ? (
                  <p className="text-vq-text-lo text-xs">
                    {t('Enter what the caller (and you) said to get live suggestions.')}
                  </p>
                ) : (
                  transcript.map((turn, i) => (
                    <p
                      key={`${i}-${turn.text.slice(0, 8)}`}
                      className={turn.role === 'caller' ? 'text-vq-text-hi' : 'text-vq-text-lo'}
                    >
                      <span className="font-medium">
                        {turn.role === 'caller' ? t('Caller') : t('You')}:
                      </span>{' '}
                      {turn.text}
                    </p>
                  ))
                )}
              </div>
              <Input
                placeholder={t('What the caller just said')}
                value={callerLine}
                onChange={(e) => setCallerLine(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendTurns()}
              />
              <Input
                placeholder={t('What you said (optional)')}
                value={repLine}
                onChange={(e) => setRepLine(e.target.value)}
              />
              <div className="flex items-center gap-3">
                <Button size="sm" disabled={assist.isPending} onClick={sendTurns}>
                  <Send size={15} /> {assist.isPending ? t('Thinking…') : t('Get suggestions')}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={end.isPending}
                  onClick={() => end.mutate({ durationSec: 0 })}
                >
                  {end.isPending ? t('Ending…') : t('End call & draft CRM')}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Right: live suggestions + battlecards */}
          <div className="flex flex-col gap-4">
            {result?.battlecards && result.battlecards.length > 0 && (
              <Card className="border-vq-accent/40">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Swords size={16} className="text-vq-accent" /> {t('Battlecards')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  {result.battlecards.map((c) => (
                    <div key={c.id} className="rounded-vq border border-vq-border p-3">
                      <p className="font-medium text-sm text-vq-text-hi">
                        {t('vs {name}', { name: c.competitor })}
                      </p>
                      <ul className="mt-1 list-disc pl-4 text-sm text-vq-text-lo">
                        {c.talkingPoints.map((p) => (
                          <li key={p}>{p}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('Suggestions')}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {!result ? (
                  <p className="text-vq-text-lo text-xs">
                    {t('Suggestions appear here as the call goes.')}
                  </p>
                ) : (
                  result.suggestions.map((s, i) => (
                    <div
                      key={`${s.kind}-${i}`}
                      className="rounded-vq border border-vq-border p-2.5"
                    >
                      <p className="font-medium text-vq-text-hi text-xs uppercase tracking-wide">
                        {s.title}
                      </p>
                      <p className="mt-0.5 text-sm text-vq-text-lo">{s.body}</p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

/** Post-call CRM draft: the AI fills it, the human edits + confirms (the only path that saves). */
function CrmPanel({
  session,
  endedResult,
}: {
  session: CopilotSession;
  endedResult?: CopilotSession;
}) {
  const { t } = useI18n();
  const current = endedResult ?? session;
  const confirm = useConfirmCrm(session.id);
  const draft = current.crmDraft;
  const [fields, setFields] = useState({
    contactName: draft?.contactName ?? current.contactName ?? '',
    company: draft?.company ?? current.company ?? '',
    email: draft?.email ?? '',
    phone: draft?.phone ?? '',
    summary: draft?.summary ?? '',
    disposition: draft?.disposition ?? 'completed',
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {t('CRM draft')}
          {current.crmConfirmed && (
            <span className="flex items-center gap-1 text-vq-success text-xs">
              <CheckCircle2 size={14} /> {t('Saved')}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-vq-text-lo text-xs">
          {t(
            'AI-drafted from the call — review, edit, and confirm. Nothing is saved to your CRM until you confirm.',
          )}
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <LabeledInput
            label={t('Contact')}
            value={fields.contactName}
            onChange={(v) => setFields({ ...fields, contactName: v })}
          />
          <LabeledInput
            label={t('Company')}
            value={fields.company}
            onChange={(v) => setFields({ ...fields, company: v })}
          />
          <LabeledInput
            label={t('Email')}
            value={fields.email}
            onChange={(v) => setFields({ ...fields, email: v })}
          />
          <LabeledInput
            label={t('Phone')}
            value={fields.phone}
            onChange={(v) => setFields({ ...fields, phone: v })}
          />
        </div>
        <label className="flex flex-col gap-1 text-vq-text-lo text-xs">
          {t('Summary')}
          <textarea
            className="min-h-20 rounded-vq border border-vq-border bg-transparent px-2 py-1.5 text-sm text-vq-text-hi"
            value={fields.summary}
            onChange={(e) => setFields({ ...fields, summary: e.target.value })}
          />
        </label>
        {draft?.nextSteps && draft.nextSteps.length > 0 && (
          <div className="text-sm">
            <p className="text-vq-text-lo text-xs">{t('Next steps')}</p>
            <ul className="mt-1 list-disc pl-4 text-vq-text-hi">
              {draft.nextSteps.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
        )}
        <LabeledInput
          label={t('Disposition')}
          value={fields.disposition}
          onChange={(v) => setFields({ ...fields, disposition: v })}
        />
        <div className="flex items-center gap-3">
          <Button size="sm" disabled={confirm.isPending} onClick={() => confirm.mutate(fields)}>
            {confirm.isPending ? t('Saving…') : t('Confirm to CRM')}
          </Button>
          {confirm.isSuccess && <span className="text-vq-success text-xs">{t('Saved ✓')}</span>}
        </div>
      </CardContent>
    </Card>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const id = `crm-${label.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <label htmlFor={id} className="flex flex-col gap-1 text-vq-text-lo text-xs">
      {label}
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
