import { useState } from 'react';
import { Map as MapIcon, Plus, Calendar, ArrowUp, ArrowDown, Trash2, Link2, CheckCircle2 } from 'lucide-react';
import { backend } from '@/lib/data';
import { MILESTONE_STATUSES } from '@/lib/constants';
import { useAuth } from '@/context/AuthContext';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useToast } from '@/context/ToastContext';
import { useMilestones, useTickets, useFeed } from '@/hooks/useWorkspaceData';
import { PageHeader } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Sheet } from '@/components/ui/Sheet';
import { CardSkeleton, EmptyState } from '@/components/ui/Feedback';
import { cn } from '@/lib/utils';

const STATUS_TONE = Object.fromEntries(MILESTONE_STATUSES.map((s) => [s.value, s]));

export function RoadmapPage() {
  const { user } = useAuth();
  const { workspaceId, isOwner, isDeveloper } = useWorkspace();
  const toast = useToast();
  const { milestones, loading } = useMilestones();
  const { tickets } = useTickets();
  const { updates } = useFeed();

  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', targetDate: '' });
  const [saving, setSaving] = useState(false);
  const [linkingId, setLinkingId] = useState(null);

  const create = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      await backend.createMilestone(workspaceId, { ...form, order: milestones.length }, user.uid);
      toast.success('Milestone added to roadmap');
      setForm({ title: '', description: '', targetDate: '' });
      setCreating(false);
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  const move = async (idx, dir) => {
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= milestones.length) return;
    const a = milestones[idx];
    const b = milestones[swapIdx];
    try {
      await Promise.all([
        backend.updateMilestone(workspaceId, a.id, { order: b.order ?? swapIdx }),
        backend.updateMilestone(workspaceId, b.id, { order: a.order ?? idx }),
      ]);
    } catch (err) {
      toast.error(err);
    }
  };

  const setProgress = async (m, progress) => {
    const num = Math.max(0, Math.min(100, Number(progress) || 0));
    const status = num >= 100 ? 'completed' : num > 0 ? 'in_progress' : 'planned';
    try {
      await backend.updateMilestone(workspaceId, m.id, { progress: num, status });
    } catch (err) {
      toast.error(err);
    }
  };

  const toggleLinkUpdate = async (m, updateId) => {
    const current = new Set(m.linkedUpdateIds || []);
    if (current.has(updateId)) current.delete(updateId);
    else current.add(updateId);
    try {
      await backend.updateMilestone(workspaceId, m.id, { linkedUpdateIds: [...current] });
    } catch (err) {
      toast.error(err);
    }
  };

  const toggleLinkTicket = async (m, ticketId) => {
    const current = new Set(m.linkedTicketIds || []);
    if (current.has(ticketId)) current.delete(ticketId);
    else current.add(ticketId);
    try {
      await backend.updateMilestone(workspaceId, m.id, { linkedTicketIds: [...current] });
    } catch (err) {
      toast.error(err);
    }
  };

  const linkingMilestone = milestones.find((m) => m.id === linkingId) || null;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Roadmap"
        subtitle="Project phases, target dates, and delivery progress."
        action={
          isOwner && (
            <Button size="sm" icon={Plus} onClick={() => setCreating(true)}>
              New milestone
            </Button>
          )
        }
      />

      {loading && !milestones.length ? (
        <div className="space-y-3">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : milestones.length === 0 ? (
        <EmptyState
          icon={MapIcon}
          title="No milestones yet"
          action={isOwner && <Button icon={Plus} onClick={() => setCreating(true)}>Create first milestone</Button>}
        >
          {isOwner
            ? 'Break your project into clear phases so everyone can track progress at a glance.'
            : 'The business owner has not added roadmap milestones yet.'}
        </EmptyState>
      ) : (
        <div className="space-y-4">
          {milestones.map((m, idx) => {
            const st = STATUS_TONE[m.status] || MILESTONE_STATUSES[0];
            const linkedUpdates = updates.filter((u) => m.linkedUpdateIds?.includes(u.id));
            const linkedTickets = tickets.filter((t) => m.linkedTicketIds?.includes(t.id) || t.milestoneId === m.id);

            return (
              <article key={m.id} className="rounded-3xl bg-white p-5 shadow-card ring-1 ring-ink-100">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={st.tone} dot>{st.label}</Badge>
                      {m.targetDate && (
                        <span className="inline-flex items-center gap-1 text-xs text-ink-400">
                          <Calendar className="h-3.5 w-3.5" /> Target {m.targetDate}
                        </span>
                      )}
                    </div>
                    <h2 className="mt-2 text-base font-semibold text-ink-900">{m.title}</h2>
                    {m.description && <p className="mt-1 text-sm text-ink-500">{m.description}</p>}
                  </div>

                  {isOwner && (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => move(idx, -1)}
                        disabled={idx === 0}
                        aria-label="Move up"
                        className="rounded-full p-1.5 text-ink-400 hover:bg-ink-100 disabled:opacity-30"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => move(idx, 1)}
                        disabled={idx === milestones.length - 1}
                        aria-label="Move down"
                        className="rounded-full p-1.5 text-ink-400 hover:bg-ink-100 disabled:opacity-30"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => backend.deleteMilestone(workspaceId, m.id).catch(toast.error)}
                        aria-label="Delete milestone"
                        className="rounded-full p-1.5 text-ink-300 hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="text-ink-500">Completion</span>
                    <span className="tabular-nums text-ink-800">{m.progress || 0}%</span>
                  </div>
                  <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-ink-100">
                    <div
                      className={cn('h-full rounded-full transition-all', m.progress >= 100 ? 'bg-emerald-500' : 'bg-brand-600')}
                      style={{ width: `${m.progress || 0}%` }}
                    />
                  </div>

                  {isDeveloper && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="5"
                        value={m.progress || 0}
                        onChange={(e) => setProgress(m, e.target.value)}
                        className="h-2 flex-1 accent-brand-600"
                        aria-label="Milestone progress"
                      />
                      <Button size="sm" variant="secondary" icon={Link2} onClick={() => setLinkingId(m.id)}>
                        Link work
                      </Button>
                    </div>
                  )}
                </div>

                {(linkedUpdates.length > 0 || linkedTickets.length > 0) && (
                  <div className="mt-4 flex flex-wrap gap-1.5 border-t border-ink-100 pt-3">
                    {linkedUpdates.map((u) => (
                      <span key={u.id} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
                        <CheckCircle2 className="h-3 w-3" /> {u.summary?.headline || 'Update'}
                      </span>
                    ))}
                    {linkedTickets.map((t) => (
                      <span key={t.id} className="inline-flex items-center gap-1 rounded-full bg-ink-100 px-2.5 py-1 text-[11px] font-medium text-ink-700">
                        #{t.number} {t.title}
                      </span>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      <Sheet
        open={creating}
        onClose={() => setCreating(false)}
        title="New milestone"
        subtitle="Define a project phase and target date."
        footer={
          <Button type="submit" form="new-milestone" size="lg" className="w-full" loading={saving} disabled={!form.title.trim()}>
            Add milestone
          </Button>
        }
      >
        <form id="new-milestone" onSubmit={create} className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink-700">Phase title</span>
            <input
              autoFocus
              required
              maxLength={120}
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Phase 1: MVP Launch"
              className="h-12 w-full rounded-xl border-0 bg-ink-50 px-4 text-[15px] text-ink-900 ring-1 ring-inset ring-ink-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink-700">Goal / scope</span>
            <textarea
              rows={3}
              maxLength={1000}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="What does done look like for this phase?"
              className="w-full resize-none rounded-xl border-0 bg-ink-50 px-4 py-3 text-[15px] text-ink-900 ring-1 ring-inset ring-ink-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink-700">Target date (optional)</span>
            <input
              type="date"
              value={form.targetDate}
              onChange={(e) => setForm((f) => ({ ...f, targetDate: e.target.value }))}
              className="h-12 w-full rounded-xl border-0 bg-ink-50 px-4 text-[15px] text-ink-900 ring-1 ring-inset ring-ink-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </label>
        </form>
      </Sheet>

      <Sheet open={Boolean(linkingMilestone)} onClose={() => setLinkingId(null)} title="Link work to milestone" subtitle={linkingMilestone?.title}>
        {linkingMilestone && (
          <div className="space-y-5">
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">Shipped updates</h4>
              <ul className="space-y-1.5">
                {updates.slice(0, 10).map((u) => {
                  const linked = linkingMilestone.linkedUpdateIds?.includes(u.id);
                  return (
                    <li key={u.id}>
                      <button
                        onClick={() => toggleLinkUpdate(linkingMilestone, u.id)}
                        className={cn(
                          'flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm ring-1 ring-inset transition',
                          linked ? 'bg-emerald-50 text-emerald-900 ring-emerald-200' : 'bg-white text-ink-700 ring-ink-200 hover:bg-ink-50',
                        )}
                      >
                        <span className="truncate">{u.summary?.headline || u.repo}</span>
                        {linked && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />}
                      </button>
                    </li>
                  );
                })}
                {!updates.length && <li className="text-xs text-ink-400">No updates yet.</li>}
              </ul>
            </div>

            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">Requests</h4>
              <ul className="space-y-1.5">
                {tickets.slice(0, 10).map((t) => {
                  const linked = linkingMilestone.linkedTicketIds?.includes(t.id);
                  return (
                    <li key={t.id}>
                      <button
                        onClick={() => toggleLinkTicket(linkingMilestone, t.id)}
                        className={cn(
                          'flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm ring-1 ring-inset transition',
                          linked ? 'bg-brand-50 text-brand-900 ring-brand-200' : 'bg-white text-ink-700 ring-ink-200 hover:bg-ink-50',
                        )}
                      >
                        <span className="truncate">#{t.number} {t.title}</span>
                        {linked && <CheckCircle2 className="h-4 w-4 shrink-0 text-brand-600" />}
                      </button>
                    </li>
                  );
                })}
                {!tickets.length && <li className="text-xs text-ink-400">No requests yet.</li>}
              </ul>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}
