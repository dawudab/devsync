import { backend } from '@/lib/data';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useLanguage } from '@/context/LanguageContext';
import { roleMeta } from '@/lib/constants';
import { Badge } from '@/components/ui/Badge';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';

export function Header() {
  const { role } = useWorkspace();
  const { t } = useLanguage();
  const meta = roleMeta(role);

  return (
    <header className="sticky top-0 z-30 border-b border-ink-200/70 bg-white/85 pt-[env(safe-area-inset-top)] backdrop-blur-lg">
      {backend.mode === 'demo' && (
        <div className="bg-ink-900 px-4 py-1 text-center text-[11px] font-medium text-white/80">
          {t('demo.banner')}
        </div>
      )}
      <div className="mx-auto flex h-16 max-w-2xl items-center justify-between gap-3 px-4">
        <WorkspaceSwitcher />
        {role && (
          <Badge tone={meta.tone} className="shrink-0">
            {t(`role.${role}`)}
          </Badge>
        )}
      </div>
    </header>
  );
}
