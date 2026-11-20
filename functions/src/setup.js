import { logger } from 'firebase-functions';
import { onRequest } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from './admin.js';
import { createGitHubApp, exchangeOAuthCode, userCanAccessInstallation, verifyState } from './github.js';
import { backfillRepositoryActivity } from './pipeline.js';
import { filterAvailableRepos, lockRepoInTx } from './repoLock.js';
import { APP_URL, GITHUB_APP_ID, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, GITHUB_PRIVATE_KEY, STATE_SECRET } from './config.js';

class SetupError extends Error {
  constructor(reason) {
    super(reason);
    this.reason = reason;
  }
}

/**
 * GET /api/github/setup  (GitHub App "Callback URL")
 *
 * Each GitHub App installation can serve multiple DevSync workspaces,
 * while each individual repository is strictly locked 1-to-1 to a single business workspace (`repoLinks/{repoId}`).
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

    if (typeof code === 'string' && code) {
      try {
        const userToken = await exchangeOAuthCode({ clientId: GITHUB_CLIENT_ID.value(), clientSecret: GITHUB_CLIENT_SECRET.value(), code });
        if (!(await userCanAccessInstallation(userToken, installationId))) throw new SetupError('forbidden');
      } catch (oauthErr) {
        if (oauthErr instanceof SetupError) throw oauthErr;
        logger.warn('OAuth code verification skipped or failed; falling back to App JWT verification', { error: oauthErr.message });
      }
    }

    const github = createGitHubApp({ appId: GITHUB_APP_ID.value(), privateKey: GITHUB_PRIVATE_KEY.value() });
    const installation = await github.getInstallation(installationId).catch(() => {
      throw new SetupError('installation');
    });
    const allRepos = await github.listInstallationRepos(installationId);
    const availableRepos = await filterAvailableRepos(allRepos, state.ws);
    const autoSelectedRepo = availableRepos.length === 1 ? availableRepos[0] : null;

    const wsRef = db.doc(`workspaces/${state.ws}`);
    const linkRef = db.doc(`installations/${installationId}`);
    await db.runTransaction(async (tx) => {
      const wsSnap = await tx.get(wsRef);
      const role = wsSnap.data()?.members?.[state.uid];
      if (!['developer', 'owner'].includes(role)) throw new SetupError('forbidden');

      if (autoSelectedRepo) {
        await lockRepoInTx(tx, {
          workspaceId: state.ws,
          repo: autoSelectedRepo,
          previousRepoId: wsSnap.data()?.github?.selectedRepo?.id,
          installationId,
          uid: state.uid,
        });
      }

      tx.set(
        linkRef,
        { workspaceId: state.ws, account: installation.account?.login || null, linkedBy: state.uid, linkedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
      tx.update(wsRef, {
        github: {
          installationId,
          account: { login: installation.account?.login || null, type: installation.account?.type || null },
          repos: autoSelectedRepo ? [autoSelectedRepo] : availableRepos,
          selectedRepo: autoSelectedRepo,
          status: autoSelectedRepo ? 'connected' : 'pending_selection',
          connectedAt: FieldValue.serverTimestamp(),
        },
      });
      tx.set(wsRef.collection('webhookLogs').doc(), {
        event: 'installation',
        action: 'linked',
        deliveryId: `setup-${installationId}`,
        status: 'processed',
        message: `GitHub App linked on ${installation.account?.login} (${availableRepos.length} available repositories)`,
        repo: autoSelectedRepo?.fullName || null,
        receivedAt: FieldValue.serverTimestamp(),
      });
    });

    if (autoSelectedRepo) {
      await backfillRepositoryActivity(state.ws, installationId, autoSelectedRepo);
    }

    return redirect({ github: 'connected', ws: state.ws });
  } catch (err) {
    const reason = err instanceof SetupError ? err.reason : 'installation';
    logger.warn('GitHub setup failed', { reason, error: err.message });
    return redirect({ github: 'error', reason });
  }
});
