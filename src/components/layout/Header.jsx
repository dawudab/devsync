import { backend } from '@/lib/data';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import { ViewSwitcher } from './ViewSwitcher';

export function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-ink-200/70 bg-white/85 pt-[env(safe-area-inset-top)] backdrop-blur-lg">
      {backend.mode === 'demo' && (
        <div className="bg-ink-900 px-4 py-1 text-center text-[11px] font-medium text-white/80">
          Demo Mode · open a second tab to see real-time sync
        </div>
      )}
      <div className="mx-auto flex h-16 max-w-2xl items-center justify-between gap-3 px-4">
        <WorkspaceSwitcher />
        <ViewSwitcher />
      </div>
    </header>
  );
}
