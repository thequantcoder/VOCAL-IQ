'use client';

import { Illustration } from '@vocaliq/ui';

/**
 * App Router global error boundary (DESIGN-SYSTEM §7). Catches errors in the root layout;
 * must render its own <html>/<body>. Also stops the pages-router `/_error` fallback that
 * pulls `<Html>` into static export and breaks `next build`.
 */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body>
        <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-vq-bg-base px-4 text-center">
          <Illustration name="error-500" size={132} />
          <h1 className="font-display font-semibold text-2xl text-vq-text-hi">
            Something went wrong
          </h1>
          <p className="text-sm text-vq-text-lo">An unexpected error occurred. Please try again.</p>
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-vq border border-vq-border px-4 py-2 text-sm text-vq-text-hi hover:bg-vq-bg-elevated"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
