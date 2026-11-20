import { Check, AlertTriangle, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

export function AISummary({ summary, compact = false }) {
  if (!summary) return null;
  return (
    <div>
      <h3 className={cn('font-semibold leading-snug text-ink-900', compact ? 'text-[15px]' : 'text-[17px]')}>{summary.headline}</h3>
      <ul className="mt-3 space-y-2">
        {summary.bullets.map((b, i) => (
          <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-ink-600">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <Check className="h-3 w-3" strokeWidth={3} />
            </span>
            <span>{b}</span>
          </li>
        ))}
      </ul>
      {(summary.risk === 'high' || summary.breaking) && (
        <p className="mt-3 flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          This is a bigger change — a quick click-through on your side is a good idea.
        </p>
      )}
    </div>
  );
}

export function AISourceTag({ source }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-400">
      <Sparkles className="h-3 w-3" />
      {source === 'gemini' ? 'Explained by Gemini' : 'Auto-explained'}
    </span>
  );
}
