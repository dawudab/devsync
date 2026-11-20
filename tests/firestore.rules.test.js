/**
 * Firestore security rules tests — run with:  npm run test:rules
 * (starts the Firestore emulator via `firebase emulators:exec`)
 */
import { after, before, beforeEach, describe, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { arrayUnion, doc, getDoc, getDocs, collection, increment, serverTimestamp, setDoc, updateDoc, writeBatch, FieldPath, runTransaction } from 'firebase/firestore';

let env;
const OWNER_A = 'owner-a';
const DEV_A = 'dev-a';
const OWNER_B = 'owner-b';

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'devsync-rules-test',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});

after(() => env?.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const ws = (owner, dev) => ({
      name: 'Workspace',
      ownerId: owner,
      members: dev ? { [owner]: 'owner', [dev]: 'developer' } : { [owner]: 'owner' },
      profiles: {},
      inviteCode: 'ABCD-1234',
      ticketCounter: 0,
      github: null,
    });
    await setDoc(doc(db, 'workspaces/A'), ws(OWNER_A, DEV_A));
    await setDoc(doc(db, 'workspaces/B'), ws(OWNER_B));
    for (const w of ['A', 'B']) {
      await setDoc(doc(db, `workspaces/${w}/updates/u1`), { summary: { headline: 'x' }, reactions: {}, commentCount: 0 });
      await setDoc(doc(db, `workspaces/${w}/tickets/t1`), { number: 1, title: 't', status: 'todo', activity: [{ type: 'created' }] });
      await setDoc(doc(db, `workspaces/${w}/webhookLogs/l1`), { event: 'push' });
    }
    await setDoc(doc(db, 'installations/123'), { workspaceId: 'A' });
  });
});

const as = (uid) => env.authenticatedContext(uid, { name: uid }).firestore();

describe('tenant isolation', () => {
  test('members can read their workspace and its subcollections', async () => {
    const db = as(OWNER_A);
    await assertSucceeds(getDoc(doc(db, 'workspaces/A')));
    await assertSucceeds(getDocs(collection(db, 'workspaces/A/updates')));
    await assertSucceeds(getDocs(collection(db, 'workspaces/A/tickets')));
    await assertSucceeds(getDocs(collection(db, 'workspaces/A/webhookLogs')));
    await assertSucceeds(getDoc(doc(as(DEV_A), 'workspaces/A/updates/u1')));
  });

  test('Workspace B owner cannot read anything in Workspace A', async () => {
    const db = as(OWNER_B);
    await assertFails(getDoc(doc(db, 'workspaces/A')));
    await assertFails(getDocs(collection(db, 'workspaces/A/updates')));
    await assertFails(getDocs(collection(db, 'workspaces/A/tickets')));
    await assertFails(getDocs(collection(db, 'workspaces/A/webhookLogs')));
    await assertFails(getDocs(collection(db, 'workspaces/A/updates/u1/comments')));
  });

  test('cannot list all workspaces or read installation mappings', async () => {
    await assertFails(getDocs(collection(as(OWNER_A), 'workspaces')));
    await assertFails(getDoc(doc(as(OWNER_A), 'installations/123')));
  });

  test('unauthenticated users get nothing', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'workspaces/A')));
    await assertFails(getDocs(collection(db, 'workspaces/A/updates')));
  });

  test('cannot write into another workspace', async () => {
    const db = as(OWNER_B);
    await assertFails(setDoc(doc(db, 'workspaces/A/updates/u1/comments/c1'), comment(OWNER_B, 'owner')));
    await assertFails(updateDoc(doc(db, 'workspaces/A/tickets/t1'), { status: 'completed', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(db, 'workspaces/A'), { [`members.${OWNER_B}`]: 'owner' }));
  });
});

function comment(uid, role, extra = {}) {
  return { text: 'hello', parentId: null, authorId: uid, authorName: uid, authorPhoto: null, authorRole: role, createdAt: serverTimestamp(), ...extra };
}

describe('workspace documents', () => {
  test('anyone signed in can create a workspace they own, but not one with extra members or GitHub data', async () => {
    const db = as('new-user');
    const base = { name: 'New Co', ownerId: 'new-user', members: { 'new-user': 'owner' }, profiles: { 'new-user': { name: 'N' } }, inviteCode: 'WXYZ-9876', ticketCounter: 0, github: null, createdAt: serverTimestamp() };
    await assertSucceeds(setDoc(doc(db, 'workspaces/N1'), base));
    await assertFails(setDoc(doc(db, 'workspaces/N2'), { ...base, members: { 'new-user': 'owner', [OWNER_A]: 'developer' } }));
    await assertFails(setDoc(doc(db, 'workspaces/N3'), { ...base, github: { installationId: 123 } }));
    await assertFails(setDoc(doc(db, 'workspaces/N4'), { ...base, ownerId: OWNER_A }));
  });

  test('members cannot escalate roles, add members, or set GitHub metadata', async () => {
    await assertFails(updateDoc(doc(as(DEV_A), 'workspaces/A'), { [`members.${DEV_A}`]: 'owner' }));
    await assertFails(updateDoc(doc(as(OWNER_A), 'workspaces/A'), { 'members.stranger': 'developer' }));
    await assertFails(updateDoc(doc(as(OWNER_A), 'workspaces/A'), { github: { installationId: 999 } }));
    await assertSucceeds(updateDoc(doc(as(OWNER_A), 'workspaces/A'), { name: 'Renamed Co' }));
    await assertFails(updateDoc(doc(as(DEV_A), 'workspaces/A'), { name: 'Hijacked' }));
  });
});

describe('feed updates & comments', () => {
  test('feed updates are server-written only', async () => {
    await assertFails(setDoc(doc(as(OWNER_A), 'workspaces/A/updates/fake'), { summary: {}, reactions: {}, commentCount: 0 }));
    await assertFails(updateDoc(doc(as(OWNER_A), 'workspaces/A/updates/u1'), { 'summary.headline': 'edited' }));
  });

  test('members can react with allowed emoji only', async () => {
    const ref = doc(as(DEV_A), 'workspaces/A/updates/u1');
    await assertSucceeds(updateDoc(ref, new FieldPath('reactions', '🚀'), arrayUnion(DEV_A)));
    await assertSucceeds(updateDoc(ref, new FieldPath('reactions', '❤️'), arrayUnion(DEV_A)));
    await assertFails(updateDoc(ref, new FieldPath('reactions', '💩'), arrayUnion(DEV_A)));
  });

  test('comments must be authored as yourself, with your real role', async () => {
    const db = as(DEV_A);
    const batch = writeBatch(db);
    batch.set(doc(db, 'workspaces/A/updates/u1/comments/c1'), comment(DEV_A, 'developer'));
    batch.update(doc(db, 'workspaces/A/updates/u1'), { commentCount: increment(1) });
    await assertSucceeds(batch.commit());
    await assertFails(setDoc(doc(db, 'workspaces/A/updates/u1/comments/c2'), comment(OWNER_A, 'owner')));
    await assertFails(setDoc(doc(db, 'workspaces/A/updates/u1/comments/c3'), comment(DEV_A, 'owner')));
    await assertFails(setDoc(doc(db, 'workspaces/A/updates/u1/comments/c4'), comment(DEV_A, 'developer', { text: '' })));
    await assertFails(updateDoc(doc(db, 'workspaces/A/updates/u1/comments/c1'), { text: 'edited' }));
  });
});

describe('tickets', () => {
  test('createTicket transaction allocates the next number', async () => {
    const db = as(OWNER_A);
    await assertSucceeds(
      runTransaction(db, async (tx) => {
        const ws = await tx.get(doc(db, 'workspaces/A'));
        const number = ws.data().ticketCounter + 1;
        tx.update(doc(db, 'workspaces/A'), { ticketCounter: number });
        tx.set(doc(db, 'workspaces/A/tickets/t2'), {
          number,
          title: 'Gift cards',
          description: '',
          priority: 'high',
          status: 'todo',
          createdBy: { uid: OWNER_A, name: 'A' },
          linkedCommit: null,
          activity: [{ type: 'created', by: 'A', at: Date.now() }],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }),
    );
  });

  test('tickets cannot be created pre-completed or for someone else', async () => {
    const db = as(OWNER_A);
    const bad = { number: 0, title: 'x', description: '', priority: 'low', status: 'completed', createdBy: { uid: OWNER_A }, linkedCommit: null, activity: [{}], createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
    await assertFails(setDoc(doc(db, 'workspaces/A/tickets/t3'), bad));
    await assertFails(setDoc(doc(db, 'workspaces/A/tickets/t4'), { ...bad, status: 'todo', createdBy: { uid: DEV_A } }));
  });

  test('status changes and commit links are allowed; editing title is not', async () => {
    const ref = doc(as(DEV_A), 'workspaces/A/tickets/t1');
    await assertSucceeds(updateDoc(ref, { status: 'in_progress', activity: arrayUnion({ type: 'status', to: 'in_progress', at: 1 }), updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(ref, { linkedCommit: { sha: 'abc' }, status: 'completed', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { status: 'shipped', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { title: 'changed', updatedAt: serverTimestamp() }));
  });
});

describe('server-only collections', () => {
  test('webhook logs and installations cannot be written by clients', async () => {
    await assertFails(setDoc(doc(as(OWNER_A), 'workspaces/A/webhookLogs/x'), { event: 'push' }));
    await assertFails(setDoc(doc(as(OWNER_A), 'installations/999'), { workspaceId: 'A' }));
  });

  test('user index is private to the user', async () => {
    await assertSucceeds(setDoc(doc(as(OWNER_A), `users/${OWNER_A}`), { workspaceIds: ['A'] }));
    await assertFails(getDoc(doc(as(OWNER_B), `users/${OWNER_A}`)));
    await assertFails(setDoc(doc(as(OWNER_B), `users/${OWNER_A}`), { workspaceIds: ['B'] }));
  });
});
