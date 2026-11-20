import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Copy, Check, LogOut, RotateCcw, Users, Eye } from 'lucide-react';
import { backend } from '@/lib/data';
import { useAuth } from '@/context/AuthContext';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useToast } from '@/context/ToastContext';
import { PageHeader } from '@/components/layout/AppShell';
import { ViewSwitcher } from '@/components/layout/ViewSwitcher';
import { GitHubConnection } from '@/components/settings/GitHubConnection';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';

function Section({ title, description, children }) {
  return (
    <section className="rounded-3xl bg-white p-5 shadow-card ring-1 ring-ink-100">
      {title && <h2 className="text-base font-semibold text-ink-900">{title}</h2>}
      {description && <p className="mb-4 mt-0.5 text-sm text-ink-500">{description}</p>}
      {!description && title && <div className="mb-4" />}
      {children}
    </section>
  );
}

const GITHUB_ERRORS = {
  state: 'The connection link expired. Please try again.',
  installation: 'We could not verify that GitHub installation.',
  forbidden: 'Your GitHub account does not have access to that installation.',
  taken: 'That GitHub installation is already linked to another workspace.',
  oauth: 'GitHub sign-in was cancelled or failed.',
};

export function SettingsPage() {
  const { user, signOut } = useAuth();
  const { workspace, role } = useWorkspace();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const status = params.get('github');
    if (!status) return;
    if (status === 'connected') toast.success('GitHub App installed — choose your repository below');
    else toast.error(GITHUB_ERRORS[params.get('reason')] || 'GitHub connection failed');
    setParams({}, { replace: true });
  }, [params, setParams, toast]);

  const copyInvite = async () => {
    await navigator.clipboard.writeText(workspace.inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const members = Object.entries(workspace?.members || {});

  return (
    <div className="space-y-4">
      <PageHeader title="Settings" subtitle={workspace?.name} />

      <Section title="GitHub" description="DevSync listens to your repository through a secure GitHub App.">
        <GitHubConnection />
      </Section>

      <Section title="View mode" description="Switch between the simplified owner experience and the technical developer view.">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-ink-600">
            <Eye className="h-4 w-4" /> Currently viewing as
          </div>
          <ViewSwitcher size="md" />
        </div>
      </Section>

      <Section title="Team" description="Invite your developer with this private code. They’ll only see this workspace.">
        <div className="mb-4 flex items-center gap-2">
          <code className="flex h-12 flex-1 items-center rounded-xl bg-ink-50 px-4 font-mono text-lg font-semibold tracking-widest text-ink-900 ring-1 ring-inset ring-ink-200">
            {workspace?.inviteCode}
          </code>
          <Button variant="secondary" size="icon" onClick={copyInvite} aria-label="Copy invite code">
            {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
        <ul className="space-y-2">
          {members.map(([uid, memberRole]) => {
            const profile = workspace.profiles?.[uid] || {};
            return (
              <li key={uid} className="flex items-center gap-3">
                <Avatar name={profile.name || 'Member'} src={profile.photoURL} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink-900">
                    {profile.name || 'Member'} {uid === user?.uid && <span className="text-ink-400">(you)</span>}
                  </p>
                  <p className="text-xs capitalize text-ink-500">{memberRole}</p>
                </div>
              </li>
            );
          })}
        </ul>
        <p className="mt-4 flex items-center gap-1.5 text-xs text-ink-400">
          <Users className="h-3.5 w-3.5" /> Your role: <span className="capitalize">{role}</span>
        </p>
      </Section>

      <Section>
        <div className="flex flex-wrap gap-2">
          {backend.mode === 'demo' ? (
            <Button
              variant="secondary"
              icon={RotateCcw}
              onClick={() => {
                if (window.confirm('Reset all demo data in this browser?')) {
                  backend.resetDemo();
                  toast.success('Demo data reset');
                }
              }}
            >
              Reset demo data
            </Button>
          ) : (
            <Button variant="secondary" icon={LogOut} onClick={signOut}>
              Sign out
            </Button>
          )}
        </div>
        <p className="mt-3 text-xs text-ink-400">
          {backend.mode === 'demo' ? 'Running in Demo Mode — add Firebase keys to .env to go live.' : `Signed in as ${user?.displayName}${user?.isAnonymous ? ' (guest)' : ''}`}
        </p>
      </Section>
    </div>
  );
}
