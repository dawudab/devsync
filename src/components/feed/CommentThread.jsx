import { useMemo, useRef, useState } from 'react';
import { CornerDownRight, SendHorizontal, X } from 'lucide-react';
import { backend } from '@/lib/data';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useToast } from '@/context/ToastContext';
import { useComments } from '@/hooks/useWorkspaceData';
import { Avatar } from '@/components/ui/Avatar';
import { Spinner } from '@/components/ui/Feedback';
import { cn, timeAgo } from '@/lib/utils';

function RoleTag({ role }) {
  return (
    <span className={cn('rounded-md px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide', role === 'developer' ? 'bg-violet-50 text-violet-700' : 'bg-brand-50 text-brand-700')}>
      {role === 'developer' ? 'Dev' : 'Owner'}
    </span>
  );
}

function Comment({ comment, isReply, onReply, isMine }) {
  return (
    <div className={cn('flex gap-2.5', isReply && 'pl-9')}>
      <Avatar name={comment.authorName} src={comment.authorPhoto} size={isReply ? 'xs' : 'sm'} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className={cn('rounded-2xl rounded-tl-md px-3.5 py-2.5', isMine ? 'bg-brand-50' : 'bg-ink-50')}>
          <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
            <span className="text-[13px] font-semibold text-ink-900">{comment.authorName}</span>
            <RoleTag role={comment.authorRole} />
          </div>
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-700">{comment.text}</p>
        </div>
        <div className="mt-1 flex items-center gap-3 pl-1 text-xs text-ink-400">
          <time>{timeAgo(comment.createdAt)}</time>
          {!isReply && (
            <button onClick={() => onReply(comment)} className="-my-2 py-2 font-medium text-ink-500 hover:text-brand-600">
              Reply
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function CommentThread({ update }) {
  const { workspaceId, author } = useWorkspace();
  const toast = useToast();
  const { comments, loading } = useComments(update.id);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [sending, setSending] = useState(false);
  const inputRef = useRef(null);

  const threads = useMemo(() => {
    const top = comments.filter((c) => !c.parentId);
    return top.map((c) => ({ ...c, replies: comments.filter((r) => r.parentId === c.id) }));
  }, [comments]);

  const submit = async (e) => {
    e.preventDefault();
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await backend.addComment(workspaceId, update.id, { text, parentId: replyTo?.id || null }, author);
      setText('');
      setReplyTo(null);
    } catch (err) {
      toast.error(err);
    } finally {
      setSending(false);
    }
  };

  const startReply = (c) => {
    setReplyTo(c);
    inputRef.current?.focus();
  };

  return (
    <div className="space-y-4 border-t border-ink-100 pt-4">
      {loading && !comments.length ? (
        <div className="flex justify-center py-2">
          <Spinner />
        </div>
      ) : threads.length === 0 ? (
        <p className="text-center text-sm text-ink-400">No comments yet — start the conversation.</p>
      ) : (
        threads.map((t) => (
          <div key={t.id} className="space-y-3">
            <Comment comment={t} onReply={startReply} isMine={t.authorId === author.uid} />
            {t.replies.map((r) => (
              <Comment key={r.id} comment={r} isReply isMine={r.authorId === author.uid} />
            ))}
          </div>
        ))
      )}

      <form onSubmit={submit} className="space-y-2">
        {replyTo && (
          <div className="flex items-center gap-2 rounded-xl bg-ink-50 px-3 py-1.5 text-xs text-ink-500">
            <CornerDownRight className="h-3.5 w-3.5" />
            Replying to <span className="font-semibold text-ink-700">{replyTo.authorName}</span>
            <button type="button" onClick={() => setReplyTo(null)} className="ml-auto p-1 hover:text-ink-700" aria-label="Cancel reply">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <Avatar name={author.displayName} src={author.photoURL} size="sm" className="mb-1.5" />
          <div className="flex flex-1 items-end rounded-2xl bg-white ring-1 ring-inset ring-ink-200 focus-within:ring-2 focus-within:ring-brand-500">
            <textarea
              ref={inputRef}
              rows={1}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) submit(e);
              }}
              placeholder={replyTo ? 'Write a reply…' : 'Ask a question or say thanks…'}
              className="max-h-36 min-h-[44px] flex-1 resize-none bg-transparent px-3.5 py-3 text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none"
              maxLength={2000}
            />
            <button
              type="submit"
              disabled={!text.trim() || sending}
              className="m-1 flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white transition hover:bg-brand-700 disabled:bg-ink-200"
              aria-label="Send comment"
            >
              {sending ? <Spinner className="h-4 w-4 text-white" /> : <SendHorizontal className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
