import { useCallback, useState } from 'react';
import { backend } from '@/lib/data';
import { useWorkspace } from '@/context/WorkspaceContext';

/**
 * AI translation hook.
 * - `preview(message)` translates an arbitrary commit message / diff (playground).
 * - `regenerate(updateId)` re-runs translation for a stored feed update.
 * In Firebase mode both call Cloud Functions (Gemini, with heuristic fallback); in Demo Mode
 * the shared heuristic translator runs locally.
 */
export function useAITranslator() {
  const { workspaceId, workspace } = useWorkspace();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  const run = useCallback(async (fn) => {
    setPending(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(e);
      throw e;
    } finally {
      setPending(false);
    }
  }, []);

  const preview = useCallback(
    (message, { diff = '', branch } = {}) => {
      const defaultBranch = workspace?.github?.selectedRepo?.defaultBranch || 'main';
      const lines = diff.split('\n');
      const files = [...new Set(lines.filter((l) => l.startsWith('+++ b/')).map((l) => l.slice(6)))];
      const change = {
        kind: 'push',
        repo: workspace?.github?.selectedRepo?.fullName || 'playground',
        branch: branch || defaultBranch,
        defaultBranch,
        commits: message
          .split(/\n{2,}/)
          .map((m) => m.trim())
          .filter(Boolean)
          .map((m, i) => ({ sha: `preview${i}`, message: m, author: 'you' })),
        pr: null,
        stats: {
          additions: lines.filter((l) => l.startsWith('+') && !l.startsWith('+++')).length,
          deletions: lines.filter((l) => l.startsWith('-') && !l.startsWith('---')).length,
          filesChanged: files.length,
          files,
        },
        diffExcerpt: diff || undefined,
      };
      return run(() => backend.translatePreview(workspaceId, change));
    },
    [run, workspaceId, workspace],
  );

  const regenerate = useCallback((updateId) => run(() => backend.retranslateUpdate(workspaceId, updateId)), [run, workspaceId]);

  return { preview, regenerate, pending, error };
}
