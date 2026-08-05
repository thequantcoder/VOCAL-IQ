'use client';

import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@vocaliq/ui';
import { Globe, Megaphone, PhoneOff, ScrollText, ShieldAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { EmptyState, ErrorState, LoadingCard } from '../../../../components/states';
import {
  type DisclosureConfig,
  type RetentionPolicy,
  useAddSuppression,
  useDisclosureConfig,
  useDisclosureTemplates,
  useRegions,
  useRemoveSuppression,
  useResidency,
  useRetention,
  useSetDisclosureConfig,
  useSetResidency,
  useSetRetention,
  useSuppressions,
} from '../../../../lib/api';
import { useI18n } from '../../../../lib/i18n/provider';

const inputCls =
  'w-full rounded-vq border border-vq-border bg-vq-bg-base px-3 py-2 text-sm text-vq-text-hi focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vq-ring';

/**
 * Compliance settings (Day 60): DNC suppression list, PII-retention policy (auto-deletion), and
 * transcript-redaction. Enables regulated verticals — HIPAA/PCI/GDPR-style controls.
 */
export default function CompliancePage() {
  const { t } = useI18n();
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 font-display font-semibold text-vq-text-hi text-xl">
          <ShieldAlert size={20} /> {t('Compliance')}
        </h1>
        <p className="text-sm text-vq-text-lo">
          {t('Do-not-call, retention/auto-deletion, and PII redaction for regulated verticals.')}
        </p>
      </div>
      <AiDisclosure />
      <Residency />
      <Dnc />
      <Retention />
    </div>
  );
}

function AiDisclosure() {
  const { t } = useI18n();
  const config = useDisclosureConfig();
  const templates = useDisclosureTemplates();
  const save = useSetDisclosureConfig();
  const [form, setForm] = useState<DisclosureConfig>({ region: 'DEFAULT', humanKeyword: 'human' });

  useEffect(() => {
    if (config.data) setForm(config.data);
  }, [config.data]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Megaphone size={16} /> {t('AI disclosure & calling rules')}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-vq-text-lo text-sm">
          {t(
            'Region-aware "you\'re speaking with an AI" disclosure + a mandatory "press 1 for a human" opt-out and calling-hour/frequency rules — enforced platform-wide.',
          )}
        </p>
        <label className="flex flex-col gap-1 text-vq-text-lo text-xs">
          {t('Compliance template')}
          <select
            value={form.region}
            onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}
            className={inputCls}
          >
            {(templates.data ?? []).map((tpl) => (
              <option key={tpl.key} value={tpl.key}>
                {tpl.key} — {tpl.disclosureRequired ? t('disclose') : t('no disclosure')} ·{' '}
                {tpl.callingHours.start}:00–
                {tpl.callingHours.end}:00 · {tpl.maxAttemptsPerDay}/day
              </option>
            ))}
          </select>
        </label>
        <Input
          placeholder={t('Custom disclosure line (optional)')}
          value={form.customText ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, customText: e.target.value || undefined }))}
        />
        <div className="flex items-center gap-2">
          <span className="text-vq-text-lo text-xs">{t('Human keyword')}</span>
          <Input
            value={form.humanKeyword}
            onChange={(e) => setForm((f) => ({ ...f, humanKeyword: e.target.value }))}
            className="max-w-[8rem]"
          />
          <Button size="sm" disabled={save.isPending} onClick={() => save.mutate(form)}>
            {save.isPending ? t('Saving…') : t('Save')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Residency() {
  const { t } = useI18n();
  const regions = useRegions();
  const current = useResidency();
  const save = useSetResidency();
  const [region, setRegion] = useState('');
  const [strict, setStrict] = useState(false);

  useEffect(() => {
    if (current.data) {
      setRegion(current.data.region);
      setStrict(current.data.strictEgress);
    }
  }, [current.data]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Globe size={16} /> {t('Data residency')}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-vq-text-lo text-sm">
          {t(
            'Pin your data + processing to a region. Recordings, transcripts, and voice infra stay in-region.',
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className={inputCls.replace('w-full', 'max-w-xs')}
          >
            {(regions.data?.regions ?? []).map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-vq-text-lo">
            <input type="checkbox" checked={strict} onChange={(e) => setStrict(e.target.checked)} />
            {t('Strict egress (no cross-jurisdiction processing)')}
          </label>
          <Button
            size="sm"
            disabled={save.isPending || !region}
            onClick={() => save.mutate({ region, strictEgress: strict })}
          >
            {save.isPending ? t('Saving…') : t('Pin region')}
          </Button>
        </div>
        {current.data && (
          <p className="text-vq-text-lo text-xs">
            {t('Current:')} <span className="font-mono text-vq-text-hi">{current.data.region}</span>{' '}
            · {t('storage')} <span className="font-mono">{current.data.storageHost}</span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Dnc() {
  const { t } = useI18n();
  const list = useSuppressions();
  const add = useAddSuppression();
  const remove = useRemoveSuppression();
  const [phone, setPhone] = useState('');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <PhoneOff size={16} /> {t('Do-not-call list')}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Input
            placeholder={t('Phone number to suppress')}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="max-w-xs"
          />
          <Button
            size="sm"
            disabled={add.isPending || phone.trim().length < 3}
            onClick={() => {
              add.mutate({ phone: phone.trim() });
              setPhone('');
            }}
          >
            {t('Suppress')}
          </Button>
        </div>
        {list.isLoading ? (
          <LoadingCard rows={2} />
        ) : list.isError ? (
          <ErrorState message={(list.error as Error).message} onRetry={() => list.refetch()} />
        ) : !list.data || list.data.length === 0 ? (
          <EmptyState
            title={t('No suppressed numbers')}
            hint={t('Add numbers that must never be called.')}
          />
        ) : (
          <div className="flex flex-col divide-y divide-vq-border">
            {list.data.map((s) => (
              <div key={s.phone} className="flex items-center justify-between py-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-vq-text-hi">{s.phone}</span>
                  {s.global && (
                    <span className="rounded-vq-pill border border-vq-border px-2 py-0.5 text-vq-text-lo text-xs">
                      {t('global')}
                    </span>
                  )}
                  {s.reason && <span className="text-vq-text-lo text-xs">{s.reason}</span>}
                </div>
                {!s.global && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate({ phone: s.phone })}
                  >
                    {t('Remove')}
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Retention() {
  const { t } = useI18n();
  const policy = useRetention();
  const save = useSetRetention();
  const [form, setForm] = useState<RetentionPolicy>({
    recordingsDays: 0,
    transcriptsDays: 0,
    memoryDays: 0,
    redactTranscripts: false,
  });

  useEffect(() => {
    if (policy.data) setForm(policy.data);
  }, [policy.data]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ScrollText size={16} /> {t('Retention & deletion')}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-vq-text-lo text-sm">
          {t('Auto-delete data older than the window (0 = keep forever). Runs on a schedule.')}
        </p>
        <div className="grid grid-cols-3 gap-3">
          <Field
            label={t('Recordings (days)')}
            value={form.recordingsDays}
            onChange={(v) => setForm((f) => ({ ...f, recordingsDays: v }))}
          />
          <Field
            label={t('Transcripts (days)')}
            value={form.transcriptsDays}
            onChange={(v) => setForm((f) => ({ ...f, transcriptsDays: v }))}
          />
          <Field
            label={t('Memory (days)')}
            value={form.memoryDays}
            onChange={(v) => setForm((f) => ({ ...f, memoryDays: v }))}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-vq-text-lo">
          <input
            type="checkbox"
            checked={form.redactTranscripts}
            onChange={(e) => setForm((f) => ({ ...f, redactTranscripts: e.target.checked }))}
          />
          {t('Redact PII from transcripts')}
        </label>
        <Button size="sm" disabled={save.isPending} onClick={() => save.mutate(form)}>
          {save.isPending ? t('Saving…') : t('Save retention policy')}
        </Button>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  value,
  onChange,
}: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex flex-col gap-1 text-vq-text-lo text-xs">
      {label}
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        className={inputCls}
      />
    </label>
  );
}
