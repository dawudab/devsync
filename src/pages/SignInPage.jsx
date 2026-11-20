import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Lock, MessageCircle, ClipboardList, Sparkles, UserRound, KeyRound } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { useToast } from '@/context/ToastContext';
import { Button } from '@/components/ui/Button';

const FEATURES = [
  { icon: Sparkles, key: 'signin.f1' },
  { icon: MessageCircle, key: 'signin.f2' },
  { icon: ClipboardList, key: 'signin.f3' },
];

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.96 10.96 0 0 0 12 1 11 11 0 0 0 2.18 7.06L5.84 9.9C6.71 7.3 9.14 5.38 12 5.38z" />
    </svg>
  );
}

export function SignInPage() {
  const { signInWithGoogle, signInAsGuest } = useAuth();
  const { t } = useLanguage();
  const toast = useToast();
  const [params] = useSearchParams();
  const inviteCode = (params.get('invite') || params.get('code') || '').toUpperCase();
  const [busy, setBusy] = useState(null);
  const [guestName, setGuestName] = useState('');

  const run = (key, fn) => async () => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      toast.error(e);
      setBusy(null);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col bg-gradient-to-b from-brand-600 via-brand-700 to-ink-950 px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-[calc(env(safe-area-inset-top)+3rem)] text-white">
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col">
        <div className="flex items-center gap-2.5">
          <img src="/favicon.svg" alt="" className="h-10 w-10 rounded-xl ring-2 ring-white/20" />
          <span className="text-xl font-bold tracking-tight">DevSync</span>
        </div>
        <h1 className="mt-10 text-[2rem] font-bold leading-tight tracking-tight">{t('signin.headline')}</h1>
        <p className="mt-3 text-white/70">{t('signin.sub')}</p>
        {inviteCode && (
          <div className="mt-6 flex items-center gap-3 rounded-2xl bg-white/15 p-3.5 ring-1 ring-inset ring-white/25">
            <KeyRound className="h-5 w-5 shrink-0 text-amber-300" />
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-white/80">{t('signin.inviteTitle')}</p>
              <p className="text-sm text-white">
                {t('signin.inviteSub')} <code className="font-mono font-bold">{inviteCode}</code>
              </p>
            </div>
          </div>
        )}
        <ul className="mt-8 space-y-3">
          {FEATURES.map(({ icon: Icon, key }) => (
            <li key={key} className="flex items-center gap-3 text-sm text-white/90">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10">
                <Icon className="h-4 w-4" />
              </span>
              {t(key)}
            </li>
          ))}
        </ul>

        <div className="mt-auto space-y-3 pt-10">
          <Button size="lg" variant="secondary" className="w-full !text-ink-900" loading={busy === 'google'} onClick={run('google', signInWithGoogle)}>
            {busy !== 'google' && <GoogleIcon />} {t('signin.google')}
          </Button>
          <div className="flex gap-2">
            <input
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder={t('signin.namePlaceholder')}
              className="h-12 min-w-0 flex-1 rounded-2xl bg-white/10 px-4 text-sm text-white ring-1 ring-inset ring-white/20 placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-white/60"
            />
            <Button size="lg" variant="ghost" icon={UserRound} className="!text-white ring-1 ring-inset ring-white/20 hover:!bg-white/10" loading={busy === 'guest'} onClick={run('guest', () => signInAsGuest(guestName.trim() || 'Guest'))}>
              {t('signin.guest')}
            </Button>
          </div>
          <p className="flex items-center justify-center gap-1.5 pt-2 text-xs text-white/50">
            <Lock className="h-3 w-3" /> {t('signin.privacy')}
          </p>
        </div>
      </div>
    </div>
  );
}
