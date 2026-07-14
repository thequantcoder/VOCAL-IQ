'use client';

import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@vocaliq/ui';
import { Megaphone, Send } from 'lucide-react';
import { useState } from 'react';
import { type AnnouncementAudienceInput, useSendAnnouncement } from '../../../../lib/api';

/** The audience scopes offered by the compose UI (the explicit-tenant-list scope is API-only). */
type UiScope = Exclude<AnnouncementAudienceInput['scope'], 'tenants'>;

const SCOPES: { value: UiScope; label: string; hint: string }[] = [
  { value: 'all', label: 'All tenants', hint: 'Every active reseller + customer' },
  { value: 'customers', label: 'Customers only', hint: 'All customer tenants' },
  { value: 'reseller', label: 'A reseller', hint: 'A reseller + its sub-tenants' },
  { value: 'plan', label: 'A plan', hint: 'Tenants on a specific plan' },
];

const SEVERITIES = ['info', 'success', 'warning', 'critical'] as const;

/**
 * Super-admin broadcast announcements (PARITY-07): publish a platform-wide message to a targeted
 * audience. Each send fans out one notification per tenant (audited) and appears in every targeted
 * tenant's notification center.
 */
export default function AnnouncementsPage() {
  const send = useSendAnnouncement();
  const [scope, setScope] = useState<UiScope>('all');
  const [targetId, setTargetId] = useState('');
  const [message, setMessage] = useState('');
  const [severity, setSeverity] = useState<(typeof SEVERITIES)[number]>('info');
  const [sent, setSent] = useState<number | null>(null);

  const needsId = scope === 'reseller' || scope === 'plan';

  function onSend() {
    setSent(null);
    const audience: AnnouncementAudienceInput =
      scope === 'reseller'
        ? { scope: 'reseller', resellerId: targetId.trim() }
        : scope === 'plan'
          ? { scope: 'plan', planId: targetId.trim() }
          : scope === 'customers'
            ? { scope: 'customers' }
            : { scope: 'all' };
    send.mutate(
      { audience, message: message.trim(), severity },
      {
        onSuccess: (r) => {
          setSent(r.sent);
          setMessage('');
        },
      },
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 font-display font-semibold text-vq-text-hi text-xl">
          <Megaphone size={20} /> Announcements
        </h1>
        <p className="text-sm text-vq-text-lo">
          Broadcast a platform-wide message to a targeted set of tenants. Appears in each tenant's
          notification center; every send is audited.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Compose</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="font-medium text-sm text-vq-text-hi">Audience</span>
            <div className="grid gap-2 sm:grid-cols-2">
              {SCOPES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setScope(s.value)}
                  className={`rounded-vq border px-3 py-2 text-left text-sm ${
                    scope === s.value
                      ? 'border-primary-500 bg-primary-500/10 text-vq-text-hi'
                      : 'border-vq-border text-vq-text-lo hover:border-vq-border-hi'
                  }`}
                >
                  <span className="block font-medium">{s.label}</span>
                  <span className="text-xs">{s.hint}</span>
                </button>
              ))}
            </div>
          </div>

          {needsId && (
            <label htmlFor="announce-target" className="flex flex-col gap-1.5">
              <span className="font-medium text-sm text-vq-text-hi">
                {scope === 'reseller' ? 'Reseller tenant ID' : 'Plan ID'}
              </span>
              <Input
                id="announce-target"
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                placeholder="00000000-0000-0000-0000-000000000000"
              />
            </label>
          )}

          <div className="flex flex-col gap-1.5">
            <span className="font-medium text-sm text-vq-text-hi">Severity</span>
            <div className="flex gap-2">
              {SEVERITIES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSeverity(s)}
                  className={`rounded-vq-pill border px-3 py-1 text-xs capitalize ${
                    severity === s
                      ? 'border-primary-500 bg-primary-500/10 text-vq-text-hi'
                      : 'border-vq-border text-vq-text-lo'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="font-medium text-sm text-vq-text-hi">Message</span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Scheduled maintenance this Sunday 02:00–03:00 UTC…"
              className="w-full rounded-vq border border-vq-border bg-vq-bg-base px-3 py-2 text-sm text-vq-text-hi focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vq-ring"
            />
            <span className="text-right text-vq-text-lo text-xs">{message.length}/500</span>
          </label>

          <div className="flex items-center gap-3">
            <Button
              variant="primary"
              loading={send.isPending}
              disabled={!message.trim() || (needsId && !targetId.trim())}
              onClick={onSend}
            >
              <Send size={16} /> Publish
            </Button>
            {sent !== null && (
              <span className="text-sm text-vq-success">Sent to {sent} tenant(s) ✓</span>
            )}
            {send.isError && (
              <span className="text-sm text-vq-danger">{(send.error as Error).message}</span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
