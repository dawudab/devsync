import { logger } from 'firebase-functions';
import { onRequest } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from './admin.js';
import { createGitHubApp, exchangeOAuthCode, userCanAccessInstallation, verifyState } from './github.js';
import { APP_URL, GITHUB_APP_ID, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, GITHUB_PRIVATE_KEY, STATE_SECRET } from './config.js';

class SetupError extends Error {
  constructor(reason) {
    super(reason);
    this.reason = reason;
  }
}

/**
 * GET /api/github/setup  (GitHub App "Callback URL", with "Request user authorization during installation" enabled)
 *
 * Query: installation_id, setup_action, state, code
 * 1. `state` must be a valid, unexpired HMAC token issued by createInstallUrl (binds workspace + DevSync user).
 * 2. The OAuth `code` is exchanged for a user token to prove the installing GitHub user can access this
 *    installation — prevents linking someone else's installation ID to your workspace.
 * 3. The installation is verified with an App JWT and its repositories are listed with a short-lived token.
 * Tokens are never persisted; only repository metadata and the installation → workspace mapping are stored.
 */
export const githubSetup = onRequest({ secrets: [GITHUB_PRIVATE_KEY, GITHUB_CLIENT_SECRET, STATE_SECRET], maxInstances: 10 }, async (req, res) => {
  const appUrl = APP_URL.value().replace(/\/$/, '');
  const redirect = (query) => res.redirect(303, `${appUrl}/settings?${new URLSearchParams(query)}`);

  try {
    const { installation_id: installationIdRaw, state: stateToken, code, setup_action: setupAction } = req.query;
    const state = verifyState(stateToken, STATE_SECRET.value());
    if (!state?.ws || !state?.uid) throw new SetupError('state');
    if (setupAction === 'request') return redirect({ github: 'error', reason: 'installation' });
    const installationId = Number(installationIdRaw);
    if (!Number.isSafeInteger(installationId) || installationId <= 0) throw new SetupError('installation');
    if (typeof code !== 'string' || !code) throw new SetupError('oauth');

    const userToken = await exchangeOAuthCode({ clientId: GITHUB_CLIENT_ID.value(), clientSecret: GITHUB_CLIENT_SECRET.value(), code });
    if (!(await userCanAccessInstallation(userToken, installationId))) throw new SetupError('forbidden');

    const github = createGitHubApp({ appId: GITHUB_APP_ID.value(), privateKey: GITHUB_PRIVATE_KEY.value() });
    const installation = await github.getInstallation(installationId).catch(() => {
      throw new SetupError('installation');
    });
    const repos = await github.listInstallationRepos(installationId);

    const wsRef = db.doc(`workspaces/${state.ws}`);
    const linkRef = db.doc(`installations/${installationId}`);
    await db.runTransaction(async (tx) => {
      const [wsSnap, linkSnap] = await Promise.all([tx.get(wsRef), tx.get(linkRef)]);
      if (wsSnap.data()?.members?.[state.uid] !== 'owner') throw new SetupError('forbidden');
      if (linkSnap.exists && linkSnap.data().workspaceId !== state.ws) throw new SetupError('taken');

      const previous = wsSnap.data().github?.installationId;
      if (previous && String(previous) !== String(installationId)) tx.delete(db.doc(`installations/${previous}`));

      tx.set(linkRef, { workspaceId: state.ws, account: installation.account?.login || null, linkedBy: state.uid, linkedAt: FieldValue.serverTimestamp() });
      tx.update(wsRef, {
        github: {
          installationId,
          account: { login: installation.account?.login || null, type: installation.account?.type || null },
          repos,
          selectedRepo: repos.length === 1 ? repos[0] : null,
          status: repos.length === 1 ? 'connected' : 'pending_selection',
          connectedAt: FieldValue.serverTimestamp(),
        },
      });
      tx.set(wsRef.collection('webhookLogs').doc(), {
        event: 'installation',
        action: 'linked',
        deliveryId: `setup-${installationId}`,
        status: 'processed',
        message: `GitHub App linked on ${installation.account?.login} with access to ${repos.length} repositories`,
        repo: null,
        receivedAt: FieldValue.serverTimestamp(),
      });
    });

    return redirect({ github: 'connected' });
  } catch (err) {
    const reason = err instanceof SetupError ? err.reason : 'installation';
    logger.warn('GitHub setup failed', { reason, error: err.message });
    return redirect({ github: 'error', reason });
  }
});
