import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { backend } from '@/lib/data';
import { useAuth } from './AuthContext';

const WorkspaceContext = createContext(null);
const ACTIVE_KEY = 'devsync:active-workspace';

/**
 * Holds the active tenant. Every data subscription in the app is keyed by `workspaceId`,
 * and the router outlet is re-mounted when it changes so no state leaks between workspaces.
 * Role is strictly locked per workspace ('owner' | 'team_member' | 'developer').
 */
export function WorkspaceProvider({ children }) {
  const { user } = useAuth();
  const [workspaces, setWorkspaces] = useState(null);
  const [activeId, setActiveId] = useState(() => localStorage.getItem(ACTIVE_KEY));
  const [workspace, setWorkspace] = useState(undefined);

  useEffect(() => {
    if (!user) {
      setWorkspaces(null);
      return;
    }
    return backend.subscribeMyWorkspaces(user.uid, setWorkspaces);
  }, [user]);

  const resolvedId = useMemo(() => {
    if (!workspaces?.length) return null;
    return workspaces.some((w) => w.id === activeId) ? activeId : workspaces[0].id;
  }, [workspaces, activeId]);

  useEffect(() => {
    if (!resolvedId) {
      setWorkspace(null);
      return;
    }
    setWorkspace(undefined);
    return backend.subscribeWorkspace(resolvedId, setWorkspace);
  }, [resolvedId, user?.uid]);

  const switchWorkspace = useCallback((id) => {
    localStorage.setItem(ACTIVE_KEY, id);
    setActiveId(id);
  }, []);

  const value = useMemo(() => {
    const role = workspace?.members?.[user?.uid] || null;
    return {
      workspaces,
      workspaceId: resolvedId,
      workspace,
      loading: workspaces === null || (resolvedId && workspace === undefined),
      role,
      isOwner: role === 'owner',
      isTeamMember: role === 'team_member',
      isDeveloper: role === 'developer',
      switchWorkspace,
      author: user ? { uid: user.uid, displayName: user.displayName, photoURL: user.photoURL, role: role || 'team_member' } : null,
    };
  }, [workspaces, resolvedId, workspace, user, switchWorkspace]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used inside <WorkspaceProvider>');
  return ctx;
}
