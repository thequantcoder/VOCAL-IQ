'use client';

import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@vocaliq/ui';
import { Plug, Plus, RefreshCw, ShieldAlert, ShieldCheck, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { EmptyState, ErrorState, LoadingCard } from '../../../components/states';
import {
  type McpServer,
  type TrustContext,
  useDeleteMcpServer,
  useDiscoverMcpTools,
  useMcpServers,
  useRegisterMcpServer,
} from '../../../lib/api';

const TRUST_LABEL: Record<TrustContext, string> = {
  HIGH: 'High — vetted, full access',
  LOW: 'Low — external, read-only',
  UNKNOWN: 'Unknown — treated as low',
};

/** MCP / tool servers (Day 46): register external tool servers with a trust context + timeout. */
export default function McpPage() {
  const servers = useMcpServers();
  const [creating, setCreating] = useState(false);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2 font-display font-semibold text-vq-text-hi text-xl">
            <Plug size={20} /> Tool servers (MCP)
          </h1>
          <p className="text-sm text-vq-text-lo">
            Connect external tool / MCP servers. Untrusted servers only expose read-only tools;
            every call is timeout-bounded and audited.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreating((v) => !v)}>
          <Plus size={16} /> Add server
        </Button>
      </div>

      {creating && <RegisterForm onDone={() => setCreating(false)} />}

      {servers.isLoading ? (
        <LoadingCard rows={2} />
      ) : servers.isError ? (
        <ErrorState message={(servers.error as Error).message} onRetry={() => servers.refetch()} />
      ) : !servers.data || servers.data.length === 0 ? (
        <EmptyState
          title="No tool servers"
          hint="Add an MCP server URL and choose its trust context."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {servers.data.map((s) => (
            <ServerRow key={s.id} server={s} />
          ))}
        </div>
      )}
    </div>
  );
}

function ServerRow({ server }: { server: McpServer }) {
  const discover = useDiscoverMcpTools();
  const del = useDeleteMcpServer();
  const untrusted = server.trustContext !== 'HIGH';

  return (
    <Card>
      <CardContent className="flex flex-col gap-2 py-4">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              {untrusted ? (
                <ShieldAlert size={15} className="text-vq-warn" />
              ) : (
                <ShieldCheck size={15} className="text-vq-success" />
              )}
              <span className="font-medium text-vq-text-hi">{server.name}</span>
              <span className="rounded-vq-pill border border-vq-border px-2 py-0.5 text-vq-text-lo text-xs">
                {TRUST_LABEL[server.trustContext]}
              </span>
            </div>
            <span className="truncate text-vq-text-lo text-xs">
              {server.url} · {Math.round(server.timeoutMs / 1000)}s timeout
              {server.hasAuth ? ' · auth set' : ''}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={discover.isPending}
              onClick={() => discover.mutate(server.id)}
            >
              <RefreshCw size={14} className={discover.isPending ? 'animate-spin' : ''} /> Discover
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={del.isPending}
              onClick={() => del.mutate(server.id)}
            >
              <Trash2 size={14} />
            </Button>
          </div>
        </div>
        {server.tools.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-vq-border border-t pt-2">
            {server.tools.map((t) => (
              <span
                key={t.name}
                title={t.description}
                className={`rounded-vq-pill border px-2 py-0.5 text-xs ${
                  untrusted && !t.readOnly
                    ? 'border-vq-border text-vq-text-lo line-through'
                    : 'border-vq-violet/30 text-vq-text-hi'
                }`}
              >
                {t.name}
                {t.readOnly ? ' ·ro' : t.destructive ? ' ·!' : ''}
              </span>
            ))}
          </div>
        )}
        {discover.isError && (
          <p className="text-vq-danger text-xs">{(discover.error as Error).message}</p>
        )}
      </CardContent>
    </Card>
  );
}

function RegisterForm({ onDone }: { onDone: () => void }) {
  const register = useRegisterMcpServer();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [trustContext, setTrust] = useState<TrustContext>('UNKNOWN');
  const [timeoutSec, setTimeoutSec] = useState(30);
  const [authHeader, setAuthHeader] = useState('');

  const valid = name.trim().length > 0 && /^https?:\/\//.test(url);

  async function submit() {
    if (!valid) return;
    await register.mutateAsync({
      name: name.trim(),
      url: url.trim(),
      trustContext,
      timeoutMs: timeoutSec * 1000,
      ...(authHeader.trim() ? { authHeader: authHeader.trim() } : {}),
    });
    onDone();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Add tool server</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Input placeholder="Server name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input
          placeholder="https://mcp.example.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <div className="flex flex-wrap gap-3">
          <label htmlFor="mcp-trust" className="flex flex-col gap-1 text-vq-text-lo text-xs">
            Trust context
            <select
              id="mcp-trust"
              value={trustContext}
              onChange={(e) => setTrust(e.target.value as TrustContext)}
              className="rounded-vq border border-vq-border bg-transparent px-2 py-1.5 text-sm text-vq-text-hi"
            >
              <option value="UNKNOWN">Unknown (treated as low)</option>
              <option value="LOW">Low — external, read-only</option>
              <option value="HIGH">High — vetted, full access</option>
            </select>
          </label>
          <label htmlFor="mcp-timeout" className="flex flex-col gap-1 text-vq-text-lo text-xs">
            Timeout (s, 5–120)
            <Input
              id="mcp-timeout"
              type="number"
              min={5}
              max={120}
              value={timeoutSec}
              onChange={(e) => setTimeoutSec(Number(e.target.value))}
              className="w-24"
            />
          </label>
        </div>
        <Input
          placeholder="Authorization header (optional, e.g. Bearer …)"
          value={authHeader}
          onChange={(e) => setAuthHeader(e.target.value)}
        />
        {register.isError && (
          <p className="text-vq-danger text-xs">{(register.error as Error).message}</p>
        )}
        <div className="flex gap-2">
          <Button size="sm" disabled={!valid || register.isPending} onClick={submit}>
            {register.isPending ? 'Adding…' : 'Add server'}
          </Button>
          <Button size="sm" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
