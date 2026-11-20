import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from './admin.js';
import { signState } from './github.js';
import { translate } from './pipeline.js';
import { normalizeGithubEvent } from './shared/github-events.js';
import { createSampleEvent } from './shared/sample-events.js';
import { ALLOW_SIMULATION, GEMINI_API_KEY, GITHUB_APP_SLUG, STATE_SECRET } from './config.js';

const ID = /^[A-Za-z0-9_-]{1,128}$/;

async function requireMember(request, workspaceId, roles) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  if (typeof workspaceId !== 'string' || !ID.test(workspaceId)) throw new HttpsError('invalid-argument', 'Invalid workspace');
  const ref = db.doc(`workspaces/${workspaceId}`);
  const snap = await ref.get();
  const role = snap.data()?.members?.[request.auth.uid];
  if (!role || (roles && !roles.includes(role))) throw new HttpsError('permission-denied', 'You do not have access to this workspace');
  return { ref, ws: snap.data(), role };
}

const opts = { maxInstances: 10, enforceAppCheck: false };

export const createInstallUrl = onCall({ ...opts, secrets: [STATE_SECRET] }, async (request) => {
  const { workspaceId } = request.data || {};
  await requireMember(request, workspaceId, ['owner']);
  const state = signState({ ws: workspaceId, uid: request.auth.uid }, STATE_SECRET.value());
  return { url: `https://github.com/apps/${GITHUB_APP_SLUG.value()}/installations/new?state=${encodeURIComponent(state)}` };
});

export const selectRepository = onCall(opts, async (request) => {
  const { workspaceId, repoId } = request.data || {};
  const { ref, ws } = await requireMember(request, workspaceId, ['owner']);
  const repo = ws.github?.repos?.find((r) => r.id === repoId);
  if (!repo) throw new HttpsError('not-found', 'Repository is not part of this installation');
  await ref.update({ 'github.selectedRepo': repo, 'github.status': 'connected' });
  return { ok: true };
});

export const disconnectGithub = onCall(opts, async (request) => {
  const { workspaceId } = request.data || {};
  const { ref, ws } = await requireMember(request, workspaceId, ['owner']);
  const batch = db.batch();
  if (ws.github?.installationId) batch.delete(db.doc(`installations/${ws.github.installationId}`));
  batch.update(ref, { github: null });
  await batch.commit();
  return { ok: true };
});

export const joinWorkspace = onCall(opts, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  const code = String(request.data?.inviteCode || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) throw new HttpsError('invalid-argument', 'That invite code is not valid');
  const match = await db.collection('workspaces').where('inviteCode', '==', code).limit(1).get();
  if (match.empty) throw new HttpsError('not-found', 'That invite code is not valid');
  const wsRef = match.docs[0].ref;
  const { uid, token } = request.auth;
  await db.runTransaction(async (tx) => {
    const ws = (await tx.get(wsRef)).data();
    if (!ws.members?.[uid]) {
      tx.update(wsRef, {
        [`members.${uid}`]: 'developer',
        [`profiles.${uid}`]: { name: token.name || 'Developer', photoURL: token.picture || null },
      });
    }
    tx.set(db.doc(`users/${uid}`), { workspaceIds: FieldValue.arrayUnion(wsRef.id) }, { merge: true });
  });
  return { workspaceId: wsRef.id };
});

export const retranslateUpdate = onCall({ ...opts, secrets: [GEMINI_API_KEY], timeoutSeconds: 60 }, async (request) => {
  const { workspaceId, updateId } = request.data || {};
  await requireMember(request, workspaceId);
  if (typeof updateId !== 'string' || !ID.test(updateId)) throw new HttpsError('invalid-argument', 'Invalid update');
  const ref = db.doc(`workspaces/${workspaceId}/updates/${updateId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Update not found');
  const summary = await translate(snap.data());
  await ref.update({ summary });
  return summary;
});

function sanitizePreview(change) {
  const str = (v, max) => String(v ?? '').slice(0, max);
  return {
    kind: 'push',
    repo: str(change?.repo, 140),
    branch: str(change?.branch, 120),
    defaultBranch: str(change?.defaultBranch, 120),
    commits: (Array.isArray(change?.commits) ? change.commits : []).slice(0, 20).map((c) => ({ sha: str(c.sha, 40), message: str(c.message, 2000), author: str(c.author, 80) })),
    pr: null,
    stats: {
      additions: Number(change?.stats?.additions) || 0,
      deletions: Number(change?.stats?.deletions) || 0,
      filesChanged: Number(change?.stats?.filesChanged) || 0,
      files: (change?.stats?.files || []).slice(0, 50).map((f) => str(f, 200)),
    },
    diffExcerpt: change?.diffExcerpt ? str(change.diffExcerpt, 12_000) : undefined,
  };
}

export const translatePreview = onCall({ ...opts, secrets: [GEMINI_API_KEY], timeoutSeconds: 60 }, async (request) => {
  const { workspaceId, change } = request.data || {};
  await requireMember(request, workspaceId);
  const clean = sanitizePreview(change);
  if (!clean.commits.length) throw new HttpsError('invalid-argument', 'Provide at least one commit message');
  return translate(clean);
});

/** Testing aid: queues a realistic fake GitHub delivery through the real translation pipeline. */
export const simulateEvent = onCall(opts, async (request) => {
  if (!ALLOW_SIMULATION.value()) throw new HttpsError('failed-precondition', 'Simulation is disabled. Set ALLOW_SIMULATION=true in functions/.env');
  const { workspaceId } = request.data || {};
  const { ws } = await requireMember(request, workspaceId);
  const repo = ws.github?.selectedRepo;
  if (!repo) throw new HttpsError('failed-precondition', 'Connect a GitHub repository first');
  const { event, payload } = createSampleEvent(repo);
  const { change } = normalizeGithubEvent(event, payload);
  change.stats.additions ??= 10 + Math.floor(Math.random() * 200);
  change.stats.deletions ??= Math.floor(Math.random() * 60);
  const deliveryId = `sim-${crypto.randomUUID()}`;
  await db.doc(`workspaces/${workspaceId}/webhookLogs/${deliveryId}`).create({
    event,
    action: payload.action || null,
    deliveryId,
    repo: repo.fullName,
    status: 'queued',
    message: 'Simulated delivery · queued for AI translation',
    installationId: null,
    change,
    receivedAt: FieldValue.serverTimestamp(),
  });
  return { deliveryId };
});
