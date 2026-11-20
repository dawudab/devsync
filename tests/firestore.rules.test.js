/**
 * Firestore security rules tests — run with:  npm run test:rules
 * (starts the Firestore emulator via `firebase emulators:exec`)
 */
import { after, before, beforeEach, describe, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { arrayUnion, deleteDoc, doc, getDoc, getDocs, collection, increment, serverTimestamp, setDoc, updateDoc, writeBatch, FieldPath, runTransaction } from 'firebase/firestore';

let env;
const OWNER_A = 'owner-a';
const TEAM_A = 'team-a';
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
    const ws = (owner, dev, team) => {
      const members = { [owner]: 'owner' };
      if (dev) members[dev] = 'developer';
      if (team) members[team] = 'team_member';
      return {
        name: 'Workspace',
        ownerId: owner,
        members,
        profiles: {},
        inviteCode: 'ABCD-1234',
        ticketCounter: 0,
        github: null,
      };
    };
    await setDoc(doc(db, 'workspaces/A'), ws(OWNER_A, DEV_A, TEAM_A));
    await setDoc(doc(db, 'workspaces/B'), ws(OWNER_B));
    for (const w of ['A', 'B']) {
      await setDoc(doc(db, `workspaces/${w}/updates/u1`), { summary: { headline: 'x' }, reactions: {}, commentCount: 0, approvalStatus: 'pending' });
      await setDoc(doc(db, `workspaces/${w}/tickets/t1`), { number: 1, title: 't', kind: 'change_request', status: 'todo', activity: [{ type: 'created' }] });
      await setDoc(doc(db, `workspaces/${w}/milestones/m1`), { title: 'Phase 1', progress: 0, status: 'planned', order: 0 });
      await setDoc(doc(db, `workspaces/${w}/webhookLogs/l1`), { event: 'push' });
    }
    await setDoc(doc(db, 'installations/123'), { workspaceId: 'A' });
  });
});

const as = (uid) => env.authenticatedContext(uid, { name: uid }).firestore();

describe('tenant isolation', () => {
  test('members can read their workspace and allowed subcollections', async () => {
    const db = as(OWNER_A);
    await assertSucceeds(getDoc(doc(db, 'workspaces/A')));
    await assertSucceeds(getDocs(collection(db, 'workspaces/A/updates')));
    await assertSucceeds(getDocs(collection(db, 'workspaces/A/tickets')));
    await assertSucceeds(getDocs(collection(db, 'workspaces/A/milestones')));
    // webhookLogs are strictly developer-only
    await assertFails(getDocs(collection(db, 'workspaces/A/webhookLogs')));
    await assertFails(getDocs(collection(as(TEAM_A), 'workspaces/A/webhookLogs')));
    await assertSucceeds(getDocs(collection(as(DEV_A), 'workspaces/A/webhookLogs')));
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

describe('workspace documents & invites', () => {
  test('owner or developer can create a workspace, but not with extra members or GitHub data', async () => {
    const db = as('new-user');
    const base = {
      name: 'New Co',
      ownerId: 'new-user',
      members: { 'new-user': 'owner' },
      profiles: { 'new-user': { name: 'N' } },
      inviteCode: 'WXYZ-9876',
      ticketCounter: 0,
      github: null,
      createdAt: serverTimestamp(),
    };
    await assertSucceeds(setDoc(doc(db, 'workspaces/N1'), base));
    await assertSucceeds(setDoc(doc(db, 'workspaces/N_DEV'), { ...base, ownerId: null, members: { 'new-user': 'developer' } }));
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
    await assertFails(updateDoc(doc(as(TEAM_A), 'workspaces/A'), { name: 'Hijacked' }));
  });

  test('invites enforce role creation permissions', async () => {
    const base = { code: 'AB12CD', workspaceId: 'A', workspaceName: 'Workspace', role: 'team_member', createdBy: OWNER_A, usedBy: null, createdAt: serverTimestamp() };
    await assertSucceeds(setDoc(doc(as(OWNER_A), 'invites/AB12CD'), base));
    await assertFails(setDoc(doc(as(TEAM_A), 'invites/TM1234'), { ...base, code: 'TM1234', createdBy: TEAM_A }));
    await assertFails(setDoc(doc(as(DEV_A), 'invites/DV1234'), { ...base, code: 'DV1234', role: 'developer', createdBy: DEV_A }));
    await assertSucceeds(setDoc(doc(as(DEV_A), 'invites/TM5678'), { ...base, code: 'TM5678', role: 'team_member', createdBy: DEV_A }));
    await assertSucceeds(setDoc(doc(as(DEV_A), 'invites/OW1234'), { ...base, code: 'OW1234', role: 'owner', createdBy: DEV_A }));
  });

  test('project deletion is owner-gated once an owner exists', async () => {
    // DEV_A cannot directly delete workspace A because OWNER_A exists
    await assertFails(deleteDoc(doc(as(DEV_A), 'workspaces/A')));
    // DEV_A can submit a deletionRequest
    await assertSucceeds(updateDoc(doc(as(DEV_A), 'workspaces/A'), { deletionRequest: { status: 'pending', requestedBy: { uid: DEV_A, name: 'Dev' }, reason: 'cleanup' } }));
    // OWNER_A can reject or delete
    await assertSucceeds(updateDoc(doc(as(OWNER_A), 'workspaces/A'), { deletionRequest: { status: 'rejected' } }));
    await assertSucceeds(deleteDoc(doc(as(OWNER_A), 'workspaces/A')));
  });
});

describe('feed updates & approvals & comments', () => {
  test('feed updates are server-written only; only owner can approve', async () => {
    await assertFails(setDoc(doc(as(OWNER_A), 'workspaces/A/updates/fake'), { summary: {}, reactions: {}, commentCount: 0 }));
    await assertFails(updateDoc(doc(as(OWNER_A), 'workspaces/A/updates/u1'), { 'summary.headline': 'edited' }));
    await assertSucceeds(updateDoc(doc(as(OWNER_A), 'workspaces/A/updates/u1'), { approvalStatus: 'approved', approvedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(as(DEV_A), 'workspaces/A/updates/u1'), { approvalStatus: 'approved' }));
    await assertFails(updateDoc(doc(as(TEAM_A), 'workspaces/A/updates/u1'), { approvalStatus: 'approved' }));
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

describe('tickets and milestones', () => {
  test('createTicket transaction allocates the next number and enforces kind per role', async () => {
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
          kind: 'change_request',
          milestoneId: null,
          status: 'todo',
          createdBy: { uid: OWNER_A, name: 'A' },
          linkedCommit: null,
          activity: [{ type: 'created', by: 'A', at: Date.now() }],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }),
    );

    // team_member can only create suggestions, not change_request
    const teamDb = as(TEAM_A);
    await assertFails(
      runTransaction(teamDb, async (tx) => {
        const ws = await tx.get(doc(teamDb, 'workspaces/A'));
        const number = ws.data().ticketCounter + 1;
        tx.update(doc(teamDb, 'workspaces/A'), { ticketCounter: number });
        tx.set(doc(teamDb, 'workspaces/A/tickets/t3'), {
          number,
          title: 'Team change req',
          description: '',
          priority: 'low',
          kind: 'change_request',
          milestoneId: null,
          status: 'todo',
          createdBy: { uid: TEAM_A, name: 'T' },
          linkedCommit: null,
          activity: [{ type: 'created', by: 'T', at: Date.now() }],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }),
    );
  });

  test('only developer can update ticket status and commit links', async () => {
    const devRef = doc(as(DEV_A), 'workspaces/A/tickets/t1');
    await assertSucceeds(updateDoc(devRef, { status: 'in_progress', activity: arrayUnion({ type: 'status', to: 'in_progress', at: 1 }), updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(devRef, { linkedCommit: { sha: 'abc' }, status: 'completed', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(devRef, { status: 'shipped', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(devRef, { title: 'changed', updatedAt: serverTimestamp() }));

    await assertFails(updateDoc(doc(as(OWNER_A), 'workspaces/A/tickets/t1'), { status: 'completed', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(as(TEAM_A), 'workspaces/A/tickets/t1'), { status: 'completed', updatedAt: serverTimestamp() }));
  });

  test('milestones: owner creates/deletes, developer updates progress only', async () => {
    await assertSucceeds(setDoc(doc(as(OWNER_A), 'workspaces/A/milestones/m2'), { title: 'Phase 2', progress: 0, status: 'planned', order: 1 }));
    await assertFails(setDoc(doc(as(DEV_A), 'workspaces/A/milestones/m3'), { title: 'Phase 3', progress: 0, status: 'planned', order: 2 }));
    await assertSucceeds(updateDoc(doc(as(DEV_A), 'workspaces/A/milestones/m1'), { progress: 50, status: 'in_progress', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(as(DEV_A), 'workspaces/A/milestones/m1'), { title: 'Hijacked', updatedAt: serverTimestamp() }));
    await assertFails(deleteDoc(doc(as(DEV_A), 'workspaces/A/milestones/m1')));
    await assertSucceeds(deleteDoc(doc(as(OWNER_A), 'workspaces/A/milestones/m1')));
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
