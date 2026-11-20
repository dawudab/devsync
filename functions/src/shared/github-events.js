/**
 * Normalizes raw GitHub webhook payloads into DevSync "changes" and feed update documents.
 * Pure module shared by the web app (Demo Mode) and Cloud Functions.
 */

export const SUPPORTED_EVENTS = ['push', 'pull_request', 'installation', 'installation_repositories', 'ping'];

const ZERO_SHA = /^0+$/;

/**
 * @returns {{ change: object|null, skipReason: string|null }}
 */
export function normalizeGithubEvent(event, payload) {
  if (event === 'push') return normalizePush(payload);
  if (event === 'pull_request') return normalizePullRequest(payload);
  return { change: null, skipReason: `Event "${event}" does not produce feed updates` };
}

function normalizePush(p) {
  if (!p?.ref?.startsWith('refs/heads/')) return skip('Tag or non-branch push');
  if (p.deleted) return skip('Branch deleted');
  const commits = (p.commits || []).filter((c) => c.distinct !== false);
  if (!commits.length) return skip('Push contained no new commits');
  const files = new Set();
  for (const c of commits) for (const f of [...(c.added || []), ...(c.removed || []), ...(c.modified || [])]) files.add(f);
  return {
    skipReason: null,
    change: {
      kind: 'push',
      repo: p.repository?.full_name,
      repoId: p.repository?.id,
      repoUrl: p.repository?.html_url,
      branch: p.ref.replace('refs/heads/', ''),
      defaultBranch: p.repository?.default_branch || 'main',
      before: ZERO_SHA.test(p.before || '') ? null : p.before,
      after: p.after,
      compareUrl: p.compare,
      forced: Boolean(p.forced),
      actor: actorOf(p),
      commits: commits.map((c) => ({
        sha: c.id,
        message: c.message,
        author: c.author?.username || c.author?.name || 'unknown',
        url: c.url,
        timestamp: c.timestamp,
      })),
      pr: null,
      stats: { additions: null, deletions: null, filesChanged: files.size, files: [...files].slice(0, 100) },
    },
  };
}

function normalizePullRequest(p) {
  const pr = p.pull_request;
  if (!pr) return skip('Missing pull_request');
  let kind = null;
  if (['opened', 'reopened', 'ready_for_review'].includes(p.action) && !pr.draft) kind = 'pull_request_opened';
  if (p.action === 'closed' && pr.merged) kind = 'pull_request_merged';
  if (!kind) return skip(`Pull request action "${p.action}" ignored`);
  return {
    skipReason: null,
    change: {
      kind,
      repo: p.repository?.full_name,
      repoId: p.repository?.id,
      repoUrl: p.repository?.html_url,
      branch: kind === 'pull_request_merged' ? pr.base?.ref : pr.head?.ref,
      defaultBranch: p.repository?.default_branch || 'main',
      before: pr.base?.sha,
      after: kind === 'pull_request_merged' ? pr.merge_commit_sha : pr.head?.sha,
      compareUrl: pr.html_url,
      actor: actorOf(p),
      commits: [
        {
          sha: kind === 'pull_request_merged' ? pr.merge_commit_sha : pr.head?.sha,
          message: pr.title,
          author: pr.user?.login || 'unknown',
          url: pr.html_url,
          timestamp: pr.merged_at || pr.updated_at || pr.created_at,
        },
      ],
      pr: {
        number: pr.number,
        title: pr.title,
        body: (pr.body || '').slice(0, 4000),
        url: pr.html_url,
        baseBranch: pr.base?.ref,
        headBranch: pr.head?.ref,
        commitsCount: pr.commits ?? null,
      },
      stats: {
        additions: pr.additions ?? null,
        deletions: pr.deletions ?? null,
        filesChanged: pr.changed_files ?? null,
        files: [],
      },
    },
  };
}

function actorOf(p) {
  return { login: p.sender?.login || 'unknown', avatarUrl: p.sender?.avatar_url || null };
}

function skip(reason) {
  return { change: null, skipReason: reason };
}

/** Shape stored at workspaces/{id}/updates/{updateId}. `createdAt` is set by the backend. */
export function buildUpdateDoc(change, summary, { deliveryId = null } = {}) {
  const { diffExcerpt: _omit, ...rest } = change;
  return {
    ...rest,
    summary,
    deliveryId,
    reactions: {},
    commentCount: 0,
  };
}
