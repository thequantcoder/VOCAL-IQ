import { Illustration } from '@vocaliq/ui';
import Link from 'next/link';

/**
 * App Router 404 (DESIGN-SYSTEM §7). Providing this also keeps `next build` from falling
 * back to the pages-router `/_error` + `<Html>` prerender path that breaks static export.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-vq-bg-base px-4 text-center">
      <Illustration name="error-404" size={132} />
      <h1 className="font-display font-semibold text-2xl text-vq-text-hi">Page not found</h1>
      <p className="text-sm text-vq-text-lo">
        The page you're looking for doesn't exist or has moved.
      </p>
      <Link
        href="/"
        className="rounded-vq border border-vq-border px-4 py-2 text-sm text-vq-text-hi hover:bg-vq-bg-elevated"
      >
        Back home
      </Link>
    </main>
  );
}
