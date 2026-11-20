import { useState } from 'react';
import { DollarSign, Plus, Clock, Trash2 } from 'lucide-react';
import { backend } from '@/lib/data';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useToast } from '@/context/ToastContext';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { cn, timeAgo } from '@/lib/utils';

export function BudgetTrackerCard({ logs = [] }) {
  const { workspace, workspaceId, isOwner, isDeveloper, author } = useWorkspace();
  const toast = useToast();
  const [loggingOpen, setLoggingOpen] = useState(false);
  const [hours, setHours] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  const budget = workspace?.budget || { hourlyRate: 120, monthlyBudget: 4800, currency: 'USD' };
  const totalHours = logs.reduce((sum, l) => sum + (Number(l.hours) || 0), 0);
  const spent = totalHours * (Number(budget.hourlyRate) || 0);
  const cap = Number(budget.monthlyBudget) || 0;
  const pct = cap > 0 ? Math.min(100, Math.round((spent / cap) * 100)) : 0;
  const maxHours = budget.hourlyRate > 0 ? Math.round((cap / budget.hourlyRate) * 10) / 10 : 0;

  const fmtMoney = (n) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: budget.currency || 'USD', maximumFractionDigits: 0 }).format(n);

  const submitHours = async (e) => {
    e.preventDefault();
    const h = Number(hours);
    if (!h || h <= 0 || !description.trim()) return;
    setBusy(true);
    try {
      await backend.logBudgetHours(workspaceId, { hours: h, description }, author);
      toast.success(`Logged ${h}h to workspace budget`);
      setHours('');
      setDescription('');
      setLoggingOpen(false);
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-3xl bg-white p-4 shadow-card ring-1 ring-ink-100 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <DollarSign className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-ink-900">Budget & Hours</h3>
            <p className="text-xs text-ink-400">
              {totalHours.toFixed(1)}h{maxHours > 0 ? ` / ${maxHours}h` : ''} logged · {fmtMoney(budget.hourlyRate)}/hr
            </p>
          </div>
        </div>
        {isDeveloper && (
          <Button size="sm" variant="secondary" icon={Plus} onClick={() => setLoggingOpen(true)}>
            Log hours
          </Button>
        )}
      </div>

      <div className="mt-3">
        <div className="flex items-baseline justify-between text-xs">
          <span className="font-semibold text-ink-800">{fmtMoney(spent)} used</span>
          <span className="text-ink-400">{cap > 0 ? `${pct}% of ${fmtMoney(cap)}` : 'No cap set'}</span>
        </div>
        <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-ink-100">
          <div
            className={cn(
              'h-full rounded-full transition-all',
              pct >= 90 ? 'bg-rose-500' : pct >= 75 ? 'bg-amber-500' : 'bg-emerald-500',
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {logs.length > 0 && (
        <ul className="mt-3.5 space-y-2 border-t border-ink-100 pt-3">
          {logs.slice(0, 3).map((l) => (
            <li key={l.id} className="flex items-start justify-between gap-2 text-xs">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-ink-800">{l.description}</p>
                <p className="text-ink-400">
                  {l.loggedBy?.name} · {timeAgo(l.loggedAt)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-full bg-ink-100 px-2 py-0.5 font-semibold text-ink-700">
                  <Clock className="h-3 w-3" /> {l.hours}h
                </span>
                {isOwner && (
                  <button
                    onClick={() => backend.deleteBudgetLog(workspaceId, l.id).catch(toast.error)}
                    aria-label="Remove entry"
                    className="rounded-full p-1 text-ink-300 hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Sheet
        open={loggingOpen}
        onClose={() => setLoggingOpen(false)}
        title="Log work hours"
        subtitle="Recorded against the workspace retainer/budget."
        footer={
          <Button type="submit" form="log-hours-form" size="lg" className="w-full" loading={busy} disabled={!hours || !description.trim()}>
            Save hours
          </Button>
        }
      >
        <form id="log-hours-form" onSubmit={submitHours} className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink-700">Hours worked</span>
            <input
              type="number"
              step="0.25"
              min="0.25"
              max="100"
              required
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              placeholder="e.g. 2.5"
              className="h-12 w-full rounded-xl border-0 bg-ink-50 px-4 text-[15px] text-ink-900 ring-1 ring-inset ring-ink-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink-700">What did you work on?</span>
            <input
              required
              maxLength={300}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Implemented Apple Pay checkout flow"
              className="h-12 w-full rounded-xl border-0 bg-ink-50 px-4 text-[15px] text-ink-900 ring-1 ring-inset ring-ink-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </label>
        </form>
      </Sheet>
    </section>
  );
}
