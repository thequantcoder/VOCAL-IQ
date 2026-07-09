'use client';

import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@vocaliq/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { DevLogin } from '../../../components/dev-login';
import { useAuth } from '../../../lib/auth';

/** Self-hosted sign-in (email + password → JWT). Replaces Clerk. */
export default function SignInPage() {
  const { signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signIn(email, password);
      router.push('/dashboard');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <Card>
        <CardHeader>
          <CardTitle>Sign in to VocalIQ</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-3" onSubmit={onSubmit}>
            <label htmlFor="email" className="flex flex-col gap-1 text-sm text-vq-text-lo">
              Email
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label htmlFor="password" className="flex flex-col gap-1 text-sm text-vq-text-lo">
              Password
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {error && <p className="text-sm text-vq-danger">{error}</p>}
            <Button type="submit" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-vq-text-lo">
            No account?{' '}
            <Link href="/sign-up" className="text-vq-violet hover:underline">
              Create one
            </Link>
          </p>

          <DevLogin
            onFill={(e, p) => {
              setEmail(e);
              setPassword(p);
            }}
          />
        </CardContent>
      </Card>
    </main>
  );
}
