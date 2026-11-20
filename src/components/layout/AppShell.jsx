import { Outlet } from 'react-router-dom';
import { useWorkspace } from '@/context/WorkspaceContext';
import { Header } from './Header';
import { BottomNav } from './BottomNav';

export function AppShell() {
  const { workspaceId } = useWorkspace();
  return (
    <div className="min-h-dvh">
      <Header />
      <main key={workspaceId} className="mx-auto max-w-2xl px-4 pb-[calc(env(safe-area-inset-bottom)+6.5rem)] pt-5">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}

export function PageHeader({ title, subtitle, action }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-ink-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-ink-500">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
