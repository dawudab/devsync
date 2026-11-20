import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Building2, KeyRound } from 'lucide-react';
import { backend } from '@/lib/data';
import { useAuth } from '@/context/AuthContext';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useToast } from '@/context/ToastContext';
import { Button } from '@/components/ui/Button';
import { SegmentedControl } from '@/components/ui/SegmentedControl';

const inputCls =
  'h-12 w-full rounded-xl border-0 bg-ink-50 px-4 text-[15px] text-ink-900 ring-1 ring-inset ring-ink-200 placeholder:text-ink-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500';

export function OnboardingPage() {
  const { user, signOut } = useAuth();
  const { workspaces, switchWorkspace, setViewMode } = useWorkspace();
  const toast = useToast();
  const navigate = useNavigate();
  const [mode, setMode] = useState('create');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const hasWorkspaces = workspaces?.length > 0;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const id = mode === 'create' ? await backend.createWorkspace(user, name) : await backend.joinWorkspace(code);
      switchWorkspace(id);
      setViewMode(mode === 'create' ? 'owner' : 'developer');
      toast.success(mode === 'create' ? 'Workspace created' : 'Joined workspace');
      navigate(mode === 'create' ? '/settings' : '/');
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-8 pt-[calc(env(safe-area-inset-top)+1.5rem)]">
      <div className="flex items-center justify-between">
        {hasWorkspaces ? (
          <button onClick={() => navigate(-1)} className="-ml-2 flex h-10 w-10 items-center justify-center rounded-full text-ink-600 hover:bg-ink-100" aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </button>
        ) : (
          <img src="/favicon.svg" alt="DevSync" className="h-9 w-9 rounded-xl" />
        )}
        {backend.mode === 'firebase' && (
          <button onClick={signOut} className="text-sm font-medium text-ink-500 hover:text-ink-800">
            Sign out
          </button>
        )}
      </div>

      <h1 className="mt-8 text-2xl font-bold tracking-tight text-ink-900">{hasWorkspaces ? 'Add a workspace' : `Welcome, ${user?.displayName?.split(' ')[0] || 'there'}`}</h1>
      <p className="mt-1 text-ink-500">Create a private workspace for your business, or join one with an invite code from the owner.</p>

      <SegmentedControl
        className="mt-6 w-full"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'create', label: 'I’m a business owner', icon: Building2 },
          { value: 'join', label: 'I have a code', icon: KeyRound },
        ]}
      />

      <form onSubmit={submit} className="mt-6 space-y-4">
        {mode === 'create' ? (
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink-700">Business name</span>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="e.g. Acme Coffee Co." className={inputCls} />
          </label>
        ) : (
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink-700">Invite code</span>
            <input
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={9}
              placeholder="ABCD-1234"
              className={`${inputCls} font-mono tracking-widest`}
            />
          </label>
        )}
        <Button type="submit" size="lg" className="w-full" loading={busy} disabled={mode === 'create' ? name.trim().length < 2 : code.trim().length < 9}>
          {mode === 'create' ? 'Create workspace' : 'Join workspace'}
        </Button>
      </form>
    </div>
  );
}
