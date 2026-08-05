'use client';

import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@vocaliq/ui';
import { AlertTriangle, Fingerprint, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { LoadingCard } from '../../../../components/states';
import {
  type VerifyDecision,
  useBiometricAudits,
  useBiometricSettings,
  useEnrollVoiceprint,
  useEraseVoiceprint,
  useSetBiometricSettings,
  useVerifyVoiceprint,
} from '../../../../lib/api';
import { useI18n } from '../../../../lib/i18n/provider';

/**
 * Voice biometrics (Day 91) — caller identity verification by voiceprint. Governance-first: OFF by
 * default, region deny-by-default, explicit consent + encryption at rest, every action audited.
 */
export default function BiometricsSettingsPage() {
  const { t } = useI18n();
  const settings = useBiometricSettings();
  const save = useSetBiometricSettings();
  const [form, setForm] = useState({
    enabled: false,
    allowedRegions: '',
    threshold: 0.75,
    minLiveness: 0.5,
    retentionDays: 365,
  });

  useEffect(() => {
    if (settings.data) {
      setForm({
        enabled: settings.data.enabled,
        allowedRegions: settings.data.allowedRegions.join(', '),
        threshold: settings.data.threshold,
        minLiveness: settings.data.minLiveness,
        retentionDays: settings.data.retentionDays,
      });
    }
  }, [settings.data]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 font-display font-semibold text-vq-text-hi text-xl">
          <Fingerprint size={20} /> {t('Voice biometrics')}
        </h1>
        <p className="text-sm text-vq-text-lo">
          {t(
            "Verify a caller's identity by voiceprint for secure flows (account access, banking). Off by default; enrolments are consented, encrypted, and region-gated.",
          )}
        </p>
      </div>

      <p className="flex items-start gap-2 rounded-vq border border-vq-warning/40 bg-vq-warning/5 p-3 text-vq-text-lo text-xs">
        <AlertTriangle size={14} className="mt-0.5 shrink-0 text-vq-warning" />{' '}
        {t(
          'Biometric data is heavily regulated (BIPA, GDPR Art. 9, and more). Only enable it in regions where you have confirmed legality and captured explicit caller consent.',
        )}
      </p>

      {settings.isLoading ? (
        <LoadingCard rows={3} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('Policy')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1"
                checked={form.enabled}
                onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
              />
              <span className="text-sm text-vq-text-lo">
                <span className="text-vq-text-hi">{t('Enable voice biometrics.')}</span>{' '}
                {t('When off, no enrolment or verification can run.')}
              </span>
            </label>
            <label htmlFor="regions" className="flex flex-col gap-1 text-vq-text-lo text-xs">
              {t('Allowed regions (comma-separated; empty = denied everywhere)')}
              <Input
                id="regions"
                placeholder="US-NY, GB"
                value={form.allowedRegions}
                onChange={(e) => setForm({ ...form, allowedRegions: e.target.value })}
              />
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label htmlFor="threshold" className="flex flex-col gap-1 text-vq-text-lo text-xs">
                {t('Match threshold')}
                <Input
                  id="threshold"
                  type="number"
                  step="0.01"
                  min="0.5"
                  max="0.999"
                  value={form.threshold}
                  onChange={(e) => setForm({ ...form, threshold: Number(e.target.value) })}
                />
              </label>
              <label htmlFor="liveness" className="flex flex-col gap-1 text-vq-text-lo text-xs">
                {t('Min liveness')}
                <Input
                  id="liveness"
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={form.minLiveness}
                  onChange={(e) => setForm({ ...form, minLiveness: Number(e.target.value) })}
                />
              </label>
              <label htmlFor="retention" className="flex flex-col gap-1 text-vq-text-lo text-xs">
                {t('Retention (days)')}
                <Input
                  id="retention"
                  type="number"
                  min="1"
                  value={form.retentionDays}
                  onChange={(e) => setForm({ ...form, retentionDays: Number(e.target.value) })}
                />
              </label>
            </div>
            <div className="flex items-center gap-3">
              <Button
                size="sm"
                disabled={save.isPending}
                onClick={() =>
                  save.mutate({
                    enabled: form.enabled,
                    allowedRegions: form.allowedRegions
                      .split(',')
                      .map((r) => r.trim())
                      .filter(Boolean),
                    threshold: form.threshold,
                    minLiveness: form.minLiveness,
                    retentionDays: form.retentionDays,
                  })
                }
              >
                {save.isPending ? t('Saving…') : t('Save policy')}
              </Button>
              {save.isSuccess && <span className="text-vq-success text-xs">{t('Saved ✓')}</span>}
              {save.isError && (
                <span className="text-vq-danger text-xs">{(save.error as Error).message}</span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <EnrollVerifyTool enabled={form.enabled} />
      <AuditTrail />
    </div>
  );
}

/** A compact tool to enrol + verify a contact's voiceprint (uses an opaque audio-sample reference). */
function EnrollVerifyTool({ enabled }: { enabled: boolean }) {
  const { t } = useI18n();
  const enroll = useEnrollVoiceprint();
  const verify = useVerifyVoiceprint();
  const erase = useEraseVoiceprint();
  const [contactId, setContactId] = useState('');
  const [region, setRegion] = useState('US-NY');
  const [sample, setSample] = useState('');
  const [result, setResult] = useState<VerifyDecision | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('Enrol / verify a caller')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!enabled && (
          <p className="text-vq-text-lo text-xs">
            {t('Enable + save the policy above before enrolling.')}
          </p>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label htmlFor="contact" className="flex flex-col gap-1 text-vq-text-lo text-xs">
            {t('Contact ID')}
            <Input id="contact" value={contactId} onChange={(e) => setContactId(e.target.value)} />
          </label>
          <label htmlFor="region2" className="flex flex-col gap-1 text-vq-text-lo text-xs">
            {t('Region')}
            <Input id="region2" value={region} onChange={(e) => setRegion(e.target.value)} />
          </label>
        </div>
        <label htmlFor="sample" className="flex flex-col gap-1 text-vq-text-lo text-xs">
          {t('Audio sample reference')}
          <Input
            id="sample"
            placeholder={t('a voice-sample id captured on the call')}
            value={sample}
            onChange={(e) => setSample(e.target.value)}
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={!contactId || !sample || enroll.isPending}
            onClick={() =>
              enroll.mutate(
                { contactId, region, consent: true, sample },
                { onSuccess: () => setResult(null) },
              )
            }
          >
            {enroll.isPending ? t('Enrolling…') : t('Enrol (consented)')}
          </Button>
          <Button
            size="sm"
            disabled={!contactId || !sample || verify.isPending}
            onClick={() => verify.mutate({ contactId, region, sample }, { onSuccess: setResult })}
          >
            {verify.isPending ? t('Verifying…') : t('Verify')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!contactId || erase.isPending}
            onClick={() => {
              erase.mutate(contactId);
              setResult(null);
            }}
          >
            <Trash2 size={14} /> {t('Erase')}
          </Button>
        </div>
        {(enroll.isError || verify.isError) && (
          <span className="text-vq-danger text-xs">
            {((enroll.error ?? verify.error) as Error)?.message}
          </span>
        )}
        {enroll.isSuccess && !result && (
          <span className="text-vq-success text-xs">{t('Voiceprint enrolled ✓')}</span>
        )}
        {result && (
          <div
            className={`rounded-vq border p-3 text-sm ${
              result.verified
                ? 'border-vq-success/50 text-vq-success'
                : result.outcome === 'spoof'
                  ? 'border-vq-danger/50 text-vq-danger'
                  : 'border-vq-warning/50 text-vq-warning'
            }`}
          >
            <p className="font-medium capitalize">{result.outcome.replace('_', ' ')}</p>
            <p className="text-vq-text-lo text-xs">
              {t('match {m}% · liveness {l}%', {
                m: (result.score * 100).toFixed(0),
                l: (result.liveness * 100).toFixed(0),
              })}
              {result.needsStepUp ? ` · ${t('step-up auth required')}` : ''}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** The immutable audit of every biometric action. */
function AuditTrail() {
  const { t } = useI18n();
  const audits = useBiometricAudits();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('Audit trail')}</CardTitle>
      </CardHeader>
      <CardContent>
        {audits.isLoading ? (
          <LoadingCard rows={2} />
        ) : !audits.data || audits.data.length === 0 ? (
          <p className="text-vq-text-lo text-sm">{t('No biometric activity yet.')}</p>
        ) : (
          <ul className="flex flex-col gap-1.5 text-sm">
            {audits.data.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between border-vq-border border-b pb-1.5 last:border-0"
              >
                <span className="text-vq-text-hi">
                  {a.event}
                  {a.outcome ? ` · ${a.outcome}` : ''}
                </span>
                <span className="text-vq-text-lo text-xs">
                  {a.contactId} · {new Date(a.createdAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
