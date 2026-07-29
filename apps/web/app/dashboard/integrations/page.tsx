'use client';

import { Button, Card, CardContent, Input, cn } from '@vocaliq/ui';
import { CheckCircle2, Plug, Slack, Ticket, Trash2, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { EmptyState, ErrorState, LoadingCard } from '../../../components/states';
import {
  type ConnectorCatalogItem,
  type IntegrationDto,
  type SlackConfig,
  useConnectIntegration,
  useDisconnectIntegration,
  useIntegrationCatalog,
  useIntegrations,
  useSaveSlack,
  useSlackConfig,
  useTestIntegration,
  useTestSlack,
} from '../../../lib/api';

const SLACK_EVENTS: { key: keyof SlackConfig['events']; label: string }[] = [
  { key: 'call.completed', label: 'Call completed' },
  { key: 'call.failed', label: 'Call failed' },
  { key: 'lead.created', label: 'New lead created' },
];

/**
 * Slack per-event notifications: paste a Slack Incoming Webhook URL, toggle which events post, and
 * send a test. The URL is masked once saved (write-only, like other credentials).
 */
function SlackNotifications() {
  const cfg = useSlackConfig();
  const save = useSaveSlack();
  const test = useTestSlack();
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<SlackConfig['events']>({});

  useEffect(() => {
    if (cfg.data) setEvents(cfg.data.events ?? {});
  }, [cfg.data]);

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-4">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-2 font-medium text-vq-text-hi">
            <Slack size={16} /> Slack notifications
          </p>
          {cfg.data?.connected && (
            <span className="flex items-center gap-1 rounded-vq-pill border border-vq-success/40 bg-vq-success/10 px-2 py-0.5 text-[11px] text-vq-success">
              <CheckCircle2 size={12} /> connected
            </span>
          )}
        </div>
        <p className="text-sm text-vq-text-lo">
          Post per-event messages to a Slack channel via an Incoming Webhook URL.
        </p>
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={cfg.data?.webhookUrl ?? 'https://hooks.slack.com/services/...'}
          aria-label="Slack incoming webhook URL"
        />
        <div className="flex flex-wrap gap-3">
          {SLACK_EVENTS.map((ev) => (
            <label key={ev.key} className="flex items-center gap-1.5 text-sm text-vq-text-hi">
              <input
                type="checkbox"
                checked={events[ev.key] !== false}
                onChange={(e) => setEvents((prev) => ({ ...prev, [ev.key]: e.target.checked }))}
              />
              {ev.label}
            </label>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            loading={save.isPending}
            onClick={() =>
              save.mutate({ ...(url.trim() ? { webhookUrl: url.trim() } : {}), events })
            }
          >
            Save
          </Button>
          <Button
            variant="ghost"
            size="sm"
            loading={test.isPending}
            disabled={!cfg.data?.connected}
            onClick={() => test.mutate()}
          >
            Send test
          </Button>
          {test.data && (
            <span className="text-vq-text-lo text-xs">
              {test.data.delivered ? 'Test sent ✓' : 'Delivery failed'}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

const inputCls =
  'w-full rounded-vq border border-vq-border bg-vq-bg-base px-3 py-2 text-sm text-vq-text-hi focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vq-ring';

/**
 * Per-connector connect fields: the access-token label + any non-secret settings the backend needs to
 * build the live connector (Zendesk `subdomain`, Salesforce `instanceUrl`, Webhook/Zapier `url`). Keyed
 * by integration type; a type not listed just needs the access token (HubSpot).
 */
interface ConnectSetting {
  key: string;
  label: string;
  placeholder: string;
}
const CONNECT_FIELDS: Record<
  string,
  { tokenLabel: string; tokenPlaceholder: string; settings: ConnectSetting[] }
> = {
  HUBSPOT: {
    tokenLabel: 'Private-app token — stored sealed, never shown again',
    tokenPlaceholder: 'pat-…',
    settings: [],
  },
  ZENDESK: {
    tokenLabel: 'OAuth access token — stored sealed, never shown again',
    tokenPlaceholder: 'Zendesk OAuth token',
    settings: [
      { key: 'subdomain', label: 'Zendesk subdomain', placeholder: 'acme → acme.zendesk.com' },
    ],
  },
  SALESFORCE: {
    tokenLabel: 'OAuth access token — stored sealed, never shown again',
    tokenPlaceholder: 'Salesforce access token',
    settings: [
      { key: 'instanceUrl', label: 'Instance URL', placeholder: 'https://acme.my.salesforce.com' },
    ],
  },
  WEBHOOK: {
    tokenLabel: 'Signing secret — sent as an Authorization: Bearer header',
    tokenPlaceholder: 'a shared secret (≥ 8 chars)',
    settings: [
      { key: 'url', label: 'Webhook URL', placeholder: 'https://your-endpoint.example.com/hook' },
    ],
  },
  ZAPIER: {
    tokenLabel: 'Signing secret — sent as an Authorization: Bearer header',
    tokenPlaceholder: 'a shared secret (≥ 8 chars)',
    settings: [
      {
        key: 'url',
        label: 'Zapier catch-hook URL',
        placeholder: 'https://hooks.zapier.com/hooks/catch/…',
      },
    ],
  },
};

/**
 * Integrations (Day 40): connect a CRM/helpdesk so completed calls sync the contact +
 * qualification + sentiment (and open a ticket on a bad call). HubSpot is live; others show
 * as "coming soon". Tokens are write-only — entered here, never shown again.
 */
export default function IntegrationsPage() {
  const catalog = useIntegrationCatalog();
  const connected = useIntegrations();
  const [connecting, setConnecting] = useState<ConnectorCatalogItem | null>(null);

  const byType = new Map((connected.data ?? []).map((i) => [i.type, i]));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 font-display font-semibold text-vq-text-hi text-xl">
          <Plug size={20} /> Integrations
        </h1>
        <p className="text-sm text-vq-text-lo">
          Sync calls to your CRM / helpdesk — contact upsert, qualification + sentiment, and tickets
          on negative calls.
        </p>
      </div>

      <SlackNotifications />

      {connecting && <ConnectForm connector={connecting} onDone={() => setConnecting(null)} />}

      <h2 className="font-display font-semibold text-lg text-vq-text-hi">CRM & Helpdesk</h2>
      {catalog.isLoading ? (
        <LoadingCard rows={4} />
      ) : catalog.isError ? (
        <ErrorState message={(catalog.error as Error).message} onRetry={() => catalog.refetch()} />
      ) : !catalog.data ? (
        <EmptyState title="No connectors" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {catalog.data.map((c) => (
            <ConnectorCard
              key={c.type}
              connector={c}
              integration={byType.get(c.type) ?? null}
              onConnect={() => setConnecting(c)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ConnectorCard({
  connector,
  integration,
  onConnect,
}: {
  connector: ConnectorCatalogItem;
  integration: IntegrationDto | null;
  onConnect: () => void;
}) {
  const test = useTestIntegration();
  const disconnect = useDisconnectIntegration();
  const [tested, setTested] = useState<boolean | null>(null);

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-4">
        <div className="flex items-center justify-between">
          <p className="font-medium text-vq-text-hi">{connector.label}</p>
          {integration ? (
            <span className="flex items-center gap-1 rounded-vq-pill border border-vq-success/40 bg-vq-success/10 px-2 py-0.5 text-[11px] text-vq-success">
              <CheckCircle2 size={12} /> connected
            </span>
          ) : connector.implemented ? (
            <span className="rounded-vq-pill border border-vq-border px-2 py-0.5 text-[11px] text-vq-text-lo">
              available
            </span>
          ) : (
            <span className="rounded-vq-pill border border-vq-border px-2 py-0.5 text-[11px] text-vq-text-lo">
              coming soon
            </span>
          )}
        </div>

        <div className="flex gap-3 text-vq-text-lo text-xs">
          {connector.capabilities.contacts && (
            <span className="flex items-center gap-1">
              <Users size={13} /> Contacts
            </span>
          )}
          {connector.capabilities.tickets && (
            <span className="flex items-center gap-1">
              <Ticket size={13} /> Tickets
            </span>
          )}
        </div>

        {integration ? (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => test.mutate(integration.id, { onSuccess: (r) => setTested(r.ok) })}
            >
              {test.isPending ? 'Testing…' : 'Test'}
            </Button>
            {tested !== null && (
              <span className={cn('text-xs', tested ? 'text-vq-success' : 'text-vq-danger')}>
                {tested ? 'auth OK' : 'auth failed'}
              </span>
            )}
            <button
              type="button"
              aria-label="Disconnect"
              onClick={() => disconnect.mutate(integration.id)}
              className="ml-auto rounded-vq p-1.5 text-vq-text-lo hover:text-vq-danger"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ) : (
          <Button size="sm" disabled={!connector.implemented} onClick={onConnect}>
            Connect
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function ConnectForm({
  connector,
  onDone,
}: {
  connector: ConnectorCatalogItem;
  onDone: () => void;
}) {
  const connect = useConnectIntegration();
  const fields = CONNECT_FIELDS[connector.type] ?? {
    tokenLabel: 'Access token — stored sealed, never shown again',
    tokenPlaceholder: 'token',
    settings: [],
  };
  const [accessToken, setToken] = useState('');
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [ticketOnNegative, setTicket] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const missingSetting = fields.settings.some((s) => !settings[s.key]?.trim());

  async function submit() {
    setError(null);
    try {
      const filled = Object.fromEntries(
        fields.settings.map((s) => [s.key, settings[s.key]?.trim() ?? '']),
      );
      await connect.mutateAsync({
        type: connector.type,
        accessToken,
        ticketOnNegative,
        ...(fields.settings.length > 0 ? { settings: filled } : {}),
      });
      onDone();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-4">
        <p className="font-medium text-sm text-vq-text-hi">Connect {connector.label}</p>
        {fields.settings.map((s) => (
          <label
            key={s.key}
            htmlFor={`integ-${s.key}`}
            className="flex flex-col gap-1 text-vq-text-lo text-xs"
          >
            {s.label}
            <Input
              id={`integ-${s.key}`}
              value={settings[s.key] ?? ''}
              onChange={(e) => setSettings((prev) => ({ ...prev, [s.key]: e.target.value }))}
              placeholder={s.placeholder}
            />
          </label>
        ))}
        <label htmlFor="integ-token" className="flex flex-col gap-1 text-vq-text-lo text-xs">
          {fields.tokenLabel}
          <Input
            id="integ-token"
            type="password"
            value={accessToken}
            onChange={(e) => setToken(e.target.value)}
            placeholder={fields.tokenPlaceholder}
          />
        </label>
        {connector.capabilities.tickets && (
          <label className="flex items-center gap-2 text-sm text-vq-text-lo">
            <input
              type="checkbox"
              checked={ticketOnNegative}
              onChange={(e) => setTicket(e.target.checked)}
            />
            Open a ticket automatically when a call ends negative
          </label>
        )}
        {error && <p className="text-vq-danger text-xs">{error}</p>}
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={accessToken.length < 8 || missingSetting || connect.isPending}
            onClick={submit}
          >
            {connect.isPending ? 'Connecting…' : 'Connect'}
          </Button>
          <Button size="sm" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
