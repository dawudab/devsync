import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Inbox, Rocket, Hammer, ClipboardList } from 'lucide-react';
import { Github } from '@/components/ui/GithubIcon';
import { useNow } from '@/hooks/useNow';
import { useAuth } from '@/context/AuthContext';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useLanguage } from '@/context/LanguageContext';
import { useFeed, useTickets, useMilestones, useWeeklyDigests } from '@/hooks/useWorkspaceData';
import { FeedCard } from '@/components/feed/FeedCard';
import { DevStats } from '@/components/feed/DevStats';
import { ExecutiveDigestCard } from '@/components/feed/ExecutiveDigestCard';
import { LiveLinksBar } from '@/components/feed/LiveLinksBar';
import { DeletionRequestBanner } from '@/components/settings/DeleteProjectSheet';
import { SimulateEventButton } from '@/components/dev/SimulateEventButton';
import { CardSkeleton, EmptyState } from '@/components/ui/Feedback';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/layout/AppShell';
import { cn, deliveryStatus, greeting } from '@/lib/utils';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'feature', label: 'New features' },
  { value: 'fix', label: 'Fixes' },
  { value: 'improvement', label: 'Improvements' },
  { value: 'maintenance', label: 'Behind the scenes' },
];

const WEEK = 7 * 24 * 3600 * 1000;

function OwnerOverview({ updates, tickets }) {
  const { t } = useLanguage();
  const since = useNow() - WEEK;
  const recent = updates.filter((u) => u.createdAt >= since);
  const shipped = recent.filter((u) => deliveryStatus(u).label === 'Shipped').length;
  const inProgress = recent.length - shipped;
  const openRequests = tickets.filter((t) => t.status !== 'completed').length;
  const items = [
    { label: t('feed.shippedWeek'), value: shipped, icon: Rocket, color: 'bg-emerald-50 text-emerald-600' },
    { label: t('feed.inWorks'), value: inProgress, icon: Hammer, color: 'bg-sky-50 text-sky-600' },
    { label: t('feed.openRequests'), value: openRequests, icon: ClipboardList, color: 'bg-amber-50 text-amber-600', to: '/requests' },
  ];
  return (
    <div className="grid grid-cols-3 gap-2.5">
      {items.map(({ label, value, icon: Icon, color, to }) => {
        const body = (
          <>
            <span className={cn('flex h-8 w-8 items-center justify-center rounded-xl', color)}>
              <Icon className="h-4 w-4" />
            </span>
            <p className="mt-2 text-2xl font-bold tabular-nums text-ink-900">{value}</p>
            <p className="text-xs leading-tight text-ink-500">{label}</p>
          </>
        );
        const cls = 'rounded-2xl bg-white p-3.5 shadow-card ring-1 ring-ink-100';
        return to ? (
          <Link key={label} to={to} className={cn(cls, 'transition hover:ring-brand-200')}>
            {body}
          </Link>
        ) : (
          <div key={label} className={cls}>
            {body}
          </div>
        );
      })}
    </div>
  );
}

export function FeedPage() {
  const { user } = useAuth();
  const { workspace, isDeveloper } = useWorkspace();
  const { t } = useLanguage();
  const { updates, loading } = useFeed();
  const { tickets } = useTickets();
  const { milestones } = useMilestones();
  const { digests } = useWeeklyDigests();
  const [filter, setFilter] = useState('all');
  const { hash } = useLocation();
  const highlightId = hash.startsWith('#update-') ? hash.slice(8) : null;

  useEffect(() => {
    if (!highlightId || loading) return;
    document.getElementById(`update-${highlightId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [highlightId, loading]);

  const visible = useMemo(() => (filter === 'all' ? updates : updates.filter((u) => u.summary?.impact === filter)), [updates, filter]);
  const repo = workspace?.github?.selectedRepo;

  return (
    <div className="space-y-5">
      {isDeveloper ? (
        <PageHeader
          title={t('feed.devTitle')}
          subtitle={repo ? <span className="font-mono text-xs">{repo.fullName}</span> : 'No repository connected'}
          action={repo && <SimulateEventButton />}
        />
      ) : (
        <PageHeader title={greeting(user?.displayName)} subtitle={workspace?.businessProfile?.tagline || t('feed.ownerSub')} />
      )}

      <DeletionRequestBanner />

      {!isDeveloper && (
        <>
          <ExecutiveDigestCard updates={updates} milestones={milestones} digests={digests} />
          <LiveLinksBar />
        </>
      )}

      {!repo && isDeveloper && (
        <EmptyState
          icon={Github}
          title="Connect your GitHub repository"
          action={
            <Link to="/settings">
              <Button icon={Github}>Connect GitHub</Button>
            </Link>
          }
        >
          Install the DevSync GitHub App so code pushes and PRs appear in the workspace feed automatically.
        </EmptyState>
      )}

      {!repo && !isDeveloper && (
        <EmptyState icon={Inbox} title="Waiting for developer connection">
          Once your developer connects the project repository, plain-English updates will appear here automatically.
        </EmptyState>
      )}

      {repo && (isDeveloper ? <DevStats updates={updates} /> : <OwnerOverview updates={updates} tickets={tickets} />)}

      {repo && !isDeveloper && updates.length > 0 && (
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                'h-9 shrink-0 rounded-full px-4 text-sm font-medium ring-1 ring-inset transition',
                filter === f.value ? 'bg-ink-900 text-white ring-ink-900' : 'bg-white text-ink-600 ring-ink-200 hover:bg-ink-50',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      <section className="space-y-4" aria-live="polite">
        {loading && !updates.length ? (
          <>
            <CardSkeleton />
            <CardSkeleton />
          </>
        ) : repo && visible.length === 0 ? (
          <EmptyState icon={Inbox} title={updates.length ? 'Nothing in this category yet' : 'Waiting for the first update'} action={!updates.length && isDeveloper && <SimulateEventButton />}>
            {updates.length ? 'Try another filter.' : 'As soon as code is pushed, a plain-English summary will appear here.'}
          </EmptyState>
        ) : (
          visible.map((u, i) => <FeedCard key={u.id} update={u} highlighted={u.id === highlightId} style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }} />)
        )}
      </section>
    </div>
  );
}
