'use client';

import {
  CHANNEL_EVENTS,
  NOTIFY_CHANNELS,
  NOTIFY_EVENTS,
  type NotifyChannel,
  isNotificationEnabled,
  prefKey,
} from '@vocaliq/shared';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@vocaliq/ui';
import { Bell } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ErrorState, LoadingCard } from '../../../../components/states';
import {
  type NotificationPrefs,
  useNotificationPrefs,
  useSetNotificationPrefs,
} from '../../../../lib/api';

const EVENT_LABEL: Record<string, string> = {
  'call.completed': 'Call completed',
  'call.failed': 'Call failed',
  'lead.created': 'Lead created',
  'lead.status_changed': 'Lead status changed',
  'campaign.finished': 'Campaign finished',
};
const CHANNEL_LABEL: Record<NotifyChannel, string> = { webhook: 'Webhook', slack: 'Slack' };

/**
 * Unified notification matrix (FOLLOWUP): a per-tenant event×channel grid that master-gates the
 * domain-event fan-out (on top of each channel's own config). Every cell defaults to ON; unchecking
 * one stores an explicit `false`. Channels only show a cell for events they can actually deliver.
 */
export default function NotificationsSettingsPage() {
  const prefs = useNotificationPrefs();
  const save = useSetNotificationPrefs();
  const [draft, setDraft] = useState<NotificationPrefs>({});
  const [saved, setSaved] = useState(false);

  // Seed the local draft from the server once it loads.
  useEffect(() => {
    if (prefs.data) setDraft(prefs.data);
  }, [prefs.data]);

  function toggle(event: string, channel: NotifyChannel) {
    const key = prefKey(event, channel);
    const next = { ...draft, [key]: !isNotificationEnabled(draft, event, channel) };
    setDraft(next);
    setSaved(false);
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 font-display font-semibold text-vq-text-hi text-xl">
          <Bell size={20} /> Notifications
        </h1>
        <p className="text-sm text-vq-text-lo">
          Choose which events notify each channel. This is a master switch on top of each channel's
          own setup (webhook subscriptions, Slack config). Everything is on by default.
        </p>
      </div>

      {prefs.isLoading ? (
        <LoadingCard rows={3} />
      ) : prefs.isError ? (
        <ErrorState message={(prefs.error as Error).message} onRetry={() => prefs.refetch()} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Event × channel</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-vq-text-lo text-xs">
                    <th className="pb-2 text-left font-medium">Event</th>
                    {NOTIFY_CHANNELS.map((ch) => (
                      <th key={ch} className="px-3 pb-2 text-center font-medium">
                        {CHANNEL_LABEL[ch]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {NOTIFY_EVENTS.map((event) => (
                    <tr key={event} className="border-vq-border border-t">
                      <td className="py-2 text-vq-text-hi">{EVENT_LABEL[event] ?? event}</td>
                      {NOTIFY_CHANNELS.map((ch) => {
                        const supported = (CHANNEL_EVENTS[ch] as readonly string[]).includes(event);
                        return (
                          <td key={ch} className="px-3 py-2 text-center">
                            {supported ? (
                              <input
                                type="checkbox"
                                aria-label={`${EVENT_LABEL[event] ?? event} → ${CHANNEL_LABEL[ch]}`}
                                checked={isNotificationEnabled(draft, event, ch)}
                                onChange={() => toggle(event, ch)}
                                className="size-4 accent-[var(--brand)]"
                              />
                            ) : (
                              <span
                                className="text-vq-text-lo text-xs"
                                title="Not delivered on this channel"
                              >
                                —
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="primary"
                loading={save.isPending}
                onClick={() =>
                  save.mutate(draft, {
                    onSuccess: () => setSaved(true),
                  })
                }
              >
                Save preferences
              </Button>
              {saved && <span className="text-vq-success text-sm">Saved ✓</span>}
              {save.isError && (
                <span className="text-vq-danger text-sm">{(save.error as Error).message}</span>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
