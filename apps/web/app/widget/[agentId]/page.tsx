'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { WebCallWidget } from '../../../components/web-call-widget';
import { messageFromError } from '../../../lib/api-error';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface WidgetConfig {
  agentId: string;
  name: string;
  branding: { color?: string } | null;
}

/**
 * Public web-call widget host (Day 16) — embeddable via iframe on any site. Fetches the
 * agent's public config (name + tenant branding) and centres the call widget on a
 * themeable surface. No auth: the backend gates on published-agent + rate limit.
 */
export default function WidgetPage() {
  const params = useParams<{ agentId: string }>();
  const agentId = params?.agentId ?? '';
  const [config, setConfig] = useState<WidgetConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!agentId) return;
    let alive = true;
    fetch(`${API_URL}/widget/config/${agentId}`)
      .then(async (r) => {
        const data: unknown = await r.json();
        if (!r.ok) throw new Error(messageFromError(data));
        return data as WidgetConfig;
      })
      .then((c) => alive && setConfig(c))
      .catch((e) => alive && setError(messageFromError(e)));
    return () => {
      alive = false;
    };
  }, [agentId]);

  const accent = config?.branding?.color;

  return (
    <main
      className="flex min-h-screen items-center justify-center bg-vq-bg-base p-4"
      style={accent ? ({ ['--vq-violet' as string]: accent } as React.CSSProperties) : undefined}
    >
      {error ? (
        <p className="text-sm text-vq-text-lo">{error}</p>
      ) : config ? (
        <WebCallWidget agentId={config.agentId} agentName={config.name} />
      ) : (
        <div
          className="h-40 w-full max-w-sm animate-pulse rounded-vq-card bg-vq-bg-elevated"
          aria-hidden
        />
      )}
    </main>
  );
}
