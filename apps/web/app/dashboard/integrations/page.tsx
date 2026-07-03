'use client';

import { Button, Card, CardContent, Input, cn } from '@vocaliq/ui';
import { CheckCircle2, Plug, Ticket, Trash2, Users } from 'lucide-react';
import { useState } from 'react';
import { EmptyState, ErrorState, LoadingCard } from '../../../components/states';
import {
  type ConnectorCatalogItem,
  type IntegrationDto,
  useConnectIntegration,
  useDisconnectIntegration,
  useIntegrationCatalog,
  useIntegrations,
  useTestIntegration,
} from '../../../lib/api';

const inputCls =
  'w-full rounded-vq border border-vq-border bg-vq-bg-base px-3 py-2 text-sm text-vq-text-hi focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vq-ring';

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

      {connecting && <ConnectForm connector={connecting} onDone={() => setConnecting(null)} />}

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
  const [accessToken, setToken] = useState('');
  const [ticketOnNegative, setTicket] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    try {
      await connect.mutateAsync({ type: connector.type, accessToken, ticketOnNegative });
      onDone();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-4">
        <p className="font-medium text-sm text-vq-text-hi">Connect {connector.label}</p>
        <label htmlFor="integ-token" className="flex flex-col gap-1 text-vq-text-lo text-xs">
          Access token (private-app / API token — stored sealed, never shown again)
          <Input
            id="integ-token"
            type="password"
            value={accessToken}
            onChange={(e) => setToken(e.target.value)}
            placeholder="pat-…"
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
          <Button size="sm" disabled={accessToken.length < 8 || connect.isPending} onClick={submit}>
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
