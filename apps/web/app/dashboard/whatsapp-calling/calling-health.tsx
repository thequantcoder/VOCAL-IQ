'use client';

import { Badge, Card, CardContent, CardHeader, CardTitle } from '@vocaliq/ui';
import { Activity, AlertTriangle } from 'lucide-react';
import { useWhatsappCallingHealth } from '../../../lib/api';

/**
 * WhatsApp-calling health widget (WAC-09) — pickup rate + throttle state, any active Meta restriction
 * (with expiry + remediation), and the monthly tier. Surfaces trouble BEFORE Meta hides the call button.
 */
export function CallingHealth() {
  const { data } = useWhatsappCallingHealth();
  if (!data) return null;

  const pickupPct = Math.round(data.pickup.rate * 100);
  const restricted = data.restriction.active;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity size={16} /> Calling health
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {restricted ? (
          <div className="flex items-start gap-2 rounded-vq-card border border-vq-danger/40 bg-vq-danger/10 p-3">
            <AlertTriangle size={16} className="mt-0.5 text-vq-danger" />
            <div className="text-sm">
              <p className="font-medium text-vq-text-hi">Meta restricted your calling</p>
              <p className="text-vq-text-lo text-xs">
                {data.restriction.type}
                {data.restriction.expiresAt
                  ? ` · lifts ${new Date(data.restriction.expiresAt).toLocaleDateString()}`
                  : ''}
                . Calls are routed to phone meanwhile — keep pickup high and reports low to recover.
              </p>
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-col">
            <span className="text-vq-text-lo text-xs">Pickup rate (7d)</span>
            <span className="font-display font-semibold text-lg text-vq-text-hi">
              {data.pickup.attempts > 0 ? `${pickupPct}%` : '—'}
            </span>
            <span className="text-vq-text-lo text-xs">
              {data.pickup.answered}/{data.pickup.attempts} answered
            </span>
          </div>
          {data.pickup.throttled ? (
            <Badge variant="warn">
              <AlertTriangle size={12} /> Throttled — low pickup
            </Badge>
          ) : data.pickup.attempts > 0 ? (
            <Badge variant="success">Healthy</Badge>
          ) : null}
          <span className="ml-auto text-vq-text-lo text-xs">
            {data.monthly.minutes} min · tier {data.monthly.tier === 'tier1' ? '1' : '0'}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
