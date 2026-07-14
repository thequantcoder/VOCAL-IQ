'use client';

import { type ApiOperation, apiReferenceGroups, buildCurl } from '@vocaliq/shared';
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@vocaliq/ui';
import { Check, Copy, KeyRound, Play, Terminal } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const METHOD_COLOR: Record<string, string> = {
  get: 'border-vq-info/40 text-vq-info',
  post: 'border-vq-success/40 text-vq-success',
};

/**
 * In-dashboard interactive API reference (PARITY-09). Renders the public API from the shared
 * OpenAPI source of truth: grouped endpoints with params, a copy-ready curl (base URL + a key the
 * user pastes — never embedded), and a guarded live "Try it" that calls the real API and shows the
 * response. The key lives only in component state (never persisted or shipped in HTML).
 */
export default function ApiReferencePage() {
  const [apiKey, setApiKey] = useState('');
  const groups = apiReferenceGroups();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 font-display font-semibold text-vq-text-hi text-xl">
          <Terminal size={20} /> API reference
        </h1>
        <p className="text-sm text-vq-text-lo">
          Every public endpoint with copy-ready curl and a live “Try it”. Base URL{' '}
          <code className="rounded bg-vq-bg-elev px-1 text-vq-text-hi text-xs">{API_URL}</code>.{' '}
          <Link href="/dashboard/developers" className="text-vq-violet underline">
            Manage API keys →
          </Link>
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-2 py-4">
          <label
            htmlFor="api-key"
            className="flex items-center gap-2 font-medium text-sm text-vq-text-hi"
          >
            <KeyRound size={15} /> Your API key
          </label>
          <Input
            id="api-key"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="vq_live_…  (paste to fill curl + enable Try it)"
            autoComplete="off"
          />
          <p className="text-vq-text-lo text-xs">
            Used only in your browser to sign these requests — it is never stored or sent anywhere
            but the API.
          </p>
        </CardContent>
      </Card>

      {groups.map((g) => (
        <div key={g.group} className="flex flex-col gap-3">
          <h2 className="font-display font-semibold text-vq-text-hi">{g.group}</h2>
          {g.operations.map((op) => (
            <OperationCard key={`${op.method} ${op.path}`} op={op} apiKey={apiKey} />
          ))}
        </div>
      ))}
    </div>
  );
}

function OperationCard({ op, apiKey }: { op: ApiOperation; apiKey: string }) {
  const [body, setBody] = useState(op.bodyExample ? JSON.stringify(op.bodyExample, null, 2) : '');
  const [copied, setCopied] = useState(false);
  const [resp, setResp] = useState<{ status: number; text: string } | null>(null);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function parsedBody(): Record<string, unknown> | undefined {
    if (op.method !== 'post' || !body.trim()) return undefined;
    try {
      return JSON.parse(body) as Record<string, unknown>;
    } catch {
      return undefined;
    }
  }

  const curl = buildCurl({
    baseUrl: API_URL,
    apiKey,
    method: op.method,
    path: op.path,
    ...(op.method === 'post' ? { body: parsedBody() ?? op.bodyExample } : {}),
  });

  async function copy() {
    await navigator.clipboard.writeText(curl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function tryIt() {
    setErr(null);
    setResp(null);
    setRunning(true);
    try {
      const res = await fetch(`${API_URL}${op.path}`, {
        method: op.method.toUpperCase(),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          ...(op.method === 'post' ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(op.method === 'post' ? { body: body || '{}' } : {}),
      });
      const text = await res.text();
      let pretty = text;
      try {
        pretty = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        /* non-JSON — show raw */
      }
      setResp({ status: res.status, text: pretty });
    } catch (e) {
      setErr((e as Error).message || 'Request failed (network / CORS)');
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
          <span
            className={`rounded-vq-pill border px-2 py-0.5 font-mono text-xs uppercase ${METHOD_COLOR[op.method] ?? ''}`}
          >
            {op.method}
          </span>
          <code className="text-vq-text-hi">{op.path}</code>
          <span className="ml-auto rounded-vq-pill border border-vq-border px-2 py-0.5 text-vq-text-lo text-xs">
            {op.scope}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-vq-text-lo">{op.summary}</p>

        {op.params && op.params.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="font-medium text-vq-text-hi text-xs">Query parameters</span>
            <ul className="flex flex-col gap-0.5">
              {op.params.map((p) => (
                <li key={p.name} className="flex flex-wrap items-baseline gap-2 text-xs">
                  <code className="text-vq-text-hi">{p.name}</code>
                  <span className="text-vq-text-lo">
                    {p.description}
                    {p.example ? ` (e.g. ${p.example})` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {op.method === 'post' && (
          <label className="flex flex-col gap-1">
            <span className="font-medium text-vq-text-hi text-xs">Request body (JSON)</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={Math.min(8, body.split('\n').length + 1)}
              spellCheck={false}
              className="w-full rounded-vq border border-vq-border bg-vq-bg-base px-3 py-2 font-mono text-vq-text-hi text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vq-ring"
            />
          </label>
        )}

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="font-medium text-vq-text-hi text-xs">curl</span>
            <button
              type="button"
              onClick={copy}
              className="flex items-center gap-1 text-vq-text-lo text-xs hover:text-vq-text-hi"
            >
              {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <pre className="overflow-x-auto rounded-vq border border-vq-border bg-vq-bg-elev p-2.5 font-mono text-[0.7rem] text-vq-text-hi">
            {curl}
          </pre>
        </div>

        <div className="flex items-center gap-3">
          <Button size="sm" onClick={tryIt} loading={running} disabled={!apiKey.trim()}>
            <Play size={14} /> Try it
          </Button>
          {!apiKey.trim() && <span className="text-vq-text-lo text-xs">Paste a key to enable</span>}
          {err && <span className="text-vq-danger text-xs">{err}</span>}
        </div>

        {resp && (
          <div className="flex flex-col gap-1">
            <span
              className={`font-medium text-xs ${resp.status < 300 ? 'text-vq-success' : 'text-vq-danger'}`}
            >
              {resp.status}
            </span>
            <pre className="max-h-72 overflow-auto rounded-vq border border-vq-border bg-vq-bg-elev p-2.5 font-mono text-[0.7rem] text-vq-text-hi">
              {resp.text}
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
