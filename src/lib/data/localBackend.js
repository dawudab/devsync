import { createSampleEvent } from '@shared/sample-events.js';
import { normalizeGithubEvent, buildUpdateDoc } from '@shared/github-events.js';
import { heuristicTranslate } from '@shared/translator-core.js';
import { store } from './localStore';
import { buildDemoSeed, DEMO_PERSONAS } from './demoSeed';
import { generateId, generateInviteCode } from './ids';

const PERSONA_KEY = 'devsync:view-mode';
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const byDesc = (key) => (a, b) => (b[key] || 0) - (a[key] || 0);

/**
 * Demo Mode backend: same contract as the Firestore backend, backed by localStorage.
 * The signed-in persona follows the Owner/Developer view switcher so both sides can be tested.
 */
export function createLocalBackend() {
  if (store.isEmpty()) store.reset(buildDemoSeed());

  const authListeners = new Set();
  const persona = () => DEMO_PERSONAS[localStorage.getItem(PERSONA_KEY) || 'owner'] || DEMO_PERSONAS.owner;
  const emitAuth = () => authListeners.forEach((cb) => cb({ ...persona() }));
  const wsPath = (wsId) => `workspaces/${wsId}`;

  function assertMember(wsId) {
    const ws = store.get(wsPath(wsId));
    if (!ws || !ws.members[persona().uid]) throw new Error('You do not have access to this workspace');
    return ws;
  }

  function log(wsId, entry) {
    const id = generateId();
    store.set(`${wsPath(wsId)}/webhookLogs/${id}`, { receivedAt: Date.now(), ...entry });
    return id;
  }

  return {
    mode: 'demo',

    setDemoPersona(role) {
      localStorage.setItem(PERSONA_KEY, role === 'developer' ? 'developer' : 'owner');
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

    subscribeMyWorkspaces(uid, cb) {
      return store.watch(() => {
        const ids = store.get(`users/${uid}`)?.workspaceIds || [];
        return ids
          .map((id) => store.get(wsPath(id)))
          .filter(Boolean)
          .map((w) => ({ id: w.id, name: w.name, role: w.members[uid] }));
      }, cb);
    },

    subscribeWorkspace(wsId, cb) {
      return store.watch(() => {
        const ws = store.get(wsPath(wsId));
        return ws && ws.members[persona().uid] ? ws : null;
      }, cb);
    },

    async createWorkspace(user, name) {
      const id = `ws-${generateId().slice(0, 10)}`;
      const dev = DEMO_PERSONAS.developer;
      store.set(wsPath(id), {
        name: name.trim(),
        ownerId: user.uid,
        members: { [user.uid]: 'owner', [dev.uid]: 'developer' },
        profiles: { [user.uid]: { name: user.displayName }, [dev.uid]: { name: dev.displayName } },
        inviteCode: generateInviteCode(),
        ticketCounter: 0,
        github: null,
        createdAt: Date.now(),
      });
      for (const uid of [user.uid, dev.uid]) {
        const ids = store.get(`users/${uid}`)?.workspaceIds || [];
        store.set(`users/${uid}`, { workspaceIds: [...ids, id] });
      }
      return id;
    },

    async joinWorkspace(code) {
      const match = store.list('workspaces').find((w) => w.inviteCode === code.trim().toUpperCase());
      if (!match) throw new Error('That invite code is not valid');
      return match.id;
    },

    subscribeUpdates(wsId, cb) {
      return store.watch(() => (store.get(wsPath(wsId))?.members[persona().uid] ? store.list(`${wsPath(wsId)}/updates`).sort(byDesc('createdAt')) : []), cb);
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

    async translatePreview(wsId, change) {
      assertMember(wsId);
      await delay(700);
      return heuristicTranslate(change);
    },

    async retranslateUpdate(wsId, updateId) {
      assertMember(wsId);
      await delay(900);
      store.update(`${wsPath(wsId)}/updates/${updateId}`, (u) => ({ summary: heuristicTranslate(u) }));
    },

    subscribeComments(wsId, updateId, cb) {
      return store.watch(() => store.list(`${wsPath(wsId)}/updates/${updateId}/comments`).sort((a, b) => a.createdAt - b.createdAt), cb);
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

    async createTicket(wsId, { title, description, priority }, author) {
      const ws = assertMember(wsId);
      const number = (ws.ticketCounter || 0) + 1;
      store.update(wsPath(wsId), { ticketCounter: number });
      const id = generateId();
      const now = Date.now();
      store.set(`${wsPath(wsId)}/tickets/${id}`, {
        number,
        title: title.trim(),
        description: description.trim(),
        priority,
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
      assertMember(wsId);
      store.update(`${wsPath(wsId)}/tickets/${ticketId}`, (t) => ({
        ...patch,
        activity: activityEntry ? [...(t.activity || []), { ...activityEntry, by: actor.displayName, at: Date.now() }] : t.activity,
        updatedAt: Date.now(),
      }));
    },

    async startGithubInstall(wsId) {
      const ws = assertMember(wsId);
      await delay(1200);
      const login = ws.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'my-company';
      const repos = ['web-app', 'mobile-app', 'marketing-site'].map((name, i) => ({
        id: 1000 + i + Math.floor(Math.random() * 1000),
        fullName: `${login}/${name}`,
        private: i < 2,
        defaultBranch: 'main',
        htmlUrl: `https://github.com/${login}/${name}`,
      }));
      store.update(wsPath(wsId), {
        github: { installationId: `demo-${Math.floor(Math.random() * 1e6)}`, account: { login, type: 'Organization' }, repos, selectedRepo: null, status: 'pending_selection', connectedAt: Date.now() },
      });
      log(wsId, { event: 'installation', action: 'created', deliveryId: crypto.randomUUID(), status: 'processed', message: `App installed on ${login} with access to ${repos.length} repositories`, repo: null, durationMs: 140 });
      return { redirected: false };
    },

    async selectRepository(wsId, repoId) {
      const ws = assertMember(wsId);
      const repo = ws.github?.repos?.find((r) => r.id === repoId);
      if (!repo) throw new Error('Repository not found in this installation');
      store.update(wsPath(wsId), { github: { ...ws.github, selectedRepo: repo, status: 'connected', connectedAt: Date.now() } });
    },

    async disconnectGithub(wsId) {
      assertMember(wsId);
      store.update(wsPath(wsId), { github: null });
    },

    subscribeWebhookLogs(wsId, cb) {
      return store.watch(() => store.list(`${wsPath(wsId)}/webhookLogs`).sort(byDesc('receivedAt')).slice(0, 50), cb);
    },

    async simulateEvent(wsId) {
      const ws = assertMember(wsId);
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
      store.set(`${wsPath(wsId)}/updates/${generateId()}`, { ...buildUpdateDoc(change, summary, { deliveryId }), createdAt: Date.now() });
      store.update(`${wsPath(wsId)}/webhookLogs/${logId}`, {
        status: 'processed',
        message: `Translated ${change.commits.length} commit(s) on ${change.branch}`,
        durationMs: Date.now() - started,
      });
    },
  };
}
