'use client';

import { Badge, Card, CardContent, CardHeader, CardTitle } from '@vocaliq/ui';
import { Activity, AlertTriangle } from 'lucide-react';
import { useWhatsappCallingHealth } from '../../../lib/api';
import { useI18n } from '../../../lib/i18n/provider';

/**
 * WhatsApp-calling health widget (WAC-09) — pickup rate + throttle state, any active Meta restriction
 * (with expiry + remediation), and the monthly tier. Surfaces trouble BEFORE Meta hides the call button.
 */
export function CallingHealth() {
  const { t } = useI18n();
  const { data } = useWhatsappCallingHealth();
  if (!data) return null;

  const pickupPct = Math.round(data.pickup.rate * 100);
  const restricted = data.restriction.active;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity size={16} /> {t('Calling health')}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {restricted ? (
          <div className="flex items-start gap-2 rounded-vq-card border border-vq-danger/40 bg-vq-danger/10 p-3">
            <AlertTriangle size={16} className="mt-0.5 text-vq-danger" />
            <div className="text-sm">
              <p className="font-medium text-vq-text-hi">{t('Meta restricted your calling')}</p>
              <p className="text-vq-text-lo text-xs">
                {data.restriction.type}
                {data.restriction.expiresAt
                  ? ` · ${t('lifts {date}', { date: new Date(data.restriction.expiresAt).toLocaleDateString() })}`
                  : ''}
                {t(
                  '. Calls are routed to phone meanwhile — keep pickup high and reports low to recover.',
                )}
              </p>
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-col">
            <span className="text-vq-text-lo text-xs">{t('Pickup rate (7d)')}</span>
            <span className="font-display font-semibold text-lg text-vq-text-hi">
              {data.pickup.attempts > 0 ? `${pickupPct}%` : '—'}
            </span>
            <span className="text-vq-text-lo text-xs">
              {t('{answered}/{attempts} answered', {
                answered: data.pickup.answered,
                attempts: data.pickup.attempts,
              })}
            </span>
          </div>
          {data.pickup.throttled ? (
            <Badge variant="warn">
              <AlertTriangle size={12} /> {t('Throttled — low pickup')}
            </Badge>
          ) : data.pickup.attempts > 0 ? (
            <Badge variant="success">{t('Healthy')}</Badge>
          ) : null}
          <span className="ml-auto text-vq-text-lo text-xs">
            {t('{n} min · tier {tier}', {
              n: data.monthly.minutes,
              tier: data.monthly.tier === 'tier1' ? '1' : '0',
            })}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
