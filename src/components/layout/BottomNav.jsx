import { NavLink } from 'react-router-dom';
import { Newspaper, Map as MapIcon, ClipboardList, Activity, Settings } from 'lucide-react';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useTickets } from '@/hooks/useWorkspaceData';
import { cn } from '@/lib/utils';

export function BottomNav() {
  const { isDeveloper } = useWorkspace();
  const { tickets } = useTickets();
  const openTickets = tickets.filter((t) => t.status !== 'completed').length;

  const items = [
    { to: '/', label: 'Feed', icon: Newspaper, end: true },
    { to: '/roadmap', label: 'Roadmap', icon: MapIcon },
    { to: '/requests', label: 'Requests', icon: ClipboardList, badge: openTickets },
    ...(isDeveloper ? [{ to: '/activity', label: 'Webhooks', icon: Activity }] : []),
    { to: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-200/70 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg" aria-label="Primary">
      <ul className="mx-auto flex max-w-2xl">
        {items.map(({ to, label, icon: Icon, end, badge }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                cn('relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors', isActive ? 'text-brand-600' : 'text-ink-400 hover:text-ink-600')
              }
            >
              {({ isActive }) => (
                <>
                  <span className={cn('relative flex h-8 w-12 items-center justify-center rounded-full transition-colors', isActive && 'bg-brand-50')}>
                    <Icon className="h-[21px] w-[21px]" strokeWidth={isActive ? 2.25 : 1.75} />
                    {badge > 0 && (
                      <span className="absolute right-1.5 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">
                        {badge}
                      </span>
                    )}
                  </span>
                  {label}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
