import { useState } from 'react';
import { AlertTriangle, Trash2, CheckCircle2, XCircle } from 'lucide-react';
import { backend } from '@/lib/data';
import { useAuth } from '@/context/AuthContext';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useToast } from '@/context/ToastContext';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { timeAgo } from '@/lib/utils';

export function DeleteProjectSheet({ open, onClose }) {
  const { user } = useAuth();
  const { workspace, workspaceId, isOwner, isDeveloper, author } = useWorkspace();
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const hasOwner = Boolean(workspace?.ownerId) || Object.values(workspace?.members || {}).includes('owner');
  const needsOwnerApproval = isDeveloper && hasOwner && !isOwner;

  const confirmDelete = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (needsOwnerApproval) {
        await backend.requestWorkspaceDeletion(workspaceId, reason, author);
        toast.success('Deletion request sent to the Business Owner for approval');
      } else {
        await backend.deleteWorkspace(workspaceId, user.uid);
        toast.success('Project permanently deleted');
      }
      setReason('');
      onClose();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={needsOwnerApproval ? 'Request project deletion' : `Delete ${workspace?.name || 'project'}?`}
      subtitle={
        needsOwnerApproval
          ? 'This project has an active Business Owner, so their approval is required before it can be deleted.'
          : 'This will permanently delete the workspace, updates, milestones, and requests. This cannot be undone.'
      }
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" size="lg" className="flex-1" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form="delete-project-form" variant="danger" size="lg" className="flex-1" icon={Trash2} loading={busy}>
            {needsOwnerApproval ? 'Request Deletion' : 'Yes, Delete Project'}
          </Button>
        </div>
      }
    >
      <form id="delete-project-form" onSubmit={confirmDelete} className="space-y-4">
        <div className="flex items-start gap-3 rounded-2xl bg-rose-50 p-3.5 text-sm text-rose-800 ring-1 ring-inset ring-rose-200">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
          <p>
            {needsOwnerApproval
              ? 'Once submitted, the Business Owner will see a prompt to either Approve & Permanently Delete or Reject your request.'
              : `You are about to permanently delete "${workspace?.name}". All workspace data will be removed.`}
          </p>
        </div>

        {needsOwnerApproval && (
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink-700">Reason for deletion (optional)</span>
            <textarea
              rows={3}
              maxLength={300}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Duplicate test project or project completed"
              className="w-full resize-none rounded-xl border-0 bg-ink-50 px-4 py-3 text-sm text-ink-900 ring-1 ring-inset ring-ink-200 placeholder:text-ink-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </label>
        )}
      </form>
    </Sheet>
  );
}

export function DeletionRequestBanner() {
  const { workspace, workspaceId, isOwner, isDeveloper } = useWorkspace();
  const toast = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const req = workspace?.deletionRequest;

  if (!req) return null;

  if (req.status === 'pending' && isOwner) {
    const reject = async () => {
      setBusy(true);
      try {
        await backend.resolveDeletionRequest(workspaceId, 'rejected');
        toast.success('Deletion request rejected');
      } catch (err) {
        toast.error(err);
      } finally {
        setBusy(false);
      }
    };

    return (
      <>
        <section className="rounded-3xl bg-rose-50 p-4 ring-1 ring-inset ring-rose-200 sm:p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold text-rose-900">Developer requested to delete this project</h3>
              <p className="mt-0.5 text-xs text-rose-700">
                Requested by {req.requestedBy?.name || 'Developer'} {req.requestedAt ? `· ${timeAgo(req.requestedAt)}` : ''}
              </p>
              {req.reason && <p className="mt-2 rounded-xl bg-white/80 px-3 py-2 text-xs text-rose-900 ring-1 ring-rose-200">“{req.reason}”</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="danger" icon={CheckCircle2} onClick={() => setConfirmOpen(true)} disabled={busy}>
                  Approve &amp; Permanently Delete
                </Button>
                <Button size="sm" variant="secondary" icon={XCircle} loading={busy} onClick={reject}>
                  Reject Deletion Request
                </Button>
              </div>
            </div>
          </div>
        </section>
        <DeleteProjectSheet open={confirmOpen} onClose={() => setConfirmOpen(false)} />
      </>
    );
  }

  if (req.status === 'pending' && isDeveloper) {
    return (
      <section className="rounded-2xl bg-amber-50 p-3.5 text-xs text-amber-900 ring-1 ring-inset ring-amber-200">
        <span className="font-semibold">Pending Owner Approval:</span> Your request to delete this project is waiting for the Business Owner’s review.
      </section>
    );
  }

  if (req.status === 'rejected' && isDeveloper) {
    return (
      <section className="flex items-center justify-between gap-2 rounded-2xl bg-ink-100 p-3.5 text-xs text-ink-700">
        <span>The Business Owner rejected your project deletion request.</span>
        <button
          onClick={() => backend.resolveDeletionRequest(workspaceId, 'clear').catch(toast.error)}
          className="font-semibold text-ink-900 hover:underline"
        >
          Dismiss
        </button>
      </section>
    );
  }

  return null;
}
