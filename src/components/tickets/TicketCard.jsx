import { GitCommitHorizontal, ChevronRight } from 'lucide-react';
import { PriorityBadge, StatusBadge } from './TicketBadges';
import { cn, shortSha, timeAgo } from '@/lib/utils';

export function TicketCard({ ticket, onOpen, technical = false }) {
  return (
    <button
      onClick={() => onOpen(ticket)}
      className={cn(
        'group flex w-full animate-card-in items-start gap-3 rounded-2xl bg-white p-4 text-left shadow-card ring-1 ring-ink-100 transition hover:ring-brand-200 active:scale-[0.99]',
        ticket.status === 'completed' && 'opacity-80',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-xs text-ink-400">#{ticket.number}</span>
          <StatusBadge status={ticket.status} />
          <PriorityBadge priority={ticket.priority} />
        </div>
        <h3 className={cn('font-semibold leading-snug text-ink-900', ticket.status === 'completed' && 'line-through decoration-ink-300')}>{ticket.title}</h3>
        {ticket.description && <p className="mt-1 line-clamp-2 text-sm text-ink-500">{ticket.description}</p>}
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-400">
          <span>
            {ticket.createdBy?.name} · {timeAgo(ticket.createdAt)}
          </span>
          {ticket.linkedCommit && (
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 font-medium text-emerald-700">
              <GitCommitHorizontal className="h-3 w-3" />
              {technical ? <span className="font-mono">{shortSha(ticket.linkedCommit.sha)}</span> : 'Linked to an update'}
            </span>
          )}
        </div>
      </div>
      <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-ink-300 transition group-hover:translate-x-0.5 group-hover:text-ink-500" />
    </button>
  );
}
