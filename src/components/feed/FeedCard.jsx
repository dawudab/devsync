import { memo, useState } from 'react';
import { MessageCircle, CheckCircle2, RotateCcw } from 'lucide-react';
import { backend } from '@/lib/data';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useLanguage } from '@/context/LanguageContext';
import { useToast } from '@/context/ToastContext';
import { IMPACT_META, approvalMeta } from '@/lib/constants';
import { cn, deliveryStatus, timeAgo, formatDateTime } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { AISummary, AISourceTag } from './AISummary';
import { TechnicalDetails } from './TechnicalDetails';
import { ReactionBar } from './ReactionBar';
import { CommentThread } from './CommentThread';

export const FeedCard = memo(function FeedCard({ update, highlighted = false, style }) {
  const { workspaceId, isDeveloper, isOwner, author } = useWorkspace();
  const { t } = useLanguage();
  const toast = useToast();
  const [showComments, setShowComments] = useState(false);
  const [tweaking, setTweaking] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const impact = IMPACT_META[update.summary?.impact] || IMPACT_META.maintenance;
  const ImpactIcon = impact.icon;
  const status = deliveryStatus(update);
  const approval = approvalMeta(update.approvalStatus);

  const setApproval = async (approvalStatus, approvalNote = null) => {
    setBusy(true);
    try {
      await backend.setUpdateApproval(workspaceId, update.id, { approvalStatus, approvalNote }, author);
      setTweaking(false);
      setNote('');
      toast.success(approvalStatus === 'approved' ? 'Update approved' : 'Tweak request sent to your developer');
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <article
      id={`update-${update.id}`}
      style={style}
      className={cn('animate-card-in scroll-mt-24 rounded-3xl bg-white p-4 shadow-card ring-1 ring-ink-100 transition sm:p-5', highlighted && 'ring-2 ring-brand-400')}
    >
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset', impact.chip)}>
          <ImpactIcon className="h-3.5 w-3.5" />
          {impact.label}
        </span>
        <Badge tone={status.tone} dot>
          {status.label}
        </Badge>
        <Badge tone={approval.tone}>{approval.label}</Badge>
        <time className="ml-auto text-xs text-ink-400" title={formatDateTime(update.createdAt)}>
          {timeAgo(update.createdAt)}
        </time>
      </header>

      {isDeveloper ? <TechnicalDetails update={update} /> : <AISummary summary={update.summary} />}

      {update.approvalStatus === 'changes_requested' && update.approvalNote && (
        <div className="mt-3 rounded-2xl bg-rose-50 px-3.5 py-2.5 text-xs text-rose-800 ring-1 ring-inset ring-rose-200">
          <span className="font-semibold">Owner requested tweaks:</span> {update.approvalNote}
        </div>
      )}

      {isOwner && (
        <div className="mt-4 rounded-2xl bg-ink-50/80 p-3 ring-1 ring-inset ring-ink-100">
          {!tweaking ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium text-ink-600">
                {update.approvalStatus === 'approved'
                  ? `Signed off${update.approvedBy?.name ? ` by ${update.approvedBy.name}` : ''}`
                  : update.approvalStatus === 'changes_requested'
                    ? 'Waiting for developer tweaks'
                    : 'Ready for your sign-off'}
              </span>
              <div className="flex items-center gap-2">
                {update.approvalStatus !== 'approved' && (
                  <Button size="sm" variant="primary" icon={CheckCircle2} loading={busy} onClick={() => setApproval('approved')}>
                    {t('feed.approveUpdate')}
                  </Button>
                )}
                {update.approvalStatus !== 'changes_requested' && (
                  <Button size="sm" variant="secondary" icon={RotateCcw} disabled={busy} onClick={() => setTweaking(true)}>
                    {t('feed.requestTweaks')}
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setApproval('changes_requested', note.trim() || null);
              }}
              className="space-y-2"
            >
              <input
                autoFocus
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={300}
                placeholder="What should be tweaked? (optional)"
                className="h-10 w-full rounded-xl border-0 bg-white px-3 text-sm text-ink-900 ring-1 ring-inset ring-ink-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setTweaking(false)}>
                  Cancel
                </Button>
                <Button size="sm" variant="danger" type="submit" loading={busy}>
                  Send tweak request
                </Button>
              </div>
            </form>
          )}
        </div>
      )}

      <div className="mt-4 flex items-center gap-2 text-xs text-ink-400">
        <Avatar name={update.actor?.login} src={update.actor?.avatarUrl} size="xs" />
        <span className="truncate">
          {isDeveloper ? `@${update.actor?.login} · ${update.repo}` : `By ${update.actor?.login}`}
        </span>
        {!isDeveloper && <span className="ml-auto shrink-0"><AISourceTag source={update.summary?.source} /></span>}
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
