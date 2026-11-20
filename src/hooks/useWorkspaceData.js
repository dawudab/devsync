import { backend } from '@/lib/data';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useSubscription } from './useSubscription';

export function useFeed() {
  const { workspaceId } = useWorkspace();
  const { data, loading } = useSubscription(workspaceId ? (cb) => backend.subscribeUpdates(workspaceId, cb) : null, [workspaceId]);
  return { updates: data || [], loading };
}

export function useComments(updateId, enabled = true) {
  const { workspaceId } = useWorkspace();
  const { data, loading } = useSubscription(
    workspaceId && updateId && enabled ? (cb) => backend.subscribeComments(workspaceId, updateId, cb) : null,
    [workspaceId, updateId, enabled],
  );
  return { comments: data || [], loading };
}

export function useTickets() {
  const { workspaceId } = useWorkspace();
  const { data, loading } = useSubscription(workspaceId ? (cb) => backend.subscribeTickets(workspaceId, cb) : null, [workspaceId]);
  return { tickets: data || [], loading };
}

export function useWebhookLogs(enabled = true) {
  const { workspaceId } = useWorkspace();
  const { data, loading } = useSubscription(
    workspaceId && enabled ? (cb) => backend.subscribeWebhookLogs(workspaceId, cb) : null,
    [workspaceId, enabled],
  );
  return { logs: data || [], loading };
}
