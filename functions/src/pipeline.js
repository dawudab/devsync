import { logger } from 'firebase-functions';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { db } from './admin.js';
import { buildUpdateDoc } from './shared/github-events.js';
import { heuristicTranslate } from './shared/translator-core.js';
import { createGitHubApp } from './github.js';
import { translateChange } from './translator.js';
import { AI_INCLUDE_DIFFS, GEMINI_API_KEY, GEMINI_MODEL, GITHUB_APP_ID, GITHUB_PRIVATE_KEY } from './config.js';

const SKIP_DIFF = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|.*\.min\.(js|css)|.*\.(png|jpe?g|gif|svg|ico|woff2?|pdf))$/i;

function diffExcerpt(files, max = 12_000) {
  let out = '';
  for (const f of files) {
    if (SKIP_DIFF.test(f.filename) || !f.patch) continue;
    const chunk = `--- ${f.filename} (${f.status}, +${f.additions} -${f.deletions})\n${f.patch.slice(0, 2500)}\n`;
    if (out.length + chunk.length > max) break;
    out += chunk;
  }
  return out;
}

/** Adds accurate stats and a diff excerpt using a short-lived installation token. Best-effort. */
export async function enrichChange(change, installationId) {
  if (!installationId) return change;
  try {
    const github = createGitHubApp({ appId: GITHUB_APP_ID.value(), privateKey: GITHUB_PRIVATE_KEY.value() });
    const repoPath = `/repos/${change.repo}`;
    let files;
    if (change.kind === 'push') {
      const data = await github.request(installationId, change.before ? `${repoPath}/compare/${change.before}...${change.after}` : `${repoPath}/commits/${change.after}`);
      files = data.files || [];
      change.stats = {
        additions: files.reduce((n, f) => n + f.additions, 0),
        deletions: files.reduce((n, f) => n + f.deletions, 0),
        filesChanged: files.length,
        files: files.map((f) => f.filename).slice(0, 100),
      };
    } else {
      files = await github.request(installationId, `${repoPath}/pulls/${change.pr.number}/files?per_page=100`);
      change.stats.files = files.map((f) => f.filename).slice(0, 100);
    }
    if (AI_INCLUDE_DIFFS.value()) change.diffExcerpt = diffExcerpt(files);
  } catch (err) {
    logger.warn('Could not enrich change with GitHub data', { repo: change.repo, error: err.message });
  }
  return change;
}

export function translate(change) {
  return translateChange(change, { apiKey: GEMINI_API_KEY.value(), model: GEMINI_MODEL.value() });
}

/**
 * Fetches the latest commits from a newly connected GitHub repository and populates the workspace feed
 * immediately so the feed is never empty after connecting a repository.
 */
export async function backfillRepositoryActivity(workspaceId, installationId, repo) {
  if (!workspaceId || !installationId || !repo?.fullName) return { imported: 0 };
  try {
    const github = createGitHubApp({ appId: GITHUB_APP_ID.value(), privateKey: GITHUB_PRIVATE_KEY.value() });
    const commits = await github.request(installationId, `/repos/${repo.fullName}/commits?per_page=5`);
    if (!Array.isArray(commits) || commits.length === 0) return { imported: 0 };

    const wsRef = db.doc(`workspaces/${workspaceId}`);
    const batch = db.batch();
    let imported = 0;

    for (const item of commits.slice(0, 5)) {
      const sha = item?.sha;
      if (!sha) continue;
      const deliveryId = `backfill-${repo.id}-${sha.slice(0, 12)}`;
      const message = item.commit?.message || 'Code update';
      const authorLogin = item.author?.login || item.commit?.author?.name || 'developer';
      const avatarUrl = item.author?.avatar_url || null;
      const committedIso = item.commit?.author?.date || item.commit?.committer?.date || new Date().toISOString();
      const committedMs = Date.parse(committedIso) || Date.now();

      const change = {
        kind: 'push',
        repo: repo.fullName,
        branch: repo.defaultBranch || 'main',
        defaultBranch: repo.defaultBranch || 'main',
        before: item.parents?.[0]?.sha || null,
        after: sha,
        compareUrl: item.html_url || null,
        actor: { login: authorLogin, avatarUrl },
        commits: [
          {
            sha,
            message,
            author: authorLogin,
            url: item.html_url || null,
            timestamp: committedIso,
          },
        ],
        pr: null,
        stats: { additions: null, deletions: null, filesChanged: 1, files: [] },
        pushedAt: committedIso,
      };

      const summary = heuristicTranslate(change);
      const updateRef = wsRef.collection('updates').doc(deliveryId);
      batch.set(
        updateRef,
        {
          ...buildUpdateDoc(change, summary, { deliveryId }),
          approvalStatus: 'pending',
          createdAt: Timestamp.fromMillis(committedMs),
        },
        { merge: true },
      );

      // Also queue in webhookLogs so processWebhookLog can enrich diff stats and translate via Gemini
      const logRef = wsRef.collection('webhookLogs').doc(deliveryId);
      batch.set(
        logRef,
        {
          event: 'push',
          action: 'backfill',
          deliveryId,
          repo: repo.fullName,
          status: 'queued',
          message: `Initial sync · ${message.split('\n')[0].slice(0, 80)}`,
          installationId,
          change,
          createdAtMs: committedMs,
          receivedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      imported++;
    }

    if (imported > 0) await batch.commit();
    return { imported };
  } catch (err) {
    logger.warn('Initial repository backfill failed', { workspaceId, repo: repo?.fullName, error: err.message });
    return { imported: 0, error: err.message };
  }
}

/**
 * Webhook deliveries are acknowledged immediately and queued as webhookLogs docs.
 * This trigger does the slow work (GitHub API + Gemini) and writes the feed update.
 * The update doc ID is the GitHub delivery ID, so retried deliveries are idempotent.
 */
export const processWebhookLog = onDocumentCreated(
  { document: 'workspaces/{workspaceId}/webhookLogs/{logId}', secrets: [GITHUB_PRIVATE_KEY, GEMINI_API_KEY], timeoutSeconds: 120, retry: false },
  async (event) => {
    const log = event.data?.data();
    if (!log || log.status !== 'queued' || !log.change) return;
    const { workspaceId } = event.params;
    const started = Date.now();
    const logRef = event.data.ref;
    try {
      const change = await enrichChange(log.change, log.installationId);
      const summary = await translate(change);
      const updateRef = db.doc(`workspaces/${workspaceId}/updates/${log.deliveryId}`);
      const createdAt = log.createdAtMs ? Timestamp.fromMillis(log.createdAtMs) : FieldValue.serverTimestamp();
      await updateRef.set(
        {
          ...buildUpdateDoc(change, summary, { deliveryId: log.deliveryId }),
          approvalStatus: 'pending',
          createdAt,
        },
        { merge: true },
      );
      await logRef.update({
        status: 'processed',
        message: `Translated ${change.commits.length} commit(s) on ${change.branch} via ${summary.source}`,
        durationMs: Date.now() - started,
        change: FieldValue.delete(),
      });
    } catch (err) {
      const duplicate = err.code === 6;
      if (!duplicate) logger.error('Failed to process webhook', { workspaceId, deliveryId: log.deliveryId, error: err.message });
      await logRef.update({
        status: duplicate ? 'ignored' : 'error',
        message: duplicate ? 'Duplicate delivery (already processed)' : `Processing failed: ${err.message}`.slice(0, 300),
        durationMs: Date.now() - started,
        change: FieldValue.delete(),
      });
    }
  },
);
