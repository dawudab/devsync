import { useMemo } from 'react';
import { GitCommitHorizontal, GitMerge, Plus, Minus } from 'lucide-react';
import { useNow } from '@/hooks/useNow';

const WEEK = 7 * 24 * 3600 * 1000;

export function DevStats({ updates }) {
  const now = useNow();
  const stats = useMemo(() => {
    const since = now - WEEK;
    const recent = updates.filter((u) => u.createdAt >= since);
    return {
      commits: recent.reduce((n, u) => n + (u.kind === 'push' ? u.commits?.length || 0 : 0), 0),
      merged: recent.filter((u) => u.kind === 'pull_request_merged').length,
      additions: recent.reduce((n, u) => n + (u.stats?.additions || 0), 0),
      deletions: recent.reduce((n, u) => n + (u.stats?.deletions || 0), 0),
    };
  }, [updates, now]);

  const items = [
    { label: 'Commits', value: stats.commits, icon: GitCommitHorizontal, color: 'text-brand-600' },
    { label: 'PRs merged', value: stats.merged, icon: GitMerge, color: 'text-violet-600' },
    { label: 'Added', value: stats.additions, icon: Plus, color: 'text-emerald-600' },
    { label: 'Removed', value: stats.deletions, icon: Minus, color: 'text-rose-600' },
  ];

  return (
    <div className="grid grid-cols-4 gap-2">
      {items.map(({ label, value, icon: Icon, color }) => (
        <div key={label} className="rounded-2xl bg-white p-3 shadow-card ring-1 ring-ink-100">
          <Icon className={`h-4 w-4 ${color}`} />
          <p className="mt-1.5 font-mono text-lg font-semibold tabular-nums text-ink-900">{value.toLocaleString()}</p>
          <p className="text-[11px] text-ink-500">{label} · 7d</p>
        </div>
      ))}
    </div>
  );
}
