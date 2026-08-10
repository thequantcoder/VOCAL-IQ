'use client';

import { Button } from '@vocaliq/ui';
import { Zap } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';

/**
 * One-click dev/test login (testing phase only). Lists the seeded demo accounts; clicking one fills the
 * email + password fields (via `onFill`) AND signs in + redirects to the dashboard. Rendered ONLY on
 * localhost (or when NEXT_PUBLIC_DEV_LOGIN=true), so it never appears on a real deployment.
 */

export interface DevAccount {
  label: string;
  hint: string;
  email: string;
  password: string;
}

const ACCOUNTS: DevAccount[] = [
  {
    label: 'Customer / owner',
    hint: 'Full dashboard · Scale plan (all features)',
    email: 'demo@vocaliq.dev',
    password: 'VocalIQ!Demo123',
  },
  {
    label: 'Reseller admin',
    hint: 'White-label reseller portal',
    email: 'reseller@vocaliq.dev',
    password: 'VocalIQ!Reseller123',
  },
  {
    label: 'Platform super-admin',
    hint: 'Tenant mgmt · vault · governance',
    email: 'admin@vocaliq.dev',
    password: 'VocalIQ!Admin123',
  },
];

export function DevLogin({ onFill }: { onFill?: (email: string, password: string) => void }) {
  const { signIn } = useAuth();
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const h = window.location.hostname;
    setShow(h === 'localhost' || h === '127.0.0.1' || process.env.NEXT_PUBLIC_DEV_LOGIN === 'true');
  }, []);

  if (!show) return null;

  async function login(acc: DevAccount) {
    onFill?.(acc.email, acc.password); // visibly populate the fields
    setError(null);
    setBusy(acc.email);
    try {
      await signIn(acc.email, acc.password);
      router.push('/dashboard');
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  return (
    <div className="mt-6 flex flex-col gap-2 rounded-vq border border-vq-border border-dashed p-3">
      <div className="flex items-center gap-2 text-vq-text-lo text-xs">
        <Zap size={13} className="text-vq-violet" />
        <span className="font-medium text-vq-text-hi">One-click dev login</span> · testing only
      </div>
      <div className="flex flex-col gap-2">
        {ACCOUNTS.map((acc) => (
          <button
            key={acc.email}
            type="button"
            disabled={busy !== null}
            onClick={() => login(acc)}
            className="flex items-center justify-between gap-3 rounded-vq border border-vq-border px-3 py-2 text-left transition-colors hover:border-vq-violet hover:bg-vq-violet/5 disabled:opacity-60"
          >
            <span className="flex flex-col">
              <span className="font-medium text-sm text-vq-text-hi">{acc.label}</span>
              <span className="text-vq-text-lo text-xs">{acc.hint}</span>
              <span className="mt-0.5 font-mono text-[11px] text-vq-text-lo">{acc.email}</span>
            </span>
            <span className="shrink-0 text-vq-violet text-xs">
              {busy === acc.email ? 'Signing in…' : 'Log in →'}
            </span>
          </button>
        ))}
      </div>
      {error && <p className="text-vq-danger text-xs">{error}</p>}
    </div>
  );
}
