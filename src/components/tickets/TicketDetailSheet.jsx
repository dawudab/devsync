import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GitCommitHorizontal, Link2, Unlink, ExternalLink, ArrowRight, Search } from 'lucide-react';
import { backend } from '@/lib/data';
import { TICKET_STATUSES, STATUS_ICONS, statusMeta } from '@/lib/constants';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useToast } from '@/context/ToastContext';
import { useFeed } from '@/hooks/useWorkspaceData';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { PriorityBadge, StatusBadge } from './TicketBadges';
import { cn, formatDateTime, shortSha, timeAgo } from '@/lib/utils';

function activityText(a) {
  if (a.type === 'created') return 'created this request';
  if (a.type === 'status') return `moved it to ${statusMeta(a.to).label}`;
  if (a.type === 'linked') return `linked commit ${shortSha(a.sha)}`;
  if (a.type === 'unlinked') return 'removed the linked commit';
  return a.type;
}

function CommitPicker({ onPick, onCancel }) {
  const { updates } = useFeed();
  const [q, setQ] = useState('');
  const commits = useMemo(() => {
    const all = updates.flatMap((u) => (u.commits || []).map((c) => ({ ...c, updateId: u.id, createdAt: u.createdAt })));
    const needle = q.trim().toLowerCase();
    return (needle ? all.filter((c) => c.sha?.startsWith(needle) || c.message.toLowerCase().includes(needle)) : all).slice(0, 25);
  }, [updates, q]);

  return (
    <div className="space-y-2 rounded-2xl bg-ink-50 p-3 ring-1 ring-inset ring-ink-200">
      <div className="flex items-center gap-2 rounded-xl bg-white px-3 ring-1 ring-inset ring-ink-200 focus-within:ring-2 focus-within:ring-brand-500">
        <Search className="h-4 w-4 text-ink-400" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by SHA or message" className="h-10 flex-1 bg-transparent font-mono text-sm focus:outline-none" />
      </div>
      <ul className="max-h-60 space-y-1 overflow-y-auto">
        {commits.map((c) => (
          <li key={c.sha}>
            <button onClick={() => onPick(c)} className="flex w-full items-start gap-2 rounded-xl px-2 py-2 text-left hover:bg-white">
              <span className="mt-px rounded bg-white px-1.5 font-mono text-[11px] text-brand-700 ring-1 ring-ink-200">{shortSha(c.sha)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono text-xs text-ink-800">{c.message.split('\n')[0]}</span>
                <span className="text-[11px] text-ink-400">{timeAgo(c.createdAt)}</span>
              </span>
            </button>
          </li>
        ))}
        {!commits.length && <li className="py-3 text-center text-xs text-ink-400">No matching commits in the feed</li>}
      </ul>
      <Button variant="ghost" size="sm" onClick={onCancel} className="w-full">
        Cancel
      </Button>
    </div>
  );
}

export function TicketDetailSheet({ ticket, onClose }) {
  const { workspaceId, author, isDeveloper } = useWorkspace();
  const toast = useToast();
  const navigate = useNavigate();
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!ticket) return null;

  const mutate = async (patch, entry, message) => {
    setBusy(true);
    try {
      await backend.updateTicket(workspaceId, ticket.id, patch, author, entry);
      if (message) toast.success(message);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  const setStatus = (status) => status !== ticket.status && mutate({ status }, { type: 'status', from: ticket.status, to: status });

  const link = async (c) => {
    setPicking(false);
    await mutate(
      { linkedCommit: { sha: c.sha, message: c.message.split('\n')[0], url: c.url || null, updateId: c.updateId || null }, ...(ticket.status !== 'completed' && { status: 'completed' }) },
      { type: 'linked', sha: c.sha },
      ticket.status !== 'completed' ? 'Commit linked and request completed' : 'Commit linked',
    );
  };

  return (
    <Sheet open onClose={onClose} title={ticket.title} subtitle={`#${ticket.number} · requested by ${ticket.createdBy?.name} ${timeAgo(ticket.createdAt)}`}>
      <div className="space-y-6">
        <div className="flex flex-wrap gap-2">
          <StatusBadge status={ticket.status} />
          <PriorityBadge priority={ticket.priority} />
        </div>

        {ticket.description ? (
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink-700">{ticket.description}</p>
        ) : (
          <p className="text-sm italic text-ink-400">No additional details.</p>
        )}

        {isDeveloper && (
          <section className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-400">Status</h4>
            <SegmentedControl
              ariaLabel="Ticket status"
              className="w-full"
              value={ticket.status}
              onChange={setStatus}
              options={TICKET_STATUSES.map((s) => ({ value: s.value, label: s.label, icon: STATUS_ICONS[s.value] }))}
            />
          </section>
        )}

        <section className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-400">{isDeveloper ? 'Linked commit' : 'Delivered in'}</h4>
          {ticket.linkedCommit ? (
            <div className="rounded-2xl bg-emerald-50/70 p-3 ring-1 ring-inset ring-emerald-100">
              <div className="flex items-start gap-2">
                <GitCommitHorizontal className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <div className="min-w-0 flex-1">
                  {isDeveloper ? (
                    <>
                      <p className="font-mono text-xs font-semibold text-emerald-800">{shortSha(ticket.linkedCommit.sha)}</p>
                      <p className="break-words font-mono text-xs text-ink-700">{ticket.linkedCommit.message}</p>
                    </>
                  ) : (
                    <p className="text-sm text-emerald-900">Your developer marked this as done and connected it to a product update.</p>
                  )}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {ticket.linkedCommit.updateId && (
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={ArrowRight}
                    onClick={() => {
                      onClose();
                      navigate(`/#update-${ticket.linkedCommit.updateId}`);
                    }}
                  >
                    See the update
                  </Button>
                )}
                {isDeveloper && ticket.linkedCommit.url && (
                  <a href={ticket.linkedCommit.url} target="_blank" rel="noreferrer">
                    <Button size="sm" variant="ghost" icon={ExternalLink}>
                      GitHub
                    </Button>
                  </a>
                )}
                {isDeveloper && (
                  <Button size="sm" variant="ghost" icon={Unlink} disabled={busy} onClick={() => mutate({ linkedCommit: null }, { type: 'unlinked' })}>
                    Unlink
                  </Button>
                )}
              </div>
            </div>
          ) : isDeveloper ? (
            picking ? (
              <CommitPicker onPick={link} onCancel={() => setPicking(false)} />
            ) : (
              <Button variant="secondary" icon={Link2} onClick={() => setPicking(true)} className="w-full" disabled={busy}>
                Link a commit
              </Button>
            )
          ) : (
            <p className="text-sm text-ink-500">Not delivered yet — you’ll see it here once it’s done.</p>
          )}
        </section>

        <section>
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-400">Activity</h4>
          <ol className="relative space-y-4 border-l border-ink-200 pl-5">
            {[...(ticket.activity || [])].reverse().map((a, i) => (
              <li key={i} className="relative">
                <span className={cn('absolute -left-[25px] top-1 h-2.5 w-2.5 rounded-full ring-4 ring-white', i === 0 ? 'bg-brand-500' : 'bg-ink-300')} />
                <p className="text-sm text-ink-700">
                  <span className="font-semibold text-ink-900">{a.by}</span> {activityText(a)}
                </p>
                <p className="text-xs text-ink-400">{formatDateTime(a.at)}</p>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </Sheet>
  );
}
