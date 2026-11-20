import { useState } from 'react';
import { GitBranch, GitCommitHorizontal, GitMerge, GitPullRequest, ExternalLink, FileCode2, RefreshCw, ChevronDown } from 'lucide-react';
import { useAITranslator } from '@/hooks/useAITranslator';
import { useToast } from '@/context/ToastContext';
import { AISummary } from './AISummary';
import { Button } from '@/components/ui/Button';
import { cn, shortSha } from '@/lib/utils';

const KIND_META = {
  push: { label: 'push', icon: GitCommitHorizontal },
  pull_request_opened: { label: 'pull_request.opened', icon: GitPullRequest },
  pull_request_merged: { label: 'pull_request.merged', icon: GitMerge },
};

export function TechnicalDetails({ update }) {
  const [showSummary, setShowSummary] = useState(false);
  const { regenerate, pending } = useAITranslator();
  const toast = useToast();
  const kind = KIND_META[update.kind] || KIND_META.push;
  const KindIcon = kind.icon;
  const stats = update.stats || {};

  const onRegenerate = async () => {
    try {
      await regenerate(update.id);
      toast.success('Summary regenerated');
      setShowSummary(true);
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
        <span className="inline-flex items-center gap-1 rounded-md bg-ink-900 px-1.5 py-0.5 text-white">
          <KindIcon className="h-3 w-3" /> {kind.label}
        </span>
        <span className="inline-flex items-center gap-1 rounded-md bg-ink-100 px-1.5 py-0.5 text-ink-700">
          <GitBranch className="h-3 w-3" /> {update.pr ? `${update.pr.headBranch} → ${update.pr.baseBranch}` : update.branch}
        </span>
        {stats.additions != null && <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-emerald-700">+{stats.additions}</span>}
        {stats.deletions != null && <span className="rounded-md bg-rose-50 px-1.5 py-0.5 text-rose-700">−{stats.deletions}</span>}
        {stats.filesChanged != null && (
          <span className="inline-flex items-center gap-1 rounded-md bg-ink-100 px-1.5 py-0.5 text-ink-600">
            <FileCode2 className="h-3 w-3" /> {stats.filesChanged} files
          </span>
        )}
      </div>

      {update.pr && (
        <a href={update.pr.url} target="_blank" rel="noreferrer" className="flex items-start gap-2 text-[15px] font-semibold text-ink-900 hover:text-brand-700">
          <span className="text-ink-400">#{update.pr.number}</span>
          <span className="flex-1">{update.pr.title}</span>
          <ExternalLink className="mt-1 h-3.5 w-3.5 shrink-0 text-ink-400" />
        </a>
      )}

      <ul className="divide-y divide-ink-100 overflow-hidden rounded-2xl bg-ink-50/70 ring-1 ring-inset ring-ink-100">
        {update.commits?.map((c) => (
          <li key={c.sha} className="flex items-start gap-2.5 px-3 py-2.5">
            <a href={c.url} target="_blank" rel="noreferrer" className="mt-px shrink-0 rounded-md bg-white px-1.5 py-0.5 font-mono text-[11px] font-medium text-brand-700 ring-1 ring-ink-200 hover:ring-brand-300">
              {shortSha(c.sha)}
            </a>
            <div className="min-w-0 flex-1">
              <p className="break-words font-mono text-[12.5px] leading-relaxed text-ink-800">{String(c.message).split('\n')[0]}</p>
              <p className="mt-0.5 text-[11px] text-ink-400">@{c.author}</p>
            </div>
          </li>
        ))}
      </ul>

      {stats.files?.length > 0 && (
        <details className="group text-xs">
          <summary className="flex cursor-pointer list-none items-center gap-1 font-medium text-ink-500 hover:text-ink-700">
            <ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" /> Changed files
          </summary>
          <ul className="mt-2 space-y-1 font-mono text-[11.5px] text-ink-600">
            {stats.files.slice(0, 20).map((f) => (
              <li key={f} className="truncate">{f}</li>
            ))}
          </ul>
        </details>
      )}

      <div className="rounded-2xl bg-gradient-to-br from-brand-50 to-violet-50 p-3 ring-1 ring-inset ring-brand-100">
        <div className="flex items-center justify-between gap-2">
          <button onClick={() => setShowSummary((s) => !s)} className="flex items-center gap-1.5 text-xs font-semibold text-brand-700">
            <ChevronDown className={cn('h-4 w-4 transition', showSummary && 'rotate-180')} />
            What the owner sees
          </button>
          <Button variant="ghost" size="sm" icon={RefreshCw} loading={pending} onClick={onRegenerate} className="h-8 text-xs">
            Regenerate
          </Button>
        </div>
        {showSummary && (
          <div className="mt-2 rounded-xl bg-white p-3">
            <AISummary summary={update.summary} compact />
          </div>
        )}
      </div>

      {update.deliveryId && <p className="font-mono text-[10.5px] text-ink-400">delivery {update.deliveryId}</p>}
    </div>
  );
}
