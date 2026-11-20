import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { backend } from '@/lib/data';
import { useAuth } from './AuthContext';

const WorkspaceContext = createContext(null);
const ACTIVE_KEY = 'devsync:active-workspace';
const VIEW_KEY = 'devsync:view-mode';

/**
 * Holds the active tenant. Every data subscription in the app is keyed by `workspaceId`,
 * and the router outlet is re-mounted when it changes so no state leaks between workspaces.
 */
export function WorkspaceProvider({ children }) {
  const { user } = useAuth();
  const [workspaces, setWorkspaces] = useState(null);
  const [activeId, setActiveId] = useState(() => localStorage.getItem(ACTIVE_KEY));
  const [workspace, setWorkspace] = useState(undefined);
  const [viewMode, setViewModeState] = useState(() => localStorage.getItem(VIEW_KEY) || 'owner');

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

  const setViewMode = useCallback((mode) => {
    localStorage.setItem(VIEW_KEY, mode);
    setViewModeState(mode);
    backend.setDemoPersona?.(mode);
  }, []);

  const value = useMemo(() => {
    const role = workspace?.members?.[user?.uid] || null;
    return {
      workspaces,
      workspaceId: resolvedId,
      workspace,
      loading: workspaces === null || (resolvedId && workspace === undefined),
      role,
      viewMode,
      isDevView: viewMode === 'developer',
      setViewMode,
      switchWorkspace,
      author: user ? { uid: user.uid, displayName: user.displayName, photoURL: user.photoURL, role: role || viewMode } : null,
    };
  }, [workspaces, resolvedId, workspace, user, viewMode, setViewMode, switchWorkspace]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used inside <WorkspaceProvider>');
  return ctx;
}
