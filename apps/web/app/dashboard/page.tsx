import { UserButton } from '@clerk/nextjs';
import { currentUser } from '@clerk/nextjs/server';
import { Card, CardContent, CardHeader, CardTitle, Waveform } from '@vocaliq/ui';

/**
 * Protected dashboard (middleware enforces auth). Server component — reads the
 * verified user from Clerk on the server. The real app shell lands on later days;
 * this proves the protected surface + session work end-to-end.
 */
export default async function DashboardPage() {
  const user = await currentUser();
  const name = user?.firstName ?? user?.primaryEmailAddress?.emailAddress ?? 'there';

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-6 py-12">
      <header className="flex items-center justify-between">
        <span className="rounded-vq-pill border border-vq-border px-3 py-1 text-sm text-vq-text-lo">
          Dashboard · signed in
        </span>
        <UserButton />
      </header>

      <div className="h-16 w-full max-w-sm">
        <Waveform label="VocalIQ" bars={28} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Welcome back, {name}.</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm text-vq-text-lo">
          <p>
            You're authenticated. Tenancy, RBAC, and the agent builder arrive on the days ahead.
          </p>
          <p className="font-mono text-xs">user id: {user?.id ?? 'unknown'}</p>
        </CardContent>
      </Card>
    </main>
  );
}
