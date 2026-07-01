import type { ReactNode } from 'react';
import { DashboardShell } from '../../components/dashboard-shell';

/** All /dashboard routes render inside the shell (nav + header + error boundary). */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>;
}
