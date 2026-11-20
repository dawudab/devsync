import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Spinner({ className }) {
  return <Loader2 className={cn('h-5 w-5 animate-spin text-brand-600', className)} />;
}

export function FullScreenLoader({ label = 'Loading…' }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 text-ink-500">
      <Spinner className="h-7 w-7" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children, action }) {
  return (
    <div className="flex flex-col items-center rounded-3xl border border-dashed border-ink-200 bg-white/60 px-6 py-10 text-center">
      {Icon && (
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
          <Icon className="h-6 w-6" />
        </div>
      )}
      <h3 className="font-semibold text-ink-900">{title}</h3>
      {children && <p className="mt-1 max-w-xs text-sm text-ink-500">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="animate-pulse rounded-3xl bg-white p-5 shadow-card">
      <div className="mb-4 flex gap-2">
        <div className="h-5 w-24 rounded-full bg-ink-100" />
        <div className="h-5 w-16 rounded-full bg-ink-100" />
      </div>
      <div className="mb-2 h-5 w-11/12 rounded bg-ink-100" />
      <div className="mb-4 h-5 w-2/3 rounded bg-ink-100" />
      <div className="space-y-2">
        <div className="h-3.5 w-full rounded bg-ink-100" />
        <div className="h-3.5 w-5/6 rounded bg-ink-100" />
        <div className="h-3.5 w-4/6 rounded bg-ink-100" />
      </div>
    </div>
  );
}
