'use client';

import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input } from '@vocaliq/ui';
import { PhoneOutgoing, Search, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import {
  type MessengerPermissionInspect,
  useAgents,
  useMessengerPermission,
  usePlaceMessengerCall,
} from '../../../lib/api';
import { useActionFeedback } from '../../../lib/use-action-feedback';

/**
 * Messenger consented-outbound card (MEC-08) — the LIVE permission inspector + dialer, the WhatsApp
 * `OutboundCallCard` sibling. Divergences: identity is a **PSID** (not a phone number), and the permission
 * is READ live from Meta's Call-Permissions API — the user grants it on the Page, so there is no
 * "request permission" send here. "Call now" is disabled (with the blocked reason) unless the compliance
 * gate allows. No cold/bulk dialing lives here.
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
  const [psid, setPsid] = useState('');
  const [checked, setChecked] = useState('');
  const [agentId, setAgentId] = useState('');
  const perm = useMessengerPermission(checked);
  const place = usePlaceMessengerCall();
  const { run: runCall, pending: calling } = useActionFeedback();

  const effectiveAgent = agentId || agents.data?.[0]?.id || '';
  const noAgents = !agents.isLoading && (agents.data?.length ?? 0) === 0;
  const inspect = perm.data;

  async function onCall() {
    return runCall(
      () => place.mutateAsync({ psid: checked || psid.trim(), agentId: effectiveAgent }),
      { success: 'Call placed — it’ll appear in the feed.' },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <PhoneOutgoing size={16} /> Call a customer on Messenger
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-vq-text-lo">
          Outbound Messenger calls need the customer’s permission, granted from your Page. Paste
          their Page-Scoped ID (PSID), check the live permission, and place the call — the platform
          never dials without a live grant.
        </p>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label htmlFor="me-outbound-psid" className="flex flex-1 flex-col gap-1.5">
            <span className="font-medium text-sm text-vq-text-hi">Customer PSID</span>
            <Input
              id="me-outbound-psid"
              mono
              placeholder="e.g. 24680135791113"
              value={psid}
              onChange={(e) => setPsid(e.target.value)}
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
            onClick={() => setChecked(psid.trim())}
            disabled={psid.trim().length < 1}
          >
            <Search size={16} /> Check
          </Button>
        </div>

        {checked ? <PermissionPanel query={perm} /> : null}

        {inspect ? (
          <div className="flex flex-wrap gap-2">
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
  query: { data?: MessengerPermissionInspect; isLoading: boolean; isError: boolean };
}) {
  if (query.isLoading) {
    return <p className="text-sm text-vq-text-lo">Checking permission…</p>;
  }
  if (query.isError || !query.data) {
    return <p className="text-sm text-vq-danger">Couldn’t check permission. Try again.</p>;
  }
  const { permission, canCall } = query.data;
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
        {permission.live ? null : (
          <span className="text-vq-text-lo text-xs">· live permission unavailable (gated)</span>
        )}
      </div>
      <p className="text-vq-text-lo text-xs">
        {permission.limit
          ? `${permission.limit.currentUsage}/${permission.limit.maxAllowed} calls used · `
          : ''}
        {canCall.consecutiveUnanswered > 0
          ? `${canCall.consecutiveUnanswered} consecutive unanswered`
          : 'no recent unanswered calls'}
      </p>
    </div>
  );
}

/** Friendly copy for each pre-dial block reason (mirrors the api). */
function blockedReason(reason: string | undefined): string {
  switch (reason) {
    case 'dnc':
      return 'On the do-not-call list';
    case 'no_permission':
      return 'No permission yet — the customer must grant it on the Page';
    case 'permission_expired':
      return 'Permission expired — it must be granted again';
    case 'unanswered_backoff':
      return 'Paused — too many unanswered calls';
    case 'rate_limited':
      return 'Meta’s call rate limit reached — try again later';
    default:
      return 'Not permitted right now';
  }
}
