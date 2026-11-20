import { Webhook } from 'lucide-react';
import { useWebhookLogs } from '@/hooks/useWorkspaceData';
import { EmptyState, Spinner } from '@/components/ui/Feedback';
import { cn, formatDateTime, timeAgo } from '@/lib/utils';

const STATUS = {
  processed: { dot: 'bg-emerald-500', text: 'text-emerald-700', label: '200 OK' },
  processing: { dot: 'bg-sky-500 animate-pulse', text: 'text-sky-700', label: 'processing' },
  ignored: { dot: 'bg-ink-300', text: 'text-ink-500', label: 'ignored' },
  error: { dot: 'bg-rose-500', text: 'text-rose-700', label: 'error' },
  rejected: { dot: 'bg-rose-500', text: 'text-rose-700', label: '401 rejected' },
};

export function WebhookLogList() {
  const { logs, loading } = useWebhookLogs();

  if (loading && !logs.length) return <div className="flex justify-center py-6"><Spinner /></div>;
  if (!logs.length) return <EmptyState icon={Webhook} title="No deliveries yet">Webhook deliveries from GitHub will be listed here.</EmptyState>;

  return (
    <ul className="divide-y divide-ink-100 overflow-hidden rounded-2xl bg-white shadow-card ring-1 ring-ink-100">
      {logs.map((log) => {
        const s = STATUS[log.status] || STATUS.processed;
        return (
          <li key={log.id} className="px-4 py-3">
            <div className="flex items-center gap-2">
              <span className={cn('h-2 w-2 shrink-0 rounded-full', s.dot)} />
              <span className="font-mono text-[13px] font-semibold text-ink-900">
                {log.event}
                {log.action && <span className="font-normal text-ink-500">.{log.action}</span>}
              </span>
              <span className={cn('font-mono text-[11px]', s.text)}>{s.label}</span>
              <time className="ml-auto shrink-0 text-xs text-ink-400" title={formatDateTime(log.receivedAt)}>
                {timeAgo(log.receivedAt)}
              </time>
            </div>
            <p className="mt-1 pl-4 text-xs text-ink-600">{log.message}</p>
            <p className="mt-0.5 truncate pl-4 font-mono text-[10.5px] text-ink-400">
              {log.deliveryId}
              {log.durationMs != null && ` · ${log.durationMs}ms`}
              {log.repo && ` · ${log.repo}`}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
