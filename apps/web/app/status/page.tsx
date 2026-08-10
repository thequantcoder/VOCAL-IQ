'use client';

import { useEffect, useState } from 'react';

interface Status {
  status: 'operational' | 'degraded';
  services: { name: string; ok: boolean }[];
}

/**
 * Public status page (Day 66) — unauthenticated. Polls the API's /status endpoint and shows a
 * simple operational/degraded banner + per-service dots. External uptime monitors point here.
 */
export default function StatusPage() {
  const [data, setData] = useState<Status | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_URL ?? '';
    const load = () =>
      fetch(`${base}/status`)
        .then((r) => r.json())
        .then(setData)
        .catch(() => setErr(true));
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);

  const ok = data?.status === 'operational';

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 px-6 py-16">
      <h1 className="font-display font-semibold text-vq-text-hi text-2xl">VocalIQ Status</h1>
      {err ? (
        <p className="text-vq-danger text-sm">Unable to reach the status endpoint.</p>
      ) : !data ? (
        <p className="text-vq-text-lo text-sm">Checking…</p>
      ) : (
        <>
          <div
            className={`rounded-vq border px-4 py-3 text-sm ${
              ok ? 'border-vq-success/40 text-vq-success' : 'border-vq-warn/40 text-vq-warn'
            }`}
          >
            {ok ? 'All systems operational' : 'Degraded performance'}
          </div>
          <ul className="flex flex-col divide-y divide-vq-border">
            {data.services.map((svc) => (
              <li key={svc.name} className="flex items-center justify-between py-2 text-sm">
                <span className="text-vq-text-hi capitalize">{svc.name}</span>
                <span className={svc.ok ? 'text-vq-success' : 'text-vq-danger'}>
                  {svc.ok ? '● operational' : '● down'}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
