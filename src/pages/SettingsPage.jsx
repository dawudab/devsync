import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Copy, Check, LogOut, RotateCcw, Users, Trash2, Link as LinkIcon, Building2, UserPlus, Share2 } from 'lucide-react';
import { backend } from '@/lib/data';
import { ROLES, roleMeta } from '@/lib/constants';
import { useAuth } from '@/context/AuthContext';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useToast } from '@/context/ToastContext';
import { useInvites } from '@/hooks/useWorkspaceData';
import { PageHeader } from '@/components/layout/AppShell';
import { GitHubConnection } from '@/components/settings/GitHubConnection';
import { DeleteProjectSheet, DeletionRequestBanner } from '@/components/settings/DeleteProjectSheet';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { cn, formatInviteMessage, shareInvite } from '@/lib/utils';

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

const inputCls =
  'h-11 w-full rounded-xl border-0 bg-ink-50 px-3.5 text-sm text-ink-900 ring-1 ring-inset ring-ink-200 placeholder:text-ink-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500';

const GITHUB_ERRORS = {
  state: 'The connection link expired. Please try again.',
  installation: 'We could not verify that GitHub installation.',
  forbidden: 'Your GitHub account does not have access to that installation.',
  taken: 'That GitHub installation is already linked to another workspace.',
  oauth: 'GitHub sign-in was cancelled or failed.',
};

export function SettingsPage() {
  const { user, signOut } = useAuth();
  const { workspace, workspaceId, role, isOwner, isDeveloper } = useWorkspace();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const { invites } = useInvites(isOwner || isDeveloper);
  const [copiedCode, setCopiedCode] = useState(null);
  const [inviteRole, setInviteRole] = useState('developer');
  const [savingKey, setSavingKey] = useState(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [biz, setBiz] = useState({
    name: workspace?.name || '',
    tagline: workspace?.businessProfile?.tagline || '',
    industry: workspace?.businessProfile?.industry || '',
  });
  const [links, setLinks] = useState({
    productionUrl: workspace?.workspaceLinks?.productionUrl || '',
    stagingUrl: workspace?.workspaceLinks?.stagingUrl || '',
    designUrl: workspace?.workspaceLinks?.designUrl || '',
  });

  useEffect(() => {
    const status = params.get('github');
    if (!status) return;
    if (status === 'connected') toast.success('GitHub App installed — choose your repository below');
    else toast.error(GITHUB_ERRORS[params.get('reason')] || 'GitHub connection failed');
    setParams({}, { replace: true });
  }, [params, setParams, toast]);

  const copyMessage = async (inv) => {
    const msg = formatInviteMessage({
      inviterName: user?.displayName,
      role: inv.role,
      businessName: workspace?.name,
      inviteCode: inv.code,
    });
    await navigator.clipboard.writeText(msg);
    setCopiedCode(inv.code);
    toast.success('Invite message copied');
    setTimeout(() => setCopiedCode(null), 1500);
  };

  const handleShare = async (inv) => {
    const res = await shareInvite({
      inviterName: user?.displayName,
      role: inv.role,
      businessName: workspace?.name,
      inviteCode: inv.code,
    });
    if (res === 'copied') toast.success('Invite message copied to clipboard');
    else if (res === 'shared') toast.success('Invite shared');
  };

  const savePatch = async (key, patch, msg) => {
    setSavingKey(key);
    try {
      await backend.updateWorkspace(workspaceId, patch);
      toast.success(msg);
    } catch (err) {
      toast.error(err);
    } finally {
      setSavingKey(null);
    }
  };

  const createInvite = async (targetRole) => {
    setSavingKey(`inv-${targetRole}`);
    try {
      const code = await backend.createInvite(workspaceId, workspace.name, targetRole, user.uid);
      toast.success(`Created ${roleMeta(targetRole).label} invite: ${code}`);
    } catch (err) {
      toast.error(err);
    } finally {
      setSavingKey(null);
    }
  };

  const members = Object.entries(workspace?.members || {});
  const hasOwner = Boolean(workspace?.ownerId) || Object.values(workspace?.members || {}).includes('owner');
  const canInvite = isOwner || isDeveloper;
  const effectiveInviteRole = isOwner ? inviteRole : inviteRole === 'developer' ? 'owner' : inviteRole;

  return (
    <div className="space-y-4">
      <PageHeader title="Settings" subtitle={workspace?.name} />

      <DeletionRequestBanner />

      {isDeveloper && (
        <Section title="GitHub" description="DevSync listens to your repository through a secure GitHub App.">
          <GitHubConnection />
        </Section>
      )}

      {isOwner && (
        <>
          <Section title="Business profile" description="Displayed on your executive dashboard.">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (biz.name.trim().length < 2) return;
                savePatch(
                  'biz',
                  { name: biz.name.trim(), businessProfile: { tagline: biz.tagline.trim(), industry: biz.industry.trim() } },
                  'Business profile saved',
                );
              }}
              className="space-y-3"
            >
              <label className="block">
                <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-ink-600">
                  <Building2 className="h-3.5 w-3.5" /> Business name
                </span>
                <input value={biz.name} onChange={(e) => setBiz((b) => ({ ...b, name: e.target.value }))} maxLength={60} className={inputCls} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-ink-600">Tagline</span>
                <input value={biz.tagline} onChange={(e) => setBiz((b) => ({ ...b, tagline: e.target.value }))} maxLength={100} placeholder="e.g. Small-batch roastery & online storefront" className={inputCls} />
              </label>
              <Button type="submit" size="sm" loading={savingKey === 'biz'} disabled={biz.name.trim().length < 2}>
                Save profile
              </Button>
            </form>
          </Section>

          <Section title="Live & Preview Links" description="Pinned at the top of your Feed for one-tap testing.">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                savePatch('links', { workspaceLinks: links }, 'Preview links updated');
              }}
              className="space-y-3"
            >
              <label className="block">
                <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-ink-600">
                  <LinkIcon className="h-3.5 w-3.5" /> Live Production App URL
                </span>
                <input type="url" value={links.productionUrl} onChange={(e) => setLinks((l) => ({ ...l, productionUrl: e.target.value }))} placeholder="https://yourapp.com" className={inputCls} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-ink-600">Staging / Test Preview URL</span>
                <input type="url" value={links.stagingUrl} onChange={(e) => setLinks((l) => ({ ...l, stagingUrl: e.target.value }))} placeholder="https://staging.yourapp.com" className={inputCls} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-ink-600">Design / Reference URL</span>
                <input type="url" value={links.designUrl} onChange={(e) => setLinks((l) => ({ ...l, designUrl: e.target.value }))} placeholder="https://figma.com/file/..." className={inputCls} />
              </label>
              <Button type="submit" size="sm" loading={savingKey === 'links'}>
                Save links
              </Button>
            </form>
          </Section>
        </>
      )}

      <Section
        title="Team & Invites"
        description={canInvite ? 'Generate role-locked invite messages or view workspace members.' : 'People with access to this private workspace.'}
      >
        {canInvite && (
          <div className="mb-5 space-y-3 rounded-2xl bg-ink-50 p-3.5 ring-1 ring-inset ring-ink-100">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={effectiveInviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className="h-10 flex-1 rounded-xl border-0 bg-white px-3 text-sm font-medium text-ink-800 ring-1 ring-inset ring-ink-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {isOwner && <option value="developer">Developer (GitHub &amp; tickets)</option>}
                <option value="team_member">Team Member (Read + suggestions)</option>
                <option value="owner">{hasOwner ? 'Co-Owner (Full admin)' : 'Business Owner (Admin)'}</option>
              </select>
              <Button
                size="sm"
                icon={UserPlus}
                loading={savingKey?.startsWith('inv-')}
                onClick={() => createInvite(effectiveInviteRole)}
              >
                New invite
              </Button>
            </div>

            {invites.length > 0 && (
              <ul className="space-y-2">
                {invites.map((inv) => (
                  <li key={inv.code} className="rounded-xl bg-white p-3 ring-1 ring-inset ring-ink-200">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <code className="font-mono text-sm font-bold tracking-widest text-ink-900">{inv.code}</code>
                        <Badge tone={roleMeta(inv.role).tone}>{roleMeta(inv.role).short}</Badge>
                        {inv.usedBy && <span className="text-[11px] font-medium text-emerald-600">Claimed</span>}
                      </div>
                      <button
                        onClick={() => backend.deleteInvite(inv.code).catch(toast.error)}
                        aria-label="Revoke invite"
                        className="rounded-full p-1.5 text-ink-300 hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Button variant="secondary" size="sm" onClick={() => copyMessage(inv)}>
                        {copiedCode === inv.code ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                        Copy Invite Message
                      </Button>
                      <Button variant="ghost" size="sm" icon={Share2} onClick={() => handleShare(inv)}>
                        Share
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <ul className="space-y-2.5">
          {members.map(([uid, memberRole]) => {
            const profile = workspace.profiles?.[uid] || {};
            const meta = roleMeta(memberRole);
            const isSelf = uid === user?.uid;
            return (
              <li key={uid} className="flex items-center gap-3">
                <Avatar name={profile.name || 'Member'} src={profile.photoURL} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink-900">
                    {profile.name || 'Member'} {isSelf && <span className="text-ink-400">(you)</span>}
                  </p>
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                </div>
                {isOwner && !isSelf && (
                  <div className="flex items-center gap-1.5">
                    <select
                      value={memberRole}
                      onChange={(e) => backend.updateMemberRole(workspaceId, uid, e.target.value).then(() => toast.success('Role updated')).catch(toast.error)}
                      aria-label={`Role for ${profile.name}`}
                      className="h-8 rounded-lg border-0 bg-ink-50 px-2 text-xs font-medium text-ink-700 ring-1 ring-inset ring-ink-200"
                    >
                      {Object.values(ROLES).map((r) => (
                        <option key={r.value} value={r.value}>{r.short}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => backend.removeMember(workspaceId, uid).then(() => toast.success('Member removed')).catch(toast.error)}
                      aria-label="Remove member"
                      className="rounded-full p-1.5 text-ink-300 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <p className="mt-4 flex items-center gap-1.5 text-xs text-ink-400">
          <Users className="h-3.5 w-3.5" /> Your locked role: <span className="font-semibold text-ink-600">{roleMeta(role).label}</span>
        </p>
      </Section>

      {(isOwner || isDeveloper) && (
        <Section
          title="Danger zone"
          description={
            isDeveloper && hasOwner
              ? 'This project has an active Business Owner. Deleting it requires the Owner’s approval.'
              : 'Permanently delete this project and all of its data.'
          }
        >
          <Button
            variant="danger"
            size="sm"
            icon={Trash2}
            disabled={isDeveloper && hasOwner && workspace?.deletionRequest?.status === 'pending'}
            onClick={() => setDeleteOpen(true)}
          >
            {isDeveloper && hasOwner ? 'Request project deletion' : 'Delete project'}
          </Button>
          <DeleteProjectSheet open={deleteOpen} onClose={() => setDeleteOpen(false)} />
        </Section>
      )}

      <Section title={backend.mode === 'demo' ? 'Demo accounts' : 'Account'}>
        {backend.mode === 'demo' ? (
          <div className="space-y-3">
            <p className="text-xs text-ink-500">Switch which demo user you are signed in as to test locked role permissions:</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { key: 'owner', label: 'Sarah Lee', sub: 'Owner' },
                { key: 'team_member', label: 'Jordan Kim', sub: 'Team' },
                { key: 'developer', label: 'Alex Rivera', sub: 'Developer' },
              ].map((p) => (
                <button
                  key={p.key}
                  onClick={() => backend.setDemoPersona(p.key)}
                  className={cn(
                    'rounded-2xl p-2.5 text-left ring-1 ring-inset transition',
                    role === p.key ? 'bg-brand-50 ring-2 ring-brand-500' : 'bg-ink-50 ring-ink-200 hover:bg-white',
                  )}
                >
                  <p className="truncate text-xs font-semibold text-ink-900">{p.label}</p>
                  <p className="text-[11px] text-ink-500">{p.sub}</p>
                </button>
              ))}
            </div>
            <Button
              variant="secondary"
              size="sm"
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
          </div>
        ) : (
          <div className="space-y-2">
            <Button variant="secondary" icon={LogOut} onClick={signOut}>
              Sign out
            </Button>
            <p className="text-xs text-ink-400">
              Signed in as {user?.displayName}{user?.isAnonymous ? ' (guest)' : ''}
            </p>
          </div>
        )}
      </Section>
    </div>
  );
}
