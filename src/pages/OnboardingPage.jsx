import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Building2, Code2, KeyRound, Copy, Check, ArrowRight, Share2 } from 'lucide-react';
import { backend } from '@/lib/data';
import { useAuth } from '@/context/AuthContext';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useLanguage } from '@/context/LanguageContext';
import { useToast } from '@/context/ToastContext';
import { Button } from '@/components/ui/Button';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { cn, formatInviteMessage, shareInvite } from '@/lib/utils';

const inputCls =
  'h-12 w-full rounded-xl border-0 bg-ink-50 px-4 text-[15px] text-ink-900 ring-1 ring-inset ring-ink-200 placeholder:text-ink-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500';

export function OnboardingPage() {
  const { user, signOut } = useAuth();
  const { workspaces, switchWorkspace } = useWorkspace();
  const { t } = useLanguage();
  const toast = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const initialCode = (params.get('invite') || params.get('code') || '').toUpperCase();

  const [mode, setMode] = useState(initialCode ? 'join' : 'create');
  const [creatorRole, setCreatorRole] = useState('owner');
  const [name, setName] = useState('');
  const [tagline, setTagline] = useState('');
  const [code, setCode] = useState(initialCode);
  const [busy, setBusy] = useState(false);
  const [createdInfo, setCreatedInfo] = useState(null);
  const [copied, setCopied] = useState(false);

  const hasWorkspaces = workspaces?.length > 0;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === 'create') {
        const wsId = await backend.createWorkspace(user, name, creatorRole, {
          businessProfile: { tagline: tagline.trim(), industry: '' },
        });
        const targetRole = creatorRole === 'developer' ? 'owner' : 'developer';
        const inviteCode = await backend.createInvite(wsId, name.trim(), targetRole, user.uid);
        switchWorkspace(wsId);
        setCreatedInfo({ wsId, businessName: name.trim(), inviteCode, targetRole, creatorRole });
        toast.success(t('onboarding.createBtn'));
      } else {
        const wsId = await backend.joinWorkspace(code);
        switchWorkspace(wsId);
        toast.success(t('onboarding.joinBtn'));
        navigate('/', { replace: true });
      }
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  const copyInvite = async (text) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (createdInfo) {
    const shareMsg = formatInviteMessage({
      inviterName: user?.displayName,
      role: createdInfo.targetRole,
      businessName: createdInfo.businessName,
      inviteCode: createdInfo.inviteCode,
    });
    const isDevCreator = createdInfo.creatorRole === 'developer';
    const handleShare = async () => {
      const res = await shareInvite({
        inviterName: user?.displayName,
        role: createdInfo.targetRole,
        businessName: createdInfo.businessName,
        inviteCode: createdInfo.inviteCode,
      });
      if (res === 'copied') toast.success(t('settings.copyInviteMessage'));
    };

    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-8 pt-[calc(env(safe-area-inset-top)+2rem)]">
        <img src="/favicon.svg" alt="DevSync" className="h-10 w-10 rounded-xl" />
        <h1 className="mt-6 text-2xl font-bold tracking-tight text-ink-900">
          {isDevCreator ? t('onboarding.readyOwnerTitle') : t('onboarding.readyDevTitle')}
        </h1>
        <p className="mt-1.5 text-sm text-ink-500">
          {isDevCreator ? t('onboarding.readyOwnerSub') : t('onboarding.readyDevSub')}
        </p>

        <div className="mt-6 space-y-3 rounded-3xl bg-white p-5 shadow-card ring-1 ring-ink-100">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">
            {createdInfo.targetRole === 'owner' ? t('onboarding.ownerCodeLabel') : t('onboarding.devCodeLabel')}
          </p>
          <div className="flex items-center gap-2">
            <code className="flex h-12 flex-1 items-center justify-center rounded-xl bg-ink-50 font-mono text-2xl font-bold tracking-[0.25em] text-ink-900 ring-1 ring-inset ring-ink-200">
              {createdInfo.inviteCode}
            </code>
            <Button variant="secondary" size="icon" onClick={() => copyInvite(createdInfo.inviteCode)} aria-label="Copy invite code">
              {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <p className="rounded-2xl bg-ink-50 p-3 text-xs leading-relaxed text-ink-600 ring-1 ring-inset ring-ink-100">{shareMsg}</p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" size="sm" icon={Copy} onClick={() => copyInvite(shareMsg)}>
              {t('settings.copyInviteMessage')}
            </Button>
            <Button variant="primary" size="sm" icon={Share2} onClick={handleShare}>
              {t('settings.share')}
            </Button>
          </div>
        </div>

        <div className="mt-auto space-y-2.5 pt-8">
          <Button
            size="lg"
            className="w-full"
            icon={ArrowRight}
            onClick={() => navigate(isDevCreator ? '/settings' : '/', { replace: true })}
          >
            {isDevCreator ? t('onboarding.connectGithub') : t('onboarding.openDashboard')}
          </Button>
          {isDevCreator && (
            <Button size="lg" variant="ghost" className="w-full" onClick={() => navigate('/', { replace: true })}>
              {t('onboarding.skip')}
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-8 pt-[calc(env(safe-area-inset-top)+1.5rem)]">
      <div className="flex items-center justify-between">
        {hasWorkspaces ? (
          <button onClick={() => navigate(-1)} className="-ms-2 flex h-10 w-10 items-center justify-center rounded-full text-ink-600 hover:bg-ink-100" aria-label="Back">
            <ArrowLeft className="h-5 w-5 rtl:rotate-180" />
          </button>
        ) : (
          <img src="/favicon.svg" alt="DevSync" className="h-9 w-9 rounded-xl" />
        )}
        {backend.mode === 'firebase' && (
          <button onClick={signOut} className="text-sm font-medium text-ink-500 hover:text-ink-800">
            {t('onboarding.signOut')}
          </button>
        )}
      </div>

      <h1 className="mt-8 text-2xl font-bold tracking-tight text-ink-900">
        {hasWorkspaces
          ? t('onboarding.addTitle')
          : t('onboarding.welcome', { name: user?.displayName?.split(' ')[0] || t('onboarding.there') })}
      </h1>
      <p className="mt-1 text-ink-500">{t('onboarding.sub')}</p>

      <SegmentedControl
        className="mt-6 w-full"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'create', label: t('onboarding.createTab'), icon: Building2 },
          { value: 'join', label: t('onboarding.joinTab'), icon: KeyRound },
        ]}
      />

      <form onSubmit={submit} className="mt-6 space-y-4">
        {mode === 'create' ? (
          <>
            <div>
              <span className="mb-2 block text-sm font-medium text-ink-700">{t('onboarding.roleLabel')}</span>
              <div className="grid grid-cols-2 gap-2.5">
                {[
                  { value: 'owner', label: t('role.owner'), desc: t('onboarding.ownerDesc'), icon: Building2 },
                  { value: 'developer', label: t('onboarding.devTitle'), desc: t('onboarding.devDesc'), icon: Code2 },
                ].map(({ value, label, desc, icon: Icon }) => {
                  const active = creatorRole === value;
                  return (
                    <button
                      type="button"
                      key={value}
                      onClick={() => setCreatorRole(value)}
                      className={cn(
                        'flex flex-col items-start rounded-2xl p-3.5 text-start ring-1 ring-inset transition',
                        active ? 'bg-brand-50 ring-2 ring-brand-500' : 'bg-white ring-ink-200 hover:bg-ink-50',
                      )}
                    >
                      <Icon className={cn('h-5 w-5', active ? 'text-brand-600' : 'text-ink-400')} />
                      <span className="mt-2 text-sm font-semibold text-ink-900">{label}</span>
                      <span className="mt-0.5 text-[11px] leading-snug text-ink-500">{desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink-700">{t('onboarding.bizName')}</span>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                placeholder={t('onboarding.bizPlaceholder')}
                className={inputCls}
              />
            </label>

            {creatorRole === 'owner' && (
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink-700">{t('onboarding.tagline')}</span>
                <input
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  maxLength={100}
                  placeholder={t('onboarding.taglinePlaceholder')}
                  className={inputCls}
                />
              </label>
            )}
          </>
        ) : (
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink-700">{t('onboarding.codeLabel')}</span>
            <input
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={9}
              placeholder="ACME99"
              className={`${inputCls} font-mono tracking-widest`}
            />
            <p className="mt-1.5 text-xs text-ink-400">{t('onboarding.codeHint')}</p>
          </label>
        )}
        <Button
          type="submit"
          size="lg"
          className="w-full"
          loading={busy}
          disabled={mode === 'create' ? name.trim().length < 2 : code.trim().length < 6}
        >
          {mode === 'create' ? t('onboarding.createBtn') : t('onboarding.joinBtn')}
        </Button>
      </form>
    </div>
  );
}
