import {
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
  signInWithRedirect,
  signOut as fbSignOut,
  updateProfile,
} from 'firebase/auth';
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  FieldPath,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getFirebase } from '@/config/firebase';
import { generateInviteCode, generateShortInviteCode } from './ids';

function toPlain(snap) {
  const data = snap.data({ serverTimestamps: 'estimate' });
  const out = { id: snap.id, ...data };
  for (const key of ['createdAt', 'updatedAt', 'receivedAt', 'connectedAt', 'approvedAt', 'loggedAt', 'joinedAt']) {
    if (data?.[key]?.toMillis) out[key] = data[key].toMillis();
  }
  if (data?.github?.connectedAt?.toMillis) out.github = { ...data.github, connectedAt: data.github.connectedAt.toMillis() };
  return out;
}

function listen(q, cb, onError) {
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map(toPlain)),
    (err) => {
      console.error('[DevSync] Firestore listener error', err);
      onError?.(err);
      cb([]);
    },
  );
}

export function createFirestoreBackend() {
  const { auth, db, functions } = getFirebase();
  const call = async (name, data) => (await httpsCallable(functions, name)(data)).data;
  const ws = (wsId) => doc(db, 'workspaces', wsId);

  return {
    mode: 'firebase',

    onAuthChange(cb) {
      getRedirectResult(auth).catch(() => {});
      return onAuthStateChanged(auth, (u) =>
        cb(u ? { uid: u.uid, displayName: u.displayName || 'Guest', email: u.email || null, photoURL: u.photoURL, isAnonymous: u.isAnonymous } : null),
      );
    },
    async signInWithGoogle() {
      const provider = new GoogleAuthProvider();
      try {
        await signInWithPopup(auth, provider);
      } catch (err) {
        if (err?.code === 'auth/popup-blocked' || err?.code === 'auth/operation-not-supported-in-this-environment') {
          await signInWithRedirect(auth, provider);
          return;
        }
        throw err;
      }
    },
    async signInAsGuest(name) {
      const cred = await signInAnonymously(auth);
      if (name) await updateProfile(cred.user, { displayName: name });
    },
    signOut: () => fbSignOut(auth),

    async updateUserProfile(user, { displayName, photoURL, title = '', bio = '' }, workspaceIds = []) {
      const cleanName = (displayName || '').trim() || user.displayName || 'Member';
      const cleanPhoto = photoURL === undefined ? user.photoURL || null : photoURL || null;
      if (auth.currentUser) {
        const authPatch = { displayName: cleanName };
        if (!cleanPhoto || cleanPhoto.length <= 1800) authPatch.photoURL = cleanPhoto;
        await updateProfile(auth.currentUser, authPatch);
      }
      const profileEntry = {
        name: cleanName,
        photoURL: cleanPhoto,
        title: (title || '').trim(),
        bio: (bio || '').trim(),
      };
      await Promise.all(
        workspaceIds.map(async (wsId) => {
          const batch = writeBatch(db);
          batch.update(ws(wsId), { [`profiles.${user.uid}`]: profileEntry });
          batch.set(
            doc(ws(wsId), 'members', user.uid),
            { displayName: cleanName, photoURL: cleanPhoto, title: profileEntry.title, bio: profileEntry.bio },
            { merge: true },
          );
          await batch.commit();
        }),
      );
      return { displayName: cleanName, photoURL: cleanPhoto };
    },

    subscribeMyWorkspaces(uid, cb) {
      let inner = [];
      let graceTimer = null;
      const stopInner = () => {
        clearTimeout(graceTimer);
        inner.forEach((u) => u());
        inner = [];
      };
      const outer = onSnapshot(
        doc(db, 'users', uid),
        (snap) => {
          stopInner();
          const ids = (snap.data()?.workspaceIds || []).slice(0, 50);
          if (!ids.length) return cb([]);
          const results = new Map();
          const emitNow = () => cb(ids.map((id) => results.get(id)).filter(Boolean));
          const emitIfComplete = () => {
            if (results.size === ids.length) {
              clearTimeout(graceTimer);
              emitNow();
            }
          };
          graceTimer = setTimeout(emitNow, 2000);
          inner = ids.map((id) =>
            onSnapshot(
              ws(id),
              (s) => {
                const w = s.data();
                results.set(id, w?.members?.[uid] ? { id, name: w.name, role: w.members[uid] } : null);
                emitIfComplete();
              },
              () => {
                results.set(id, null);
                emitIfComplete();
              },
            ),
          );
        },
        () => cb([]),
      );
      return () => {
        stopInner();
        outer();
      };
    },

    subscribeWorkspace(wsId, cb) {
      return onSnapshot(ws(wsId), (snap) => cb(snap.exists() ? toPlain(snap) : null), () => cb(null));
    },

    async createWorkspace(user, name, creatorRole = 'owner', extras = {}) {
      const role = creatorRole === 'developer' ? 'developer' : 'owner';
      const ref = doc(collection(db, 'workspaces'));
      const batch = writeBatch(db);
      batch.set(ref, {
        name: name.trim(),
        ownerId: role === 'owner' ? user.uid : null,
        members: { [user.uid]: role },
        profiles: { [user.uid]: { name: user.displayName || (role === 'owner' ? 'Owner' : 'Developer'), photoURL: user.photoURL || null } },
        inviteCode: generateInviteCode(),
        ticketCounter: 0,
        github: null,
        businessProfile: extras.businessProfile || { tagline: '', industry: '' },
        workspaceLinks: extras.workspaceLinks || { productionUrl: '', stagingUrl: '', designUrl: '' },
        deletionRequest: null,
        createdAt: serverTimestamp(),
      });
      batch.set(doc(ws(ref.id), 'members', user.uid), {
        role,
        displayName: user.displayName || (role === 'owner' ? 'Owner' : 'Developer'),
        photoURL: user.photoURL || null,
        joinedAt: serverTimestamp(),
      });
      batch.set(doc(db, 'users', user.uid), { workspaceIds: arrayUnion(ref.id) }, { merge: true });
      await batch.commit();
      return ref.id;
    },

    async updateWorkspace(wsId, patch) {
      await updateDoc(ws(wsId), patch);
    },

    async deleteWorkspace(wsId, uid) {
      await deleteDoc(ws(wsId));
      if (uid) {
        await updateDoc(doc(db, 'users', uid), { workspaceIds: arrayRemove(wsId) }).catch(() => {});
      }
    },

    async requestWorkspaceDeletion(wsId, reason, actor) {
      await updateDoc(ws(wsId), {
        deletionRequest: {
          status: 'pending',
          requestedBy: { uid: actor.uid, name: actor.displayName },
          requestedAt: Date.now(),
          reason: (reason || '').trim(),
        },
      });
    },

    async resolveDeletionRequest(wsId, status) {
      await updateDoc(ws(wsId), {
        deletionRequest: status === 'clear' ? null : { status, resolvedAt: Date.now() },
      });
    },

    async joinWorkspace(code) {
      const { workspaceId } = await call('joinWorkspace', { inviteCode: code.trim().toUpperCase() });
      return workspaceId;
    },

    subscribeInvites(wsId, cb) {
      return listen(query(collection(db, 'invites'), where('workspaceId', '==', wsId)), (list) =>
        cb([...list].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))),
      );
    },

    async createInvite(wsId, workspaceName, role, creatorUid) {
      const code = generateShortInviteCode();
      await setDoc(doc(db, 'invites', code), {
        code,
        workspaceId: wsId,
        workspaceName,
        role,
        createdBy: creatorUid,
        usedBy: null,
        createdAt: serverTimestamp(),
      });
      return code;
    },

    async deleteInvite(code) {
      await deleteDoc(doc(db, 'invites', code));
    },

    updateMemberRole: (wsId, targetUid, role) => call('updateMemberRole', { workspaceId: wsId, targetUid, role }),
    removeMember: (wsId, targetUid) => call('removeMember', { workspaceId: wsId, targetUid }),

    subscribeUpdates(wsId, cb) {
      return listen(query(collection(ws(wsId), 'updates'), orderBy('createdAt', 'desc'), limit(100)), cb);
    },

    async toggleReaction(wsId, updateId, emoji, uid, active) {
      await updateDoc(doc(ws(wsId), 'updates', updateId), new FieldPath('reactions', emoji), active ? arrayRemove(uid) : arrayUnion(uid));
    },

    async setUpdateApproval(wsId, updateId, { approvalStatus, approvalNote = null }, author) {
      await updateDoc(doc(ws(wsId), 'updates', updateId), {
        approvalStatus,
        approvalNote: approvalNote || null,
        approvedBy: { uid: author.uid, name: author.displayName },
        approvedAt: serverTimestamp(),
      });
    },

    retranslateUpdate: (wsId, updateId) => call('retranslateUpdate', { workspaceId: wsId, updateId }),
    translatePreview: (wsId, change) => call('translatePreview', { workspaceId: wsId, change }),

    subscribeComments(wsId, updateId, cb) {
      return listen(query(collection(ws(wsId), 'updates', updateId, 'comments'), orderBy('createdAt', 'asc')), cb);
    },

    async addComment(wsId, updateId, { text, parentId = null }, author) {
      const updateRef = doc(ws(wsId), 'updates', updateId);
      const batch = writeBatch(db);
      batch.set(doc(collection(updateRef, 'comments')), {
        text: text.trim(),
        parentId,
        authorId: author.uid,
        authorName: author.displayName,
        authorPhoto: author.photoURL || null,
        authorRole: author.role,
        createdAt: serverTimestamp(),
      });
      batch.update(updateRef, { commentCount: increment(1) });
      await batch.commit();
    },

    subscribeTickets(wsId, cb) {
      return listen(query(collection(ws(wsId), 'tickets'), orderBy('createdAt', 'desc')), cb);
    },

    async createTicket(wsId, { title, description, priority, kind = 'change_request', milestoneId = null }, author) {
      return runTransaction(db, async (tx) => {
        const wsSnap = await tx.get(ws(wsId));
        const number = (wsSnap.data()?.ticketCounter || 0) + 1;
        const ref = doc(collection(ws(wsId), 'tickets'));
        tx.update(ws(wsId), { ticketCounter: number });
        tx.set(ref, {
          number,
          title: title.trim(),
          description: description.trim(),
          priority,
          kind,
          milestoneId: milestoneId || null,
          status: 'todo',
          createdBy: { uid: author.uid, name: author.displayName },
          linkedCommit: null,
          activity: [{ type: 'created', by: author.displayName, at: Date.now() }],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        return ref.id;
      });
    },

    async updateTicket(wsId, ticketId, patch, actor, activityEntry) {
      await updateDoc(doc(ws(wsId), 'tickets', ticketId), {
        ...patch,
        ...(activityEntry ? { activity: arrayUnion({ ...activityEntry, by: actor.displayName, at: Date.now() }) } : {}),
        updatedAt: serverTimestamp(),
      });
    },

    subscribeMilestones(wsId, cb) {
      return listen(query(collection(ws(wsId), 'milestones'), orderBy('order', 'asc')), cb);
    },

    async createMilestone(wsId, { title, description = '', targetDate = null, order = 0 }, uid) {
      const ref = doc(collection(ws(wsId), 'milestones'));
      await setDoc(ref, {
        title: title.trim(),
        description: description.trim(),
        targetDate: targetDate || null,
        order,
        progress: 0,
        status: 'planned',
        linkedUpdateIds: [],
        linkedTicketIds: [],
        createdBy: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return ref.id;
    },

    async updateMilestone(wsId, milestoneId, patch) {
      await updateDoc(doc(ws(wsId), 'milestones', milestoneId), { ...patch, updatedAt: serverTimestamp() });
    },

    async deleteMilestone(wsId, milestoneId) {
      await deleteDoc(doc(ws(wsId), 'milestones', milestoneId));
    },

    subscribeWeeklyDigests(wsId, cb) {
      return listen(query(collection(ws(wsId), 'weeklyDigests'), orderBy('createdAt', 'desc'), limit(10)), cb);
    },

    async startGithubInstall(wsId) {
      const { url } = await call('createInstallUrl', { workspaceId: wsId });
      window.location.assign(url);
      return { redirected: true };
    },
    selectRepository: (wsId, repoId) => call('selectRepository', { workspaceId: wsId, repoId }),
    syncGithubInstallation: (wsId, installationId) => call('syncGithubInstallation', { workspaceId: wsId, installationId }),
    disconnectGithub: (wsId) => call('disconnectGithub', { workspaceId: wsId }),

    subscribeWebhookLogs(wsId, cb) {
      return listen(query(collection(ws(wsId), 'webhookLogs'), orderBy('receivedAt', 'desc'), limit(50)), cb);
    },

    simulateEvent: (wsId) => call('simulateEvent', { workspaceId: wsId }),
  };
}
