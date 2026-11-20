import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
  signOut as fbSignOut,
  updateProfile,
} from 'firebase/auth';
import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  FieldPath,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getFirebase } from '@/config/firebase';
import { generateInviteCode } from './ids';

function toPlain(snap) {
  const data = snap.data({ serverTimestamps: 'estimate' });
  const out = { id: snap.id, ...data };
  for (const key of ['createdAt', 'updatedAt', 'receivedAt', 'connectedAt']) {
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
      return onAuthStateChanged(auth, (u) =>
        cb(u ? { uid: u.uid, displayName: u.displayName || 'Guest', photoURL: u.photoURL, isAnonymous: u.isAnonymous } : null),
      );
    },
    async signInWithGoogle() {
      await signInWithPopup(auth, new GoogleAuthProvider());
    },
    async signInAsGuest(name) {
      const cred = await signInAnonymously(auth);
      if (name) await updateProfile(cred.user, { displayName: name });
    },
    signOut: () => fbSignOut(auth),

    subscribeMyWorkspaces(uid, cb) {
      let inner = [];
      const stopInner = () => inner.forEach((u) => u());
      const outer = onSnapshot(
        doc(db, 'users', uid),
        (snap) => {
          stopInner();
          const ids = (snap.data()?.workspaceIds || []).slice(0, 50);
          if (!ids.length) return cb([]);
          const results = new Map();
          const emit = () => results.size === ids.length && cb(ids.map((id) => results.get(id)).filter(Boolean));
          inner = ids.map((id) =>
            onSnapshot(
              ws(id),
              (s) => {
                const w = s.data();
                results.set(id, w?.members?.[uid] ? { id, name: w.name, role: w.members[uid] } : null);
                emit();
              },
              () => {
                results.set(id, null);
                emit();
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

    async createWorkspace(user, name) {
      const ref = doc(collection(db, 'workspaces'));
      const batch = writeBatch(db);
      batch.set(ref, {
        name: name.trim(),
        ownerId: user.uid,
        members: { [user.uid]: 'owner' },
        profiles: { [user.uid]: { name: user.displayName || 'Owner', photoURL: user.photoURL || null } },
        inviteCode: generateInviteCode(),
        ticketCounter: 0,
        github: null,
        createdAt: serverTimestamp(),
      });
      batch.set(doc(db, 'users', user.uid), { workspaceIds: arrayUnion(ref.id) }, { merge: true });
      await batch.commit();
      return ref.id;
    },

    async joinWorkspace(code) {
      const { workspaceId } = await call('joinWorkspace', { inviteCode: code.trim().toUpperCase() });
      return workspaceId;
    },

    subscribeUpdates(wsId, cb) {
      return listen(query(collection(ws(wsId), 'updates'), orderBy('createdAt', 'desc'), limit(100)), cb);
    },

    async toggleReaction(wsId, updateId, emoji, uid, active) {
      await updateDoc(doc(ws(wsId), 'updates', updateId), new FieldPath('reactions', emoji), active ? arrayRemove(uid) : arrayUnion(uid));
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

    async createTicket(wsId, { title, description, priority }, author) {
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

    async startGithubInstall(wsId) {
      const { url } = await call('createInstallUrl', { workspaceId: wsId });
      window.location.assign(url);
      return { redirected: true };
    },
    selectRepository: (wsId, repoId) => call('selectRepository', { workspaceId: wsId, repoId }),
    disconnectGithub: (wsId) => call('disconnectGithub', { workspaceId: wsId }),

    subscribeWebhookLogs(wsId, cb) {
      return listen(query(collection(ws(wsId), 'webhookLogs'), orderBy('receivedAt', 'desc'), limit(50)), cb);
    },

    simulateEvent: (wsId) => call('simulateEvent', { workspaceId: wsId }),
  };
}
