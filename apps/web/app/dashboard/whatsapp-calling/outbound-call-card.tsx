'use client';

import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input } from '@vocaliq/ui';
import { PhoneOutgoing, Search, Send, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import {
  type WhatsappPermissionInspect,
  useAgents,
  usePlaceWhatsappCall,
  useRequestWhatsappPermission,
  useWhatsappPermission,
} from '../../../lib/api';
import { useActionFeedback } from '../../../lib/use-action-feedback';

/**
 * WhatsApp consented-outbound card (WAC-08) — the permission inspector + dialer. Check a user's call
 * permission, request it (send-capped), and place a call ONLY when the compliance gate allows (the
 * "Call now" button is disabled with the blocked reason otherwise). No cold/bulk dialing lives here.
 */

const NO_PERMISSION_BADGE = { label: 'No permission', variant: 'warn' as const };
const STATUS_BADGE: Record<string, { label: string; variant: 'success' | 'warn' | 'accent' }> = {
  permanent: { label: 'Permanent permission', variant: 'success' },
  temporary: { label: 'Temporary permission', variant: 'accent' },
  no_permission: NO_PERMISSION_BADGE,
};

const fieldClass =
  'flex h-10 w-full rounded-vq border border-vq-border bg-vq-bg-base px-3 py-2 text-sm text-vq-text-hi ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vq-ring focus-visible:border-vq-violet/60';

export function OutboundCallCard() {
  const agents = useAgents();
  const [to, setTo] = useState('');
  const [checked, setChecked] = useState('');
  const [agentId, setAgentId] = useState('');
  const perm = useWhatsappPermission(checked);
  const request = useRequestWhatsappPermission();
  const place = usePlaceWhatsappCall();
  const { run: runRequest, pending: requesting } = useActionFeedback();
  const { run: runCall, pending: calling } = useActionFeedback();

  const effectiveAgent = agentId || agents.data?.[0]?.id || '';
  const noAgents = !agents.isLoading && (agents.data?.length ?? 0) === 0;
  const inspect = perm.data;

  async function onRequest() {
    await runRequest(() => request.mutateAsync({ waId: checked || to.trim() }), {
      success: 'Permission request sent.',
    });
  }

  async function onCall() {
    const result = await runCall(
      () => place.mutateAsync({ to: checked || to.trim(), agentId: effectiveAgent }),
      { success: 'Call placed — it’ll appear in the feed.' },
    );
    return result;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <PhoneOutgoing size={16} /> Call a customer on WhatsApp
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-vq-text-lo">
          Outbound WhatsApp calls need the customer’s permission. Check it here, request it if
          needed, and place the call — the platform never dials without consent.
        </p>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label htmlFor="wa-outbound-to" className="flex flex-1 flex-col gap-1.5">
            <span className="font-medium text-sm text-vq-text-hi">Customer WhatsApp number</span>
            <Input
              id="wa-outbound-to"
              type="tel"
              mono
              placeholder="+15551234567"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <label className="flex flex-1 flex-col gap-1.5">
            <span className="font-medium text-sm text-vq-text-hi">Agent</span>
            <select
              className={fieldClass}
              value={effectiveAgent}
              onChange={(e) => setAgentId(e.target.value)}
              disabled={noAgents}
            >
              {noAgents ? <option value="">No agents — create one first</option> : null}
              {agents.data?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={() => setChecked(to.trim())}
            disabled={to.trim().length < 3}
          >
            <Search size={16} /> Check
          </Button>
        </div>

        {checked ? <PermissionPanel query={perm} /> : null}

        {inspect ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="md"
              onClick={onRequest}
              loading={requesting}
              disabled={!inspect.requestCaps.canRequest.allowed}
            >
              <Send size={15} /> Request permission
            </Button>
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={onCall}
              loading={calling}
              disabled={!inspect.canCall.allowed || !effectiveAgent}
            >
              <PhoneOutgoing size={15} /> Call now
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function PermissionPanel({
  query,
}: {
  query: { data?: WhatsappPermissionInspect; isLoading: boolean; isError: boolean };
}) {
  if (query.isLoading) {
    return <p className="text-sm text-vq-text-lo">Checking permission…</p>;
  }
  if (query.isError || !query.data) {
    return <p className="text-sm text-vq-danger">Couldn’t check permission. Try again.</p>;
  }
  const { permission, canCall, requestCaps } = query.data;
  const badge = STATUS_BADGE[permission.status] ?? NO_PERMISSION_BADGE;
  const expires =
    permission.status === 'temporary' && permission.expiresAt
      ? new Date(permission.expiresAt).toLocaleDateString()
      : null;

  return (
    <div className="flex flex-col gap-2 rounded-vq-card border border-vq-border bg-vq-bg-base p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={badge.variant}>
          <ShieldCheck size={13} /> {badge.label}
        </Badge>
        {expires ? <span className="text-vq-text-lo text-xs">expires {expires}</span> : null}
        {canCall.allowed ? (
          <Badge variant="success">Ready to call</Badge>
        ) : (
          <span className="text-vq-warn text-xs">{blockedReason(canCall.reason)}</span>
        )}
      </div>
      <p className="text-vq-text-lo text-xs">
        {canCall.connectedLast24h}/100 calls today · permission requests: {requestCaps.sentLast24h}
        /1 today, {requestCaps.sentLast7d}/2 this week
        {requestCaps.canRequest.allowed ? '' : ' · request cap reached'}
      </p>
    </div>
  );
}

/** Friendly copy for each pre-dial block reason (mirrors the api). */
function blockedReason(reason: string | undefined): string {
  switch (reason) {
    case 'dnc':
      return 'On the do-not-call list';
    case 'blocked_country':
      return 'Calling blocked from this business number’s country';
    case 'no_permission':
      return 'No permission yet — request it first';
    case 'permission_expired':
      return 'Permission expired — request it again';
    case 'unanswered_backoff':
      return 'Paused — too many unanswered calls';
    case 'daily_connected_cap':
      return 'Daily call limit reached for this user';
    default:
      return 'Not permitted right now';
  }
}
