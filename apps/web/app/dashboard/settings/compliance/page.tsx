'use client';

import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@vocaliq/ui';
import { Globe, PhoneOff, ScrollText, ShieldAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { EmptyState, ErrorState, LoadingCard } from '../../../../components/states';
import {
  type RetentionPolicy,
  useAddSuppression,
  useRegions,
  useRemoveSuppression,
  useResidency,
  useRetention,
  useSetResidency,
  useSetRetention,
  useSuppressions,
} from '../../../../lib/api';

const inputCls =
  'w-full rounded-vq border border-vq-border bg-vq-bg-base px-3 py-2 text-sm text-vq-text-hi focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vq-ring';

/**
 * Compliance settings (Day 60): DNC suppression list, PII-retention policy (auto-deletion), and
 * transcript-redaction. Enables regulated verticals — HIPAA/PCI/GDPR-style controls.
 */
export default function CompliancePage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 font-display font-semibold text-vq-text-hi text-xl">
          <ShieldAlert size={20} /> Compliance
        </h1>
        <p className="text-sm text-vq-text-lo">
          Do-not-call, retention/auto-deletion, and PII redaction for regulated verticals.
        </p>
      </div>
      <Residency />
      <Dnc />
      <Retention />
    </div>
  );
}

function Residency() {
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
          <Globe size={16} /> Data residency
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-vq-text-lo text-sm">
          Pin your data + processing to a region. Recordings, transcripts, and voice infra stay
          in-region.
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
            Strict egress (no cross-jurisdiction processing)
          </label>
          <Button
            size="sm"
            disabled={save.isPending || !region}
            onClick={() => save.mutate({ region, strictEgress: strict })}
          >
            {save.isPending ? 'Saving…' : 'Pin region'}
          </Button>
        </div>
        {current.data && (
          <p className="text-vq-text-lo text-xs">
            Current: <span className="font-mono text-vq-text-hi">{current.data.region}</span> ·
            storage <span className="font-mono">{current.data.storageHost}</span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Dnc() {
  const list = useSuppressions();
  const add = useAddSuppression();
  const remove = useRemoveSuppression();
  const [phone, setPhone] = useState('');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <PhoneOff size={16} /> Do-not-call list
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Input
            placeholder="Phone number to suppress"
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
            Suppress
          </Button>
        </div>
        {list.isLoading ? (
          <LoadingCard rows={2} />
        ) : list.isError ? (
          <ErrorState message={(list.error as Error).message} onRetry={() => list.refetch()} />
        ) : !list.data || list.data.length === 0 ? (
          <EmptyState title="No suppressed numbers" hint="Add numbers that must never be called." />
        ) : (
          <div className="flex flex-col divide-y divide-vq-border">
            {list.data.map((s) => (
              <div key={s.phone} className="flex items-center justify-between py-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-vq-text-hi">{s.phone}</span>
                  {s.global && (
                    <span className="rounded-vq-pill border border-vq-border px-2 py-0.5 text-vq-text-lo text-xs">
                      global
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
                    Remove
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
          <ScrollText size={16} /> Retention &amp; deletion
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-vq-text-lo text-sm">
          Auto-delete data older than the window (0 = keep forever). Runs on a schedule.
        </p>
        <div className="grid grid-cols-3 gap-3">
          <Field
            label="Recordings (days)"
            value={form.recordingsDays}
            onChange={(v) => setForm((f) => ({ ...f, recordingsDays: v }))}
          />
          <Field
            label="Transcripts (days)"
            value={form.transcriptsDays}
            onChange={(v) => setForm((f) => ({ ...f, transcriptsDays: v }))}
          />
          <Field
            label="Memory (days)"
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
          Redact PII from transcripts
        </label>
        <Button size="sm" disabled={save.isPending} onClick={() => save.mutate(form)}>
          {save.isPending ? 'Saving…' : 'Save retention policy'}
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
