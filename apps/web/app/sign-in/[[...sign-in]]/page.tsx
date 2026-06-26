import { SignIn } from '@clerk/nextjs';

/** Clerk-hosted sign-in (catch-all route). Renders whatever methods are enabled
 * in the Clerk dashboard — email+password today, more later with no code change. */
export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <SignIn />
    </main>
  );
}
