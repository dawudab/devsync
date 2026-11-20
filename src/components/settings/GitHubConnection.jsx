import { useState } from 'react';
import { Github } from '@/components/ui/GithubIcon';
import { Lock, Globe, CheckCircle2, ShieldCheck, Eye, GitPullRequest, Unplug, RefreshCw, ExternalLink } from 'lucide-react';
import { backend } from '@/lib/data';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useToast } from '@/context/ToastContext';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { cn, formatDateTime } from '@/lib/utils';

const PERMISSIONS = [
  { icon: Eye, text: 'Read-only access to code & commit history' },
  { icon: GitPullRequest, text: 'Read pull requests to explain merged work' },
  { icon: ShieldCheck, text: 'No write access — DevSync can never change your code' },
];

function RepoPicker({ repos, selectedId, onSelect, busyId }) {
  return (
    <ul className="space-y-2">
      {repos.map((r) => (
        <li key={r.id}>
          <button
            onClick={() => onSelect(r.id)}
            disabled={busyId != null}
            className={cn(
              'flex w-full items-center gap-3 rounded-2xl p-3 text-left ring-1 ring-inset transition',
              r.id === selectedId ? 'bg-brand-50 ring-brand-300' : 'bg-white ring-ink-200 hover:bg-ink-50',
            )}
          >
            {r.private ? <Lock className="h-4 w-4 text-ink-400" /> : <Globe className="h-4 w-4 text-ink-400" />}
            <span className="min-w-0 flex-1 truncate font-mono text-sm text-ink-800">{r.fullName}</span>
            {busyId === r.id ? <RefreshCw className="h-4 w-4 animate-spin text-brand-600" /> : r.id === selectedId && <CheckCircle2 className="h-5 w-5 text-brand-600" />}
          </button>
        </li>
      ))}
    </ul>
  );
}

export function GitHubConnection() {
  const { workspaceId, workspace, isDeveloper } = useWorkspace();
  const toast = useToast();
  const [connecting, setConnecting] = useState(false);
  const [busyRepo, setBusyRepo] = useState(null);
  const [changing, setChanging] = useState(false);
  const gh = workspace?.github;
  const canManage = isDeveloper;

  const connect = async () => {
    setConnecting(true);
    try {
      const { redirected } = await backend.startGithubInstall(workspaceId);
      if (!redirected) toast.success('DevSync GitHub App installed');
    } catch (e) {
      toast.error(e);
    } finally {
      setConnecting(false);
    }
  };

  const select = async (repoId) => {
    setBusyRepo(repoId);
    try {
      await backend.selectRepository(workspaceId, repoId);
      setChanging(false);
      toast.success('Repository connected');
    } catch (e) {
      toast.error(e);
    } finally {
      setBusyRepo(null);
    }
  };

  const disconnect = async () => {
    if (!window.confirm('Disconnect GitHub? The feed will stop receiving new updates. Existing history is kept.')) return;
    try {
      await backend.disconnectGithub(workspaceId);
      toast.success('GitHub disconnected');
    } catch (e) {
      toast.error(e);
    }
  };

  if (!gh || gh.status === 'removed') {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-ink-900 text-white">
            <Github className="h-6 w-6" />
          </span>
          <div>
            <h3 className="font-semibold text-ink-900">Connect your private repository</h3>
            <p className="text-sm text-ink-500">Install the DevSync GitHub App and choose which repository to follow.</p>
          </div>
        </div>
        <ul className="space-y-2 rounded-2xl bg-ink-50 p-3">
          {PERMISSIONS.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-2.5 text-sm text-ink-700">
              <Icon className="h-4 w-4 shrink-0 text-emerald-600" /> {text}
            </li>
          ))}
        </ul>
        <Button variant="dark" size="lg" icon={Github} loading={connecting} onClick={connect} disabled={!canManage} className="w-full">
          Install GitHub App
        </Button>
        {!canManage && <p className="text-center text-xs text-ink-500">Only a workspace developer can connect GitHub.</p>}
      </div>
    );
  }

  if (gh.status === 'pending_selection' || changing || !gh.selectedRepo) {
    return (
      <div className="space-y-3">
        <div>
          <h3 className="font-semibold text-ink-900">Choose a repository</h3>
          <p className="text-sm text-ink-500">
            The app is installed on <span className="font-medium text-ink-700">{gh.account?.login}</span>. Pick the repository this workspace should follow.
          </p>
        </div>
        <RepoPicker repos={gh.repos || []} selectedId={gh.selectedRepo?.id} onSelect={select} busyId={busyRepo} />
        {changing && (
          <Button variant="ghost" className="w-full" onClick={() => setChanging(false)}>
            Cancel
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-2xl bg-emerald-50/70 p-3 ring-1 ring-inset ring-emerald-100">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-ink-900 ring-1 ring-ink-200">
          <Github className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-sm font-semibold text-ink-900">{gh.selectedRepo.fullName}</p>
          <p className="text-xs text-emerald-700">Connected {gh.connectedAt ? `· ${formatDateTime(gh.connectedAt)}` : ''}</p>
        </div>
        <Badge tone={gh.status === 'suspended' ? 'amber' : 'emerald'} dot>
          {gh.status === 'suspended' ? 'Suspended' : 'Live'}
        </Badge>
      </div>

      {isDeveloper && (
        <dl className="grid grid-cols-2 gap-2 font-mono text-[11.5px]">
          {[
            ['installation_id', gh.installationId],
            ['account', gh.account?.login],
            ['default_branch', gh.selectedRepo.defaultBranch],
            ['visibility', gh.selectedRepo.private ? 'private' : 'public'],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl bg-ink-50 px-3 py-2">
              <dt className="text-ink-400">{k}</dt>
              <dd className="truncate text-ink-800">{String(v ?? '—')}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="flex flex-wrap gap-2">
        {gh.repos?.length > 1 && canManage && (
          <Button variant="secondary" size="sm" icon={RefreshCw} onClick={() => setChanging(true)}>
            Change repository
          </Button>
        )}
        {gh.selectedRepo.htmlUrl && (
          <a href={gh.selectedRepo.htmlUrl} target="_blank" rel="noreferrer">
            <Button variant="ghost" size="sm" icon={ExternalLink}>
              Open on GitHub
            </Button>
          </a>
        )}
        {canManage && (
          <Button variant="danger" size="sm" icon={Unplug} onClick={disconnect} className="ml-auto">
            Disconnect
          </Button>
        )}
      </div>
    </div>
  );
}
