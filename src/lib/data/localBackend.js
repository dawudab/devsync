import { createSampleEvent } from '@shared/sample-events.js';
import { normalizeGithubEvent, buildUpdateDoc } from '@shared/github-events.js';
import { heuristicTranslate } from '@shared/translator-core.js';
import { store } from './localStore';
import { buildDemoSeed, DEMO_PERSONAS } from './demoSeed';
import { generateId, generateInviteCode, generateShortInviteCode } from './ids';

const PERSONA_KEY = 'devsync:demo-persona';
const DEMO_PROFILES_KEY = 'devsync:demo-profiles';
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const byDesc = (key) => (a, b) => (b[key] || 0) - (a[key] || 0);
const byAsc = (key) => (a, b) => (a[key] || 0) - (b[key] || 0);

function readDemoProfileOverrides() {
  try {
    return JSON.parse(localStorage.getItem(DEMO_PROFILES_KEY) || '{}');
  } catch {
    return {};
  }
}

/**
 * Demo Mode backend: same contract as the Firestore backend, backed by localStorage.
 * Enforces the same role-based permissions per workspace ('owner', 'team_member', 'developer').
 */
export function createLocalBackend() {
  if (store.isEmpty()) store.reset(buildDemoSeed());

  const authListeners = new Set();
  const persona = () => {
    const base = DEMO_PERSONAS[localStorage.getItem(PERSONA_KEY) || 'owner'] || DEMO_PERSONAS.owner;
    const override = readDemoProfileOverrides()[base.uid];
    return override ? { ...base, ...override } : base;
  };
  const emitAuth = () => authListeners.forEach((cb) => cb({ ...persona() }));
  const wsPath = (wsId) => `workspaces/${wsId}`;

  function assertMember(wsId, allowedRoles) {
    const p = persona();
    const ws = store.get(wsPath(wsId));
    const role = ws?.members?.[p.uid];
    if (!ws || !role) throw new Error('You do not have access to this workspace');
    if (allowedRoles && !allowedRoles.includes(role)) {
      throw new Error(`Permission denied: requires ${allowedRoles.join(' or ')} role`);
    }
    return { ws, role, user: p };
  }

  function log(wsId, entry) {
    const id = generateId();
    store.set(`${wsPath(wsId)}/webhookLogs/${id}`, { receivedAt: Date.now(), ...entry });
    return id;
  }

  return {
    mode: 'demo',

    setDemoPersona(role) {
      localStorage.setItem(PERSONA_KEY, DEMO_PERSONAS[role] ? role : 'owner');
      emitAuth();
    },

    resetDemo() {
      store.reset(buildDemoSeed());
    },

    onAuthChange(cb) {
      authListeners.add(cb);
      queueMicrotask(() => cb({ ...persona() }));
      return () => authListeners.delete(cb);
    },
    async signInWithGoogle() {},
    async signInAsGuest() {},
    async signOut() {},

    async updateUserProfile(user, { displayName, photoURL, title = '', bio = '' }, workspaceIds = []) {
      const cleanName = (displayName || '').trim() || user.displayName || 'Member';
      const cleanPhoto = photoURL === undefined ? user.photoURL || null : photoURL || null;
      const overrides = readDemoProfileOverrides();
      overrides[user.uid] = { displayName: cleanName, photoURL: cleanPhoto };
      localStorage.setItem(DEMO_PROFILES_KEY, JSON.stringify(overrides));
      const profileEntry = {
        name: cleanName,
        photoURL: cleanPhoto,
        title: (title || '').trim(),
        bio: (bio || '').trim(),
      };
      for (const wsId of workspaceIds) {
        const ws = store.get(wsPath(wsId));
        if (ws?.members?.[user.uid]) {
          store.update(wsPath(wsId), { profiles: { ...ws.profiles, [user.uid]: profileEntry } });
        }
      }
      emitAuth();
      return { displayName: cleanName, photoURL: cleanPhoto };
    },

    subscribeMyWorkspaces(uid, cb) {
      return store.watch(() => {
        const ids = store.get(`users/${uid}`)?.workspaceIds || [];
        return ids
          .map((id) => store.get(wsPath(id)))
          .filter((w) => w && w.members?.[uid])
          .map((w) => ({ id: w.id, name: w.name, role: w.members[uid] }));
      }, cb);
    },

    subscribeWorkspace(wsId, cb) {
      return store.watch(() => {
        const ws = store.get(wsPath(wsId));
        return ws && ws.members?.[persona().uid] ? ws : null;
      }, cb);
    },

    async createWorkspace(user, name, creatorRole = 'owner', extras = {}) {
      const role = creatorRole === 'developer' ? 'developer' : 'owner';
      const id = `ws-${generateId().slice(0, 10)}`;
      store.set(wsPath(id), {
        name: name.trim(),
        ownerId: role === 'owner' ? user.uid : null,
        members: { [user.uid]: role },
        profiles: { [user.uid]: { name: user.displayName, photoURL: user.photoURL || null } },
        inviteCode: generateInviteCode(),
        businessProfile: extras.businessProfile || { tagline: '', industry: '' },
        workspaceLinks: extras.workspaceLinks || { productionUrl: '', stagingUrl: '', designUrl: '' },
        deletionRequest: null,
        ticketCounter: 0,
        github: null,
        createdAt: Date.now(),
      });
      const ids = store.get(`users/${user.uid}`)?.workspaceIds || [];
      store.set(`users/${user.uid}`, { workspaceIds: [...ids, id] });
      return id;
    },

    async updateWorkspace(wsId, patch) {
      const keys = Object.keys(patch || {});
      if (keys.every((k) => k === 'workspaceLinks')) {
        assertMember(wsId, ['developer']);
      } else {
        assertMember(wsId, ['owner']);
      }
      store.update(wsPath(wsId), patch);
    },

    async deleteWorkspace(wsId) {
      const { ws, role } = assertMember(wsId, ['owner', 'developer']);
      const hasOwner = Boolean(ws.ownerId) || Object.values(ws.members || {}).includes('owner');
      if (role === 'developer' && hasOwner) {
        throw new Error('Owner approval is required to delete this project');
      }
      for (const uid of Object.keys(ws.members || {})) {
        const ids = store.get(`users/${uid}`)?.workspaceIds || [];
        store.set(`users/${uid}`, { workspaceIds: ids.filter((i) => i !== wsId) });
      }
      store.remove(wsPath(wsId));
    },

    async requestWorkspaceDeletion(wsId, reason, actor) {
      assertMember(wsId, ['developer']);
      store.update(wsPath(wsId), {
        deletionRequest: {
          status: 'pending',
          requestedBy: { uid: actor.uid, name: actor.displayName },
          requestedAt: Date.now(),
          reason: (reason || '').trim(),
        },
      });
    },

    async resolveDeletionRequest(wsId, status) {
      assertMember(wsId, ['owner', 'developer']);
      store.update(wsPath(wsId), {
        deletionRequest: status === 'clear' ? null : { status, resolvedAt: Date.now() },
      });
    },

    async joinWorkspace(code) {
      const p = persona();
      const clean = code.trim().toUpperCase();
      const invite = store.get(`invites/${clean}`);
      if (invite) {
        const ws = store.get(wsPath(invite.workspaceId));
        if (!ws) throw new Error('Workspace no longer exists');
        if (invite.role === 'owner' && invite.usedBy && invite.usedBy !== p.uid) {
          throw new Error('This owner invite has already been claimed');
        }
        if (!ws.members?.[p.uid]) {
          store.update(wsPath(invite.workspaceId), {
            members: { ...ws.members, [p.uid]: invite.role },
            profiles: { ...ws.profiles, [p.uid]: { name: p.displayName, photoURL: p.photoURL || null } },
            ...(invite.role === 'owner' && !ws.ownerId ? { ownerId: p.uid } : {}),
          });
          if (invite.role === 'owner') {
            store.update(`invites/${clean}`, { usedBy: p.uid });
          }
          const ids = store.get(`users/${p.uid}`)?.workspaceIds || [];
          if (!ids.includes(invite.workspaceId)) {
            store.set(`users/${p.uid}`, { workspaceIds: [...ids, invite.workspaceId] });
          }
        }
        return invite.workspaceId;
      }

      const match = store.list('workspaces').find((w) => w.inviteCode === clean);
      if (!match) throw new Error('That invite code is not valid');
      if (!match.members?.[p.uid]) {
        store.update(wsPath(match.id), {
          members: { ...match.members, [p.uid]: 'developer' },
          profiles: { ...match.profiles, [p.uid]: { name: p.displayName, photoURL: p.photoURL || null } },
        });
        const ids = store.get(`users/${p.uid}`)?.workspaceIds || [];
        if (!ids.includes(match.id)) store.set(`users/${p.uid}`, { workspaceIds: [...ids, match.id] });
      }
      return match.id;
    },

    subscribeInvites(wsId, cb) {
      return store.watch(() => {
        if (!store.get(wsPath(wsId))?.members?.[persona().uid]) return [];
        return store.list('invites').filter((inv) => inv.workspaceId === wsId).sort(byDesc('createdAt'));
      }, cb);
    },

    async createInvite(wsId, workspaceName, role, creatorUid) {
      assertMember(wsId, ['owner', 'developer']);
      const code = generateShortInviteCode();
      store.set(`invites/${code}`, {
        code,
        workspaceId: wsId,
        workspaceName,
        role,
        createdBy: creatorUid,
        usedBy: null,
        createdAt: Date.now(),
      });
      return code;
    },

    async deleteInvite(code) {
      const invite = store.get(`invites/${code}`);
      if (!invite) return;
      assertMember(invite.workspaceId, ['owner', 'developer']);
      store.remove(`invites/${code}`);
    },

    async updateMemberRole(wsId, targetUid, role) {
      const { ws } = assertMember(wsId, ['owner']);
      if (targetUid === persona().uid) throw new Error('Cannot change your own role');
      store.update(wsPath(wsId), { members: { ...ws.members, [targetUid]: role } });
    },

    async removeMember(wsId, targetUid) {
      const { ws } = assertMember(wsId, ['owner']);
      if (targetUid === persona().uid) throw new Error('Cannot remove yourself');
      const members = { ...ws.members };
      const profiles = { ...ws.profiles };
      delete members[targetUid];
      delete profiles[targetUid];
      store.update(wsPath(wsId), { members, profiles });
      const ids = store.get(`users/${targetUid}`)?.workspaceIds || [];
      store.set(`users/${targetUid}`, { workspaceIds: ids.filter((i) => i !== wsId) });
    },

    subscribeUpdates(wsId, cb) {
      return store.watch(() => (store.get(wsPath(wsId))?.members?.[persona().uid] ? store.list(`${wsPath(wsId)}/updates`).sort(byDesc('createdAt')) : []), cb);
    },

    async toggleReaction(wsId, updateId, emoji, uid, active) {
      assertMember(wsId);
      store.update(`${wsPath(wsId)}/updates/${updateId}`, (u) => {
        const current = new Set(u.reactions?.[emoji] || []);
        if (active) current.delete(uid);
        else current.add(uid);
        return { reactions: { ...u.reactions, [emoji]: [...current] } };
      });
    },

    async setUpdateApproval(wsId, updateId, { approvalStatus, approvalNote = null }, author) {
      assertMember(wsId, ['owner']);
      store.update(`${wsPath(wsId)}/updates/${updateId}`, {
        approvalStatus,
        approvalNote: approvalNote || null,
        approvedBy: { uid: author.uid, name: author.displayName },
        approvedAt: Date.now(),
      });
    },

    async translatePreview(wsId, change) {
      assertMember(wsId, ['developer']);
      await delay(700);
      return heuristicTranslate(change);
    },

    async retranslateUpdate(wsId, updateId) {
      assertMember(wsId, ['developer']);
      await delay(900);
      store.update(`${wsPath(wsId)}/updates/${updateId}`, (u) => ({ summary: heuristicTranslate(u) }));
    },

    subscribeComments(wsId, updateId, cb) {
      return store.watch(() => store.list(`${wsPath(wsId)}/updates/${updateId}/comments`).sort(byAsc('createdAt')), cb);
    },

    async addComment(wsId, updateId, { text, parentId = null }, author) {
      assertMember(wsId);
      store.set(`${wsPath(wsId)}/updates/${updateId}/comments/${generateId()}`, {
        text: text.trim(),
        parentId,
        authorId: author.uid,
        authorName: author.displayName,
        authorPhoto: null,
        authorRole: author.role,
        createdAt: Date.now(),
      });
      store.update(`${wsPath(wsId)}/updates/${updateId}`, (u) => ({ commentCount: (u.commentCount || 0) + 1 }));
    },

    subscribeTickets(wsId, cb) {
      return store.watch(() => store.list(`${wsPath(wsId)}/tickets`).sort(byDesc('createdAt')), cb);
    },

    async createTicket(wsId, { title, description, priority, kind = 'change_request', milestoneId = null }, author) {
      const { ws, role } = assertMember(wsId);
      const effectiveKind = role === 'team_member' ? 'suggestion' : kind;
      const number = (ws.ticketCounter || 0) + 1;
      store.update(wsPath(wsId), { ticketCounter: number });
      const id = generateId();
      const now = Date.now();
      store.set(`${wsPath(wsId)}/tickets/${id}`, {
        number,
        title: title.trim(),
        description: description.trim(),
        priority,
        kind: effectiveKind,
        milestoneId: milestoneId || null,
        status: 'todo',
        createdBy: { uid: author.uid, name: author.displayName },
        linkedCommit: null,
        activity: [{ type: 'created', by: author.displayName, at: now }],
        createdAt: now,
        updatedAt: now,
      });
      return id;
    },

    async updateTicket(wsId, ticketId, patch, actor, activityEntry) {
      assertMember(wsId, ['developer']);
      store.update(`${wsPath(wsId)}/tickets/${ticketId}`, (t) => ({
        ...patch,
        activity: activityEntry ? [...(t.activity || []), { ...activityEntry, by: actor.displayName, at: Date.now() }] : t.activity,
        updatedAt: Date.now(),
      }));
    },

    subscribeMilestones(wsId, cb) {
      return store.watch(() => store.list(`${wsPath(wsId)}/milestones`).sort(byAsc('order')), cb);
    },

    async createMilestone(wsId, { title, description = '', targetDate = null, order = 0 }, uid) {
      assertMember(wsId, ['owner']);
      const id = generateId();
      const now = Date.now();
      store.set(`${wsPath(wsId)}/milestones/${id}`, {
        title: title.trim(),
        description: description.trim(),
        targetDate: targetDate || null,
        order,
        progress: 0,
        status: 'planned',
        linkedUpdateIds: [],
        linkedTicketIds: [],
        createdBy: uid,
        createdAt: now,
        updatedAt: now,
      });
      return id;
    },

    async updateMilestone(wsId, milestoneId, patch) {
      const { role } = assertMember(wsId, ['owner', 'developer']);
      if (role === 'developer') {
        const allowed = ['progress', 'status', 'linkedUpdateIds', 'linkedTicketIds'];
        const clean = Object.fromEntries(Object.entries(patch).filter(([k]) => allowed.includes(k)));
        store.update(`${wsPath(wsId)}/milestones/${milestoneId}`, { ...clean, updatedAt: Date.now() });
      } else {
        store.update(`${wsPath(wsId)}/milestones/${milestoneId}`, { ...patch, updatedAt: Date.now() });
      }
    },

    async deleteMilestone(wsId, milestoneId) {
      assertMember(wsId, ['owner']);
      store.remove(`${wsPath(wsId)}/milestones/${milestoneId}`);
    },

    subscribeWeeklyDigests(wsId, cb) {
      return store.watch(() => store.list(`${wsPath(wsId)}/weeklyDigests`).sort(byDesc('createdAt')), cb);
    },

    async startGithubInstall(wsId) {
      const { ws } = assertMember(wsId, ['developer', 'owner']);
      await delay(1200);
      const login = ws.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'my-company';
      const lockedIds = new Set(
        store
          .list('workspaces')
          .filter((w) => w.id !== wsId && w.github?.selectedRepo?.id)
          .map((w) => String(w.github.selectedRepo.id)),
      );
      const repos = ['web-app', 'mobile-app', 'marketing-site']
        .map((name, i) => ({
          id: 1000 + i + Math.floor(Math.random() * 1000),
          fullName: `${login}/${name}`,
          private: i < 2,
          defaultBranch: 'main',
          htmlUrl: `https://github.com/${login}/${name}`,
        }))
        .filter((r) => !lockedIds.has(String(r.id)));
      store.update(wsPath(wsId), {
        github: { installationId: `demo-${Math.floor(Math.random() * 1e6)}`, account: { login, type: 'Organization' }, repos, selectedRepo: null, status: 'pending_selection', connectedAt: Date.now() },
      });
      log(wsId, { event: 'installation', action: 'created', deliveryId: crypto.randomUUID(), status: 'processed', message: `App installed on ${login} with access to ${repos.length} repositories`, repo: null, durationMs: 140 });
      return { redirected: false };
    },

    async selectRepository(wsId, repoId) {
      const { ws } = assertMember(wsId, ['developer', 'owner']);
      const repo = ws.github?.repos?.find((r) => String(r.id) === String(repoId));
      if (!repo) throw new Error('Repository not found in this installation');
      const takenByOther = store
        .list('workspaces')
        .some((w) => w.id !== wsId && String(w.github?.selectedRepo?.id) === String(repo.id));
      if (takenByOther) throw new Error('This repository is already locked to another business workspace');
      store.update(wsPath(wsId), { github: { ...ws.github, repos: [repo], selectedRepo: repo, status: 'connected', connectedAt: Date.now() } });
      // Backfill initial activity if feed is empty
      const existingUpdates = store.list(`${wsPath(wsId)}/updates`);
      if (existingUpdates.length === 0) {
        const now = Date.now();
        [0, 1, 2].forEach((scenarioIdx, i) => {
          const at = new Date(now - (3 - i) * 3600_000);
          const { event, payload } = createSampleEvent(repo, scenarioIdx, at);
          const { change } = normalizeGithubEvent(event, payload);
          if (!change) return;
          change.stats.additions ??= 18 + i * 24;
          change.stats.deletions ??= 4 + i * 6;
          const deliveryId = `backfill-${repo.id}-${i}`;
          store.set(`${wsPath(wsId)}/updates/${generateId()}`, {
            ...buildUpdateDoc(change, heuristicTranslate(change), { deliveryId }),
            approvalStatus: 'pending',
            createdAt: at.getTime(),
          });
          log(wsId, {
            event,
            action: 'backfill',
            deliveryId,
            status: 'processed',
            message: `Initial sync · translated ${change.commits.length} commit(s) on ${change.branch}`,
            repo: repo.fullName,
            durationMs: 420,
          });
        });
      }
      return { ok: true, imported: existingUpdates.length === 0 ? 3 : 0 };
    },

    async syncGithubInstallation(wsId) {
      const { ws } = assertMember(wsId, ['developer', 'owner']);
      if (!ws.github) return { linked: false };
      return { linked: true, status: ws.github.status, selectedRepo: ws.github.selectedRepo };
    },

    async disconnectGithub(wsId) {
      assertMember(wsId, ['developer']);
      store.update(wsPath(wsId), { github: null });
    },

    subscribeWebhookLogs(wsId, cb) {
      return store.watch(() => {
        const ws = store.get(wsPath(wsId));
        if (ws?.members?.[persona().uid] !== 'developer') return [];
        return store.list(`${wsPath(wsId)}/webhookLogs`).sort(byDesc('receivedAt')).slice(0, 50);
      }, cb);
    },

    async simulateEvent(wsId) {
      const { ws } = assertMember(wsId, ['developer']);
      const repo = ws.github?.selectedRepo;
      if (!repo) throw new Error('Connect a GitHub repository first');
      const started = Date.now();
      const deliveryId = crypto.randomUUID();
      const { event, payload } = createSampleEvent(repo);
      const logId = log(wsId, { event, action: payload.action || null, deliveryId, status: 'processing', message: 'Signature verified · translating with AI…', repo: repo.fullName });
      const { change, skipReason } = normalizeGithubEvent(event, payload);
      if (!change) {
        store.update(`${wsPath(wsId)}/webhookLogs/${logId}`, { status: 'ignored', message: skipReason });
        return;
      }
      change.stats.additions ??= 10 + Math.floor(Math.random() * 200);
      change.stats.deletions ??= Math.floor(Math.random() * 60);
      await delay(1100);
      const summary = heuristicTranslate(change);
      store.set(`${wsPath(wsId)}/updates/${generateId()}`, {
        ...buildUpdateDoc(change, summary, { deliveryId }),
        approvalStatus: 'pending',
        approvedBy: null,
        approvedAt: null,
        approvalNote: null,
        createdAt: Date.now(),
      });
      store.update(`${wsPath(wsId)}/webhookLogs/${logId}`, {
        status: 'processed',
        message: `Translated ${change.commits.length} commit(s) on ${change.branch}`,
        durationMs: Date.now() - started,
      });
    },
  };
}
