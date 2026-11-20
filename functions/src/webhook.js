import { logger } from 'firebase-functions';
import { onRequest } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from './admin.js';
import { normalizeGithubEvent } from './shared/github-events.js';
import { createGitHubApp, verifyWebhookSignature } from './github.js';
import { filterAvailableRepos } from './repoLock.js';
import { GITHUB_APP_ID, GITHUB_PRIVATE_KEY, GITHUB_WEBHOOK_SECRET } from './config.js';

async function refreshRepos(workspaceId, installationId) {
  const github = createGitHubApp({ appId: GITHUB_APP_ID.value(), privateKey: GITHUB_PRIVATE_KEY.value() });
  const allRepos = await github.listInstallationRepos(installationId);
  const availableRepos = await filterAvailableRepos(allRepos, workspaceId);
  const wsRef = db.doc(`workspaces/${workspaceId}`);
  await db.runTransaction(async (tx) => {
    const gh = (await tx.get(wsRef)).data()?.github;
    if (!gh || String(gh.installationId) !== String(installationId)) return;
    const selectedRepo = availableRepos.find((r) => String(r.id) === String(gh.selectedRepo?.id)) || null;
    tx.update(wsRef, {
      'github.repos': selectedRepo ? [selectedRepo] : availableRepos,
      'github.selectedRepo': selectedRepo,
      'github.status': selectedRepo ? gh.status : 'pending_selection',
    });
  });
}

async function handleInstallationLifecycle(event, payload, workspaceId, installationId) {
  const wsRef = db.doc(`workspaces/${workspaceId}`);
  if (event === 'installation') {
    if (payload.action === 'deleted') {
      const ws = (await wsRef.get()).data();
      const batch = db.batch();
      batch.delete(db.doc(`installations/${installationId}`));
      if (ws?.github?.selectedRepo?.id) {
        batch.delete(db.doc(`repoLinks/${ws.github.selectedRepo.id}`));
      }
      batch.update(wsRef, { 'github.status': 'removed', 'github.selectedRepo': null });
      await batch.commit();
      return 'Installation removed on GitHub — workspace unlinked';
    }
    if (payload.action === 'suspend' || payload.action === 'unsuspend') {
      await wsRef.update({ 'github.status': payload.action === 'suspend' ? 'suspended' : 'connected' });
      return `Installation ${payload.action}ed`;
    }
    return `installation.${payload.action} acknowledged`;
  }
  await refreshRepos(workspaceId, installationId);
  return `Repository access updated (${payload.repositories_added?.length || 0} added, ${payload.repositories_removed?.length || 0} removed)`;
}

/**
 * POST /api/github/webhook
 * Verifies the HMAC signature against the raw body, routes repository events via `repoLinks/{repoId}`
 * (1 repo = 1 business workspace), and queues push / pull_request deliveries for AI translation.
 */
export const githubWebhook = onRequest(
  { secrets: [GITHUB_WEBHOOK_SECRET, GITHUB_PRIVATE_KEY], maxInstances: 20, timeoutSeconds: 30 },
  async (req, res) => {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const event = req.get('x-github-event');
    const deliveryId = req.get('x-github-delivery');
    if (!verifyWebhookSignature(req.rawBody, req.get('x-hub-signature-256'), GITHUB_WEBHOOK_SECRET.value())) {
      logger.warn('Rejected webhook with invalid signature', { event, deliveryId });
      return res.status(401).send('Invalid signature');
    }
    if (!event || !/^[\w-]{8,64}$/.test(deliveryId || '')) return res.status(400).send('Missing GitHub headers');
    if (event === 'ping') return res.status(200).json({ ok: true });

    const payload = req.body || {};
    const installationId = payload.installation?.id;
    if (!installationId) return res.status(202).json({ ignored: 'No installation on payload' });

    try {
      if (event === 'installation' || event === 'installation_repositories') {
        const wsQuery = await db.collection('workspaces').where('github.installationId', '==', installationId).get();
        const wsIds = wsQuery.docs.map((d) => d.id);
        if (!wsIds.length) {
          const link = await db.doc(`installations/${installationId}`).get();
          if (link.exists && link.data()?.workspaceId) wsIds.push(link.data().workspaceId);
        }
        if (!wsIds.length) return res.status(202).json({ ignored: 'Installation is not linked to any workspace' });
        for (const wsId of wsIds) {
          const message = await handleInstallationLifecycle(event, payload, wsId, installationId);
          await db.collection(`workspaces/${wsId}/webhookLogs`).add({
            event,
            action: payload.action || null,
            deliveryId,
            repo: null,
            receivedAt: FieldValue.serverTimestamp(),
            status: 'processed',
            message,
          });
        }
        return res.status(200).json({ ok: true });
      }

      // Route push / pull_request strictly to the single workspace that locked this repository
      const repoId = payload.repository?.id;
      let workspaceId = null;
      if (repoId) {
        const repoLink = await db.doc(`repoLinks/${repoId}`).get();
        if (repoLink.exists) workspaceId = repoLink.data()?.workspaceId || null;
      }
      if (!workspaceId) {
        const link = await db.doc(`installations/${installationId}`).get();
        if (link.exists) workspaceId = link.data()?.workspaceId || null;
      }
      if (!workspaceId) return res.status(202).json({ ignored: 'Repository is not linked to a workspace' });

      const logs = db.collection(`workspaces/${workspaceId}/webhookLogs`);
      const base = { event, action: payload.action || null, deliveryId, repo: payload.repository?.full_name || null, receivedAt: FieldValue.serverTimestamp() };

      const ws = (await db.doc(`workspaces/${workspaceId}`).get()).data();
      const selected = ws?.github?.selectedRepo;
      if (!selected || String(repoId) !== String(selected.id)) {
        await logs.add({ ...base, status: 'ignored', message: 'Delivery is for a repository this workspace does not follow' });
        return res.status(202).json({ ignored: 'Repository not selected' });
      }

      const { change, skipReason } = normalizeGithubEvent(event, payload);
      if (!change) {
        await logs.add({ ...base, status: 'ignored', message: skipReason });
        return res.status(202).json({ ignored: skipReason });
      }

      await logs.doc(deliveryId).create({ ...base, status: 'queued', message: 'Signature verified · queued for AI translation', installationId, change });
      return res.status(202).json({ queued: true });
    } catch (err) {
      if (err.code === 6) return res.status(200).json({ duplicate: true });
      logger.error('Webhook handling failed', { event, deliveryId, error: err.message });
      return res.status(500).send('Internal error');
    }
  },
);
