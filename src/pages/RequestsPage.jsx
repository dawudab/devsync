import { useMemo, useState } from 'react';
import { Plus, ClipboardList } from 'lucide-react';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useLanguage } from '@/context/LanguageContext';
import { useTickets } from '@/hooks/useWorkspaceData';
import { TICKET_STATUSES, STATUS_ICONS } from '@/lib/constants';
import { PageHeader } from '@/components/layout/AppShell';
import { TicketCard } from '@/components/tickets/TicketCard';
import { NewTicketSheet } from '@/components/tickets/NewTicketSheet';
import { TicketDetailSheet } from '@/components/tickets/TicketDetailSheet';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Button } from '@/components/ui/Button';
import { CardSkeleton, EmptyState } from '@/components/ui/Feedback';

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

export function RequestsPage() {
  const { isDeveloper, isTeamMember } = useWorkspace();
  const { t } = useLanguage();
  const { tickets, loading } = useTickets();
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [tab, setTab] = useState('open');

  const openTicket = tickets.find((t) => t.id === openId) || null;
  const counts = useMemo(
    () => ({ open: tickets.filter((t) => t.status !== 'completed').length, done: tickets.filter((t) => t.status === 'completed').length }),
    [tickets],
  );

  const ownerList = useMemo(() => {
    if (tab === 'open') return tickets.filter((t) => t.status !== 'completed');
    if (tab === 'done') return tickets.filter((t) => t.status === 'completed');
    return tickets;
  }, [tickets, tab]);

  const devGroups = useMemo(
    () =>
      TICKET_STATUSES.map((s) => ({
        ...s,
        items: tickets.filter((t) => t.status === s.value).sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || b.createdAt - a.createdAt),
      })),
    [tickets],
  );

  const open = (t) => setOpenId(t.id);

  return (
    <div className="space-y-5">
      <PageHeader
        title={isDeveloper ? t('requests.board') : t('requests.title')}
        subtitle={
          isDeveloper
            ? 'Change requests and team suggestions, sorted by priority.'
            : isTeamMember
              ? 'Share suggestions and track approved work.'
              : 'Submit official change requests without touching GitHub.'
        }
        action={
          <Button size="sm" icon={Plus} onClick={() => setCreating(true)} className="hidden sm:inline-flex">
            {isTeamMember ? t('requests.newSuggestion') : t('requests.newRequest')}
          </Button>
        }
      />

      {loading && !tickets.length ? (
        <div className="space-y-3">
          <CardSkeleton />
        </div>
      ) : tickets.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No requests yet" action={<Button icon={Plus} onClick={() => setCreating(true)}>{isTeamMember ? 'Share first suggestion' : 'Create the first request'}</Button>}>
          Need a new feature, a fix, or a text change? Send it here and track progress in one place.
        </EmptyState>
      ) : isDeveloper ? (
        <div className="space-y-6">
          {devGroups.map((g) => {
            const Icon = STATUS_ICONS[g.value];
            return (
              <section key={g.value}>
                <h2 className="mb-2.5 flex items-center gap-2 text-sm font-semibold text-ink-700">
                  <Icon className="h-4 w-4 text-ink-400" />
                  {g.label}
                  <span className="rounded-full bg-ink-200/70 px-2 text-xs text-ink-600">{g.items.length}</span>
                </h2>
                <div className="space-y-2.5">
                  {g.items.length ? g.items.map((t) => <TicketCard key={t.id} ticket={t} onOpen={open} technical />) : <p className="rounded-2xl border border-dashed border-ink-200 py-4 text-center text-xs text-ink-400">Empty</p>}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <>
          <SegmentedControl
            ariaLabel="Filter requests"
            className="w-full"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'open', label: 'Open', count: counts.open },
              { value: 'done', label: 'Done', count: counts.done },
              { value: 'all', label: 'All' },
            ]}
          />
          <div className="space-y-2.5">
            {ownerList.length ? ownerList.map((t) => <TicketCard key={t.id} ticket={t} onOpen={open} />) : <p className="py-8 text-center text-sm text-ink-400">Nothing here.</p>}
          </div>
        </>
      )}

      <button
        onClick={() => setCreating(true)}
        className="fixed bottom-[calc(env(safe-area-inset-bottom)+5.25rem)] right-4 z-20 flex h-14 items-center gap-2 rounded-full bg-brand-600 pl-4 pr-5 font-semibold text-white shadow-lg shadow-brand-600/30 transition hover:bg-brand-700 active:scale-95 sm:hidden"
        aria-label="New request"
      >
        <Plus className="h-5 w-5" /> New
      </button>

      <NewTicketSheet open={creating} onClose={() => setCreating(false)} />
      <TicketDetailSheet key={openId} ticket={openTicket} onClose={() => setOpenId(null)} />
    </div>
  );
}
