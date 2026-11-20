import { useState } from 'react';
import { Check, ChevronDown, Plus, Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '@/context/WorkspaceContext';
import { Sheet } from '@/components/ui/Sheet';
import { cn } from '@/lib/utils';

export function WorkspaceSwitcher() {
  const { workspaces, workspace, workspaceId, switchWorkspace } = useWorkspace();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <>
      <button onClick={() => setOpen(true)} className="group flex min-w-0 items-center gap-2 rounded-xl py-1 pr-1 text-left">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-sm font-bold text-white shadow-sm">
          {(workspace?.name || 'D').charAt(0)}
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-ink-400">
            <Lock className="h-3 w-3" /> Private workspace
          </span>
          <span className="flex items-center gap-1 truncate text-[15px] font-semibold leading-tight text-ink-900">
            <span className="truncate">{workspace?.name || 'DevSync'}</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-ink-400 transition group-hover:text-ink-600" />
          </span>
        </span>
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Your workspaces" subtitle="Each workspace is fully isolated — data never crosses between them.">
        <ul className="space-y-2">
          {(workspaces || []).map((w) => (
            <li key={w.id}>
              <button
                onClick={() => {
                  switchWorkspace(w.id);
                  setOpen(false);
                  navigate('/');
                }}
                className={cn(
                  'flex w-full items-center gap-3 rounded-2xl p-3 text-left ring-1 ring-inset transition',
                  w.id === workspaceId ? 'bg-brand-50 ring-brand-200' : 'ring-ink-200 hover:bg-ink-50',
                )}
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-sm font-bold text-brand-700 ring-1 ring-ink-200">{w.name.charAt(0)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-ink-900">{w.name}</span>
                  <span className="text-xs capitalize text-ink-500">{w.role}</span>
                </span>
                {w.id === workspaceId && <Check className="h-5 w-5 text-brand-600" />}
              </button>
            </li>
          ))}
          <li>
            <button
              onClick={() => {
                setOpen(false);
                navigate('/onboarding');
              }}
              className="flex w-full items-center gap-3 rounded-2xl p-3 text-left text-brand-700 border border-dashed border-ink-300 hover:bg-ink-50"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50">
                <Plus className="h-5 w-5" />
              </span>
              <span className="font-medium">Create or join a workspace</span>
            </button>
          </li>
        </ul>
      </Sheet>
    </>
  );
}
