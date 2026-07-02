'use client';

import { Button } from '@vocaliq/ui';
import Link from 'next/link';
import { useAuth } from '../lib/auth';

/** Landing-page auth controls (client) — swaps between signed-in and signed-out. */
export function LandingAuth() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return null;

  if (isSignedIn) {
    return (
      <Link href="/dashboard">
        <Button variant="secondary" size="sm">
          Dashboard
        </Button>
      </Link>
    );
  }

  return (
    <>
      <Link href="/sign-in">
        <Button variant="ghost" size="sm">
          Sign in
        </Button>
      </Link>
      <Link href="/sign-up">
        <Button size="sm">Sign up</Button>
      </Link>
    </>
  );
}
