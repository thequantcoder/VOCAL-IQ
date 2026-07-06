'use client';

import { Button, Card, CardContent, CardHeader, CardTitle } from '@vocaliq/ui';
import { ShieldAlert } from 'lucide-react';
import { EmptyState, ErrorState, LoadingCard } from '../../../../components/states';
import { type AbuseCase, useAbuseCases, useResolveCase } from '../../../../lib/api';

const ACTION_COLOR: Record<string, string> = {
  suspend_tenant: 'text-vq-danger border-vq-danger/40',
  pause_campaigns: 'text-vq-warn border-vq-warn/40',
  throttle: 'text-vq-text-lo border-vq-border',
};

/**
 * Fraud/abuse case review (Day 70, super-admin): tenants auto-flagged by the real-time detector.
 * A suspended tenant stays down until a human resumes (review-to-resume) — every action audited.
 */
export default function FraudPage() {
  const cases = useAbuseCases('open');

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 font-display font-semibold text-vq-text-hi text-xl">
          <ShieldAlert size={20} /> Fraud &amp; abuse
        </h1>
        <p className="text-sm text-vq-text-lo">
          Auto-flagged tenants. Review to resume — suspensions require a human sign-off.
        </p>
      </div>

      {cases.isLoading ? (
        <LoadingCard rows={3} />
      ) : cases.isError ? (
        <ErrorState message={(cases.error as Error).message} onRetry={() => cases.refetch()} />
      ) : !cases.data || cases.data.length === 0 ? (
        <EmptyState title="No open cases" hint="Flagged tenants will appear here for review." />
      ) : (
        <div className="flex flex-col gap-3">
          {cases.data.map((c) => (
            <CaseRow key={c.id} c={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function CaseRow({ c }: { c: AbuseCase }) {
  const resolve = useResolveCase();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span className="font-mono text-vq-text-hi text-sm">{c.tenantId.slice(0, 8)}</span>
          <span
            className={`rounded-vq-pill border px-2 py-0.5 text-xs ${ACTION_COLOR[c.action] ?? ''}`}
          >
            {c.action} · {c.score}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ul className="flex flex-col gap-0.5 text-vq-text-lo text-xs">
          {c.reasons.map((r) => (
            <li key={r}>• {r}</li>
          ))}
        </ul>
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={resolve.isPending}
            onClick={() => resolve.mutate({ id: c.id, resolution: 'resume' })}
          >
            Resume tenant
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={resolve.isPending}
            onClick={() => resolve.mutate({ id: c.id, resolution: 'dismiss' })}
          >
            Dismiss (false positive)
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={resolve.isPending}
            onClick={() => resolve.mutate({ id: c.id, resolution: 'keep_suspended' })}
          >
            Keep suspended
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
