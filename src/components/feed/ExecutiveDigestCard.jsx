import { Sparkles, CheckCircle2, AlertCircle, Clock, Milestone } from 'lucide-react';
import { useNow } from '@/hooks/useNow';
import { Badge } from '@/components/ui/Badge';
import { deliveryStatus } from '@/lib/utils';

const WEEK = 7 * 24 * 3600 * 1000;

const HEALTH_META = {
  on_track: { label: 'On track', tone: 'emerald' },
  needs_attention: { label: 'Needs attention', tone: 'amber' },
  at_risk: { label: 'At risk', tone: 'rose' },
};

export function ExecutiveDigestCard({ updates, milestones, digests }) {
  const since = useNow() - WEEK;
  const recent = updates.filter((u) => u.createdAt >= since);
  const shippedCount = recent.filter((u) => deliveryStatus(u).label === 'Shipped').length;
  const pendingApprovals = updates.filter((u) => !u.approvalStatus || u.approvalStatus === 'pending').length;
  const activeMilestones = milestones.filter((m) => m.status === 'in_progress' || m.progress > 0).length;

  const latestDigest = digests?.[0];
  const healthKey = latestDigest?.health || (pendingApprovals > 3 ? 'needs_attention' : 'on_track');
  const health = HEALTH_META[healthKey] || HEALTH_META.on_track;

  const headline =
    latestDigest?.headline ||
    (shippedCount > 0
      ? `${shippedCount} ${shippedCount === 1 ? 'update' : 'updates'} shipped this week`
      : 'Quiet week so far — your team is building');

  const summary =
    latestDigest?.summary ||
    `Your team delivered ${shippedCount} production update${shippedCount === 1 ? '' : 's'} in the past 7 days across ${activeMilestones} active milestone${activeMilestones === 1 ? '' : 's'}. ${
      pendingApprovals > 0
        ? `${pendingApprovals} update${pendingApprovals === 1 ? ' is' : 's are'} waiting for your sign-off.`
        : 'All recent updates have been reviewed.'
    }`;

  return (
    <section className="rounded-3xl bg-gradient-to-br from-brand-600 via-brand-700 to-ink-900 p-5 text-white shadow-card">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-white/80">
          <Sparkles className="h-3.5 w-3.5" /> Weekly Executive Digest
        </span>
        <Badge tone={health.tone}>{health.label}</Badge>
      </div>

      <h2 className="mt-2.5 text-lg font-bold leading-snug">{headline}</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-white/80">{summary}</p>

      <div className="mt-4 grid grid-cols-3 gap-2 rounded-2xl bg-white/10 p-3 backdrop-blur-sm">
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 text-xs text-white/70">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" /> Shipped
          </div>
          <p className="mt-0.5 text-lg font-bold tabular-nums">{shippedCount}</p>
        </div>
        <div className="border-x border-white/10 text-center">
          <div className="flex items-center justify-center gap-1 text-xs text-white/70">
            <Milestone className="h-3.5 w-3.5 text-sky-300" /> Milestones
          </div>
          <p className="mt-0.5 text-lg font-bold tabular-nums">{activeMilestones}</p>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 text-xs text-white/70">
            {pendingApprovals > 0 ? (
              <AlertCircle className="h-3.5 w-3.5 text-amber-300" />
            ) : (
              <Clock className="h-3.5 w-3.5 text-white/70" />
            )}
            Sign-offs
          </div>
          <p className="mt-0.5 text-lg font-bold tabular-nums">{pendingApprovals}</p>
        </div>
      </div>
    </section>
  );
}
