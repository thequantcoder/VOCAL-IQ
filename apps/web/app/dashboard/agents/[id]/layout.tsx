'use client';

import { useParams, usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { SubNav } from '../../../../components/sub-nav';

/**
 * Agent-detail shell (UX-07) — a persistent contextual sub-nav across an agent's sub-pages (Chat /
 * Learning / Memory / Guards / Tests) with the sliding active indicator, so moving between an agent's
 * tabs stays in place instead of feeling like separate destinations. The Builder is an immersive
 * full-canvas view, so it opts out (renders edge-to-edge, no sub-nav bar eating vertical space).
 */
export default function AgentDetailLayout({ children }: { children: ReactNode }) {
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const base = `/dashboard/agents/${params?.id ?? ''}`;

  // The builder owns the full viewport — don't wrap it.
  if (pathname?.endsWith('/builder')) return <>{children}</>;

  const items = [
    { href: `${base}/chat`, label: 'Chat' },
    { href: `${base}/builder`, label: 'Builder' },
    { href: `${base}/learning`, label: 'Learning' },
    { href: `${base}/memory`, label: 'Memory' },
    { href: `${base}/settings`, label: 'Guards' },
    { href: `${base}/tests`, label: 'Tests' },
  ];

  return (
    <div className="flex flex-col gap-5">
      <SubNav items={items} layoutId="agent-subnav" />
      <div>{children}</div>
    </div>
  );
}
