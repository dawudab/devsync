import { Navigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { Github } from '@/components/ui/GithubIcon';
import { useWorkspace } from '@/context/WorkspaceContext';
import { backend } from '@/lib/data';
import { PageHeader } from '@/components/layout/AppShell';
import { WebhookLogList } from '@/components/dev/WebhookLogList';
import { TranslatorPlayground } from '@/components/dev/TranslatorPlayground';
import { SimulateEventButton } from '@/components/dev/SimulateEventButton';
import { formatDateTime } from '@/lib/utils';

export function ActivityPage() {
  const { isDeveloper, workspace } = useWorkspace();
  if (!isDeveloper) return <Navigate to="/" replace />;
  const gh = workspace?.github;

  return (
    <div className="space-y-6">
      <PageHeader title="Webhooks" subtitle="GitHub App deliveries and AI pipeline status." action={gh?.selectedRepo && <SimulateEventButton />} />

      <section className="grid gap-2.5 sm:grid-cols-2">
        <div className="rounded-2xl bg-white p-4 shadow-card ring-1 ring-ink-100">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink-900">
            <Github className="h-4 w-4" /> Installation
          </div>
          <dl className="mt-2 space-y-1 font-mono text-[11.5px] text-ink-600">
            <div className="flex justify-between gap-2"><dt className="text-ink-400">id</dt><dd className="truncate">{gh?.installationId ?? '—'}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-ink-400">repo</dt><dd className="truncate">{gh?.selectedRepo?.fullName ?? '—'}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-ink-400">status</dt><dd>{gh?.status ?? 'not installed'}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-ink-400">since</dt><dd>{gh?.connectedAt ? formatDateTime(gh.connectedAt) : '—'}</dd></div>
          </dl>
        </div>
        <div className="rounded-2xl bg-white p-4 shadow-card ring-1 ring-ink-100">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink-900">
            <ShieldCheck className="h-4 w-4 text-emerald-600" /> Security
          </div>
          <ul className="mt-2 space-y-1 text-xs text-ink-600">
            <li>• HMAC-SHA256 signature verified on every delivery</li>
            <li>• Installation tokens minted per request, never stored</li>
            <li>• Data scoped to <span className="font-mono">workspaces/{'{id}'}</span> by security rules</li>
            {backend.mode === 'demo' && <li className="text-amber-700">• Demo Mode: deliveries are simulated locally</li>}
          </ul>
        </div>
      </section>

      <TranslatorPlayground />

      <section>
        <h2 className="mb-2.5 text-sm font-semibold text-ink-700">Recent deliveries</h2>
        <WebhookLogList />
      </section>
    </div>
  );
}
