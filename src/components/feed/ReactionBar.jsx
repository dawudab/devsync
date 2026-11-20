import { useState } from 'react';
import { backend } from '@/lib/data';
import { REACTIONS } from '@/lib/constants';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useToast } from '@/context/ToastContext';
import { cn } from '@/lib/utils';

export function ReactionBar({ update }) {
  const { workspaceId, author, workspace } = useWorkspace();
  const toast = useToast();
  const [popping, setPopping] = useState(null);

  const toggle = async (emoji) => {
    const active = (update.reactions?.[emoji] || []).includes(author.uid);
    if (!active) setPopping(emoji);
    try {
      await backend.toggleReaction(workspaceId, update.id, emoji, author.uid, active);
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <div className="flex flex-wrap gap-1.5">
      {REACTIONS.map((emoji) => {
        const uids = update.reactions?.[emoji] || [];
        const active = uids.includes(author.uid);
        const names = uids.map((uid) => (uid === author.uid ? 'You' : workspace?.profiles?.[uid]?.name || 'Someone')).join(', ');
        return (
          <button
            key={emoji}
            onClick={() => toggle(emoji)}
            title={names || `React with ${emoji}`}
            aria-pressed={active}
            aria-label={`${emoji} ${uids.length}`}
            className={cn(
              'flex h-9 min-w-[2.75rem] items-center justify-center gap-1 rounded-full px-2.5 text-sm ring-1 ring-inset transition active:scale-95',
              active ? 'bg-brand-50 text-brand-700 ring-brand-300' : 'bg-white text-ink-600 ring-ink-200 hover:bg-ink-50',
            )}
          >
            <span className={cn('text-base leading-none', popping === emoji && 'animate-pop')} onAnimationEnd={() => setPopping(null)}>
              {emoji}
            </span>
            {uids.length > 0 && <span className="text-xs font-semibold tabular-nums">{uids.length}</span>}
          </button>
        );
      })}
    </div>
  );
}
