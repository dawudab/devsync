import { memo, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { useWorkspace } from '@/context/WorkspaceContext';
import { IMPACT_META } from '@/lib/constants';
import { cn, deliveryStatus, timeAgo, formatDateTime } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { AISummary, AISourceTag } from './AISummary';
import { TechnicalDetails } from './TechnicalDetails';
import { ReactionBar } from './ReactionBar';
import { CommentThread } from './CommentThread';

export const FeedCard = memo(function FeedCard({ update, highlighted = false, style }) {
  const { isDevView } = useWorkspace();
  const [showComments, setShowComments] = useState(false);
  const impact = IMPACT_META[update.summary?.impact] || IMPACT_META.maintenance;
  const ImpactIcon = impact.icon;
  const status = deliveryStatus(update);

  return (
    <article
      id={`update-${update.id}`}
      style={style}
      className={cn('animate-card-in scroll-mt-24 rounded-3xl bg-white p-4 shadow-card ring-1 ring-ink-100 transition sm:p-5', highlighted && 'ring-2 ring-brand-400')}
    >
      <header className="mb-3 flex items-center gap-2">
        <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset', impact.chip)}>
          <ImpactIcon className="h-3.5 w-3.5" />
          {impact.label}
        </span>
        <Badge tone={status.tone} dot>
          {status.label}
        </Badge>
        <time className="ml-auto text-xs text-ink-400" title={formatDateTime(update.createdAt)}>
          {timeAgo(update.createdAt)}
        </time>
      </header>

      {isDevView ? <TechnicalDetails update={update} /> : <AISummary summary={update.summary} />}

      <div className="mt-4 flex items-center gap-2 text-xs text-ink-400">
        <Avatar name={update.actor?.login} src={update.actor?.avatarUrl} size="xs" />
        <span className="truncate">
          {isDevView ? `@${update.actor?.login}` : `By ${update.actor?.login}`} · {update.repo}
        </span>
        {!isDevView && <span className="ml-auto shrink-0"><AISourceTag source={update.summary?.source} /></span>}
      </div>

      <div className="mt-4 flex items-center justify-between gap-2 border-t border-ink-100 pt-3">
        <ReactionBar update={update} />
        <button
          onClick={() => setShowComments((s) => !s)}
          aria-expanded={showComments}
          className={cn(
            'flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition',
            showComments ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-ink-100',
          )}
        >
          <MessageCircle className="h-4 w-4" />
          {update.commentCount || 0}
        </button>
      </div>

      {showComments && (
        <div className="mt-3">
          <CommentThread update={update} />
        </div>
      )}
    </article>
  );
});
