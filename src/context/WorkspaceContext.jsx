import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { backend } from '@/lib/data';
import { useAuth } from './AuthContext';

const WorkspaceContext = createContext(null);
const ACTIVE_KEY = 'devsync:active-workspace';

/**
 * Holds the active tenant. Every data subscription in the app is keyed by `workspaceId`,
 * and the router outlet is re-mounted when it changes so no state leaks between workspaces.
 * Role is strictly locked per workspace ('owner' | 'team_member' | 'developer').
 * Supports optimistic workspace injection on creation/join so navigation never stalls waiting for snapshots.
 */
export function WorkspaceProvider({ children }) {
  const { user } = useAuth();
  const [workspaces, setWorkspaces] = useState(null);
  const [activeId, setActiveId] = useState(() => localStorage.getItem(ACTIVE_KEY));
  const [workspace, setWorkspace] = useState(undefined);
  const [optimisticWorkspaces, setOptimisticWorkspaces] = useState({});

  useEffect(() => {
    if (!user) {
      setWorkspaces(null);
      setOptimisticWorkspaces({});
      return;
    }
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) setWorkspaces((prev) => (prev === null ? [] : prev));
    }, 4000);
    const unsub = backend.subscribeMyWorkspaces(user.uid, (list) => {
      settled = true;
      clearTimeout(timer);
      setWorkspaces(list);
    });
    return () => {
      clearTimeout(timer);
      unsub?.();
    };
  }, [user]);

  const mergedWorkspaces = useMemo(() => {
    const optList = Object.values(optimisticWorkspaces);
    if (workspaces === null && optList.length === 0) return null;
    const base = workspaces || [];
    const existingIds = new Set(base.map((w) => w.id));
    const extras = optList.filter((w) => !existingIds.has(w.id)).map((w) => ({ id: w.id, name: w.name, role: w.members?.[user?.uid] || 'owner' }));
    return [...base, ...extras];
  }, [workspaces, optimisticWorkspaces, user?.uid]);

  const resolvedId = useMemo(() => {
    if (!mergedWorkspaces?.length) return null;
    return mergedWorkspaces.some((w) => w.id === activeId) ? activeId : mergedWorkspaces[0].id;
  }, [mergedWorkspaces, activeId]);

  useEffect(() => {
    if (!resolvedId) {
      setWorkspace(null);
      return;
    }
    const optimisticDoc = optimisticWorkspaces[resolvedId];
    setWorkspace((prev) => (prev?.id === resolvedId ? prev : optimisticDoc || undefined));
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        setWorkspace((prev) => (prev === undefined ? optimisticDoc || null : prev));
      }
    }, 4000);
    const unsub = backend.subscribeWorkspace(resolvedId, (docSnap) => {
      settled = true;
      clearTimeout(timer);
      if (docSnap) {
        setWorkspace(docSnap);
      } else if (optimisticWorkspaces[resolvedId]) {
        // Keep optimistic workspace while Firestore snapshot catches up
        setWorkspace(optimisticWorkspaces[resolvedId]);
      } else {
        setWorkspace(null);
      }
    });
    return () => {
      clearTimeout(timer);
      unsub?.();
    };
  }, [resolvedId, user?.uid, optimisticWorkspaces]);

  const switchWorkspace = useCallback((id) => {
    localStorage.setItem(ACTIVE_KEY, id);
    setActiveId(id);
  }, []);

  const activateCreatedWorkspace = useCallback(
    ({ id, name, role = 'owner', extras = {} }) => {
      if (!user || !id) return;
      const wsDoc = {
        id,
        name: name.trim(),
        ownerId: role === 'owner' ? user.uid : null,
        members: { [user.uid]: role },
        profiles: { [user.uid]: { name: user.displayName || (role === 'owner' ? 'Owner' : 'Developer'), photoURL: user.photoURL || null } },
        businessProfile: extras.businessProfile || { tagline: '', industry: '' },
        workspaceLinks: extras.workspaceLinks || { productionUrl: '', stagingUrl: '', designUrl: '' },
        deletionRequest: null,
        ticketCounter: 0,
        github: null,
        createdAt: Date.now(),
      };
      setOptimisticWorkspaces((prev) => ({ ...prev, [id]: wsDoc }));
      localStorage.setItem(ACTIVE_KEY, id);
      setActiveId(id);
      setWorkspace(wsDoc);
    },
    [user],
  );

  const value = useMemo(() => {
    const activeWorkspace = workspace === undefined ? optimisticWorkspaces[resolvedId] : workspace;
    const role = activeWorkspace?.members?.[user?.uid] || mergedWorkspaces?.find((w) => w.id === resolvedId)?.role || null;
    return {
      workspaces: mergedWorkspaces,
      workspaceId: resolvedId,
      workspace: activeWorkspace,
      loading: mergedWorkspaces === null || (Boolean(resolvedId) && activeWorkspace === undefined),
      role,
      isOwner: role === 'owner',
      isTeamMember: role === 'team_member',
      isDeveloper: role === 'developer',
      switchWorkspace,
      activateCreatedWorkspace,
      author: user ? { uid: user.uid, displayName: user.displayName, photoURL: user.photoURL, role: role || 'team_member' } : null,
    };
  }, [mergedWorkspaces, resolvedId, workspace, optimisticWorkspaces, user, switchWorkspace, activateCreatedWorkspace]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used inside <WorkspaceProvider>');
  return ctx;
}
