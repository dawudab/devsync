import { HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from './admin.js';

/**
 * Filters a list of GitHub repositories to exclude any repo already locked to another workspace.
 */
export async function filterAvailableRepos(repos, workspaceId) {
  if (!Array.isArray(repos) || repos.length === 0) return [];
  const refs = repos.map((r) => db.doc(`repoLinks/${r.id}`));
  const snaps = await db.getAll(...refs);
  return repos.filter((_, idx) => {
    const snap = snaps[idx];
    return !snap.exists || snap.data()?.workspaceId === workspaceId;
  });
}

/**
 * Atomically locks `repo.id` to `workspaceId` inside a Firestore transaction,
 * releasing `previousRepoId` if the workspace is switching repositories.
 */
export async function lockRepoInTx(tx, { workspaceId, repo, previousRepoId, installationId, uid }) {
  const newRef = db.doc(`repoLinks/${repo.id}`);
  const newSnap = await tx.get(newRef);
  if (newSnap.exists && newSnap.data()?.workspaceId !== workspaceId) {
    throw new HttpsError('already-exists', 'This repository is already locked to another business workspace');
  }
  if (previousRepoId && String(previousRepoId) !== String(repo.id)) {
    const oldRef = db.doc(`repoLinks/${previousRepoId}`);
    const oldSnap = await tx.get(oldRef);
    if (oldSnap.exists && oldSnap.data()?.workspaceId === workspaceId) {
      tx.delete(oldRef);
    }
  }
  tx.set(newRef, {
    workspaceId,
    fullName: repo.fullName,
    installationId: installationId || null,
    linkedBy: uid,
    linkedAt: FieldValue.serverTimestamp(),
  });
}
