import { SignUp } from '@clerk/nextjs';

/** Clerk-hosted sign-up (catch-all route). */
export default function SignUpPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <SignUp />
    </main>
  );
}
