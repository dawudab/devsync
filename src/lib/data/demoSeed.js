import { createSampleEvent } from '@shared/sample-events.js';
import { normalizeGithubEvent, buildUpdateDoc } from '@shared/github-events.js';
import { heuristicTranslate } from '@shared/translator-core.js';
import { generateId } from './ids';

export const DEMO_PERSONAS = {
  owner: { uid: 'demo-owner', displayName: 'Sarah Lee', photoURL: null, isAnonymous: false },
  developer: { uid: 'demo-dev', displayName: 'Alex Rivera', photoURL: null, isAnonymous: false },
};

const MIN = 60_000;
const HOUR = 60 * MIN;

function workspaceDoc({ name, inviteCode, repo, now }) {
  return {
    name,
    ownerId: DEMO_PERSONAS.owner.uid,
    members: { [DEMO_PERSONAS.owner.uid]: 'owner', [DEMO_PERSONAS.developer.uid]: 'developer' },
    profiles: {
      [DEMO_PERSONAS.owner.uid]: { name: DEMO_PERSONAS.owner.displayName, photoURL: null },
      [DEMO_PERSONAS.developer.uid]: { name: DEMO_PERSONAS.developer.displayName, photoURL: null },
    },
    inviteCode,
    ticketCounter: 0,
    createdAt: now - 30 * 24 * HOUR,
    github: {
      installationId: `demo-${Math.floor(Math.random() * 1e6)}`,
      account: { login: repo.fullName.split('/')[0], type: 'Organization' },
      repos: [repo],
      selectedRepo: repo,
      status: 'connected',
      connectedAt: now - 29 * 24 * HOUR,
    },
  };
}

function seedUpdates(docs, wsId, repo, scenarioIdx, now) {
  const ids = [];
  scenarioIdx.forEach(([idx, ago], i) => {
    const at = new Date(now - ago);
    const { event, payload } = createSampleEvent(repo, idx, at);
    const { change } = normalizeGithubEvent(event, payload);
    if (change.kind === 'push' && change.stats.additions == null) {
      change.stats.additions = 12 + i * 23;
      change.stats.deletions = 3 + i * 7;
    }
    const id = generateId();
    const deliveryId = crypto.randomUUID();
    docs[`workspaces/${wsId}/updates/${id}`] = { ...buildUpdateDoc(change, heuristicTranslate(change), { deliveryId }), createdAt: at.getTime() };
    docs[`workspaces/${wsId}/webhookLogs/${generateId()}`] = {
      event,
      action: payload.action || null,
      deliveryId,
      status: 'processed',
      message: `Translated ${change.commits.length} commit(s) on ${change.branch}`,
      repo: repo.fullName,
      durationMs: 600 + Math.floor(Math.random() * 900),
      receivedAt: at.getTime(),
    };
    ids.push({ id, change, at: at.getTime() });
  });
  return ids;
}

function comment(docs, wsId, updateId, persona, role, text, at, parentId = null) {
  const id = generateId();
  docs[`workspaces/${wsId}/updates/${updateId}/comments/${id}`] = {
    text,
    parentId,
    authorId: persona.uid,
    authorName: persona.displayName,
    authorPhoto: null,
    authorRole: role,
    createdAt: at,
  };
  docs[`workspaces/${wsId}/updates/${updateId}`].commentCount += 1;
  return id;
}

function ticket(docs, wsId, data) {
  const ws = docs[`workspaces/${wsId}`];
  ws.ticketCounter += 1;
  docs[`workspaces/${wsId}/tickets/${generateId()}`] = {
    number: ws.ticketCounter,
    linkedCommit: null,
    createdBy: { uid: DEMO_PERSONAS.owner.uid, name: DEMO_PERSONAS.owner.displayName },
    activity: [{ type: 'created', by: DEMO_PERSONAS.owner.displayName, at: data.createdAt }],
    updatedAt: data.createdAt,
    ...data,
  };
}

export function buildDemoSeed() {
  const now = Date.now();
  const docs = {};
  const { owner, developer } = DEMO_PERSONAS;

  const acmeRepo = { id: 101, fullName: 'acme-coffee/storefront', private: true, defaultBranch: 'main', htmlUrl: 'https://github.com/acme-coffee/storefront' };
  docs['workspaces/demo-acme'] = workspaceDoc({ name: 'Acme Coffee Co.', inviteCode: 'ACME-2024', repo: acmeRepo, now });
  const acme = seedUpdates(docs, 'demo-acme', acmeRepo, [
    [7, 3 * 24 * HOUR],
    [5, 2 * 24 * HOUR],
    [2, 26 * HOUR],
    [3, 5 * HOUR],
    [1, 2 * HOUR],
    [0, 25 * MIN],
  ], now);

  const latest = acme[acme.length - 1];
  latest.ref = docs[`workspaces/demo-acme/updates/${latest.id}`];
  latest.ref.reactions = { '🚀': [owner.uid], '👍': [developer.uid] };
  const c1 = comment(docs, 'demo-acme', latest.id, owner, 'owner', 'Amazing — a few customers emailed about this last week. Is it live for everyone now?', now - 18 * MIN);
  comment(docs, 'demo-acme', latest.id, developer, 'developer', 'Yes! It shipped to production about 20 minutes ago. Let me know if anyone still sees it.', now - 12 * MIN, c1);

  const wallet = acme[acme.length - 2];
  docs[`workspaces/demo-acme/updates/${wallet.id}`].reactions = { '❤️': [owner.uid], '🚀': [owner.uid, developer.uid] };
  comment(docs, 'demo-acme', wallet.id, owner, 'owner', 'Love this. Can we announce it in Friday’s newsletter?', now - 90 * MIN);

  docs[`workspaces/demo-acme/updates/${acme[2].id}`].reactions = { '👀': [owner.uid] };

  ticket(docs, 'demo-acme', {
    title: 'Add a gift card option at checkout',
    description: 'Customers keep asking if they can buy gift cards for the holidays. Ideally $25, $50 and $100 options.',
    priority: 'high',
    status: 'in_progress',
    createdAt: now - 2 * 24 * HOUR,
    activity: [
      { type: 'created', by: owner.displayName, at: now - 2 * 24 * HOUR },
      { type: 'status', from: 'todo', to: 'in_progress', by: developer.displayName, at: now - 30 * HOUR },
    ],
    updatedAt: now - 30 * HOUR,
  });
  ticket(docs, 'demo-acme', {
    title: 'Customers are getting logged out randomly',
    description: 'Got 3 emails this week from people saying they had to sign in again in the middle of ordering.',
    priority: 'high',
    status: 'completed',
    createdAt: now - 4 * 24 * HOUR,
    linkedCommit: { sha: latest.change.commits[0].sha, message: latest.change.commits[0].message, url: latest.change.commits[0].url, updateId: latest.id },
    activity: [
      { type: 'created', by: owner.displayName, at: now - 4 * 24 * HOUR },
      { type: 'status', from: 'todo', to: 'in_progress', by: developer.displayName, at: now - 3 * 24 * HOUR },
      { type: 'linked', sha: latest.change.commits[0].sha, by: developer.displayName, at: now - 25 * MIN },
      { type: 'status', from: 'in_progress', to: 'completed', by: developer.displayName, at: now - 24 * MIN },
    ],
    updatedAt: now - 24 * MIN,
  });
  ticket(docs, 'demo-acme', {
    title: 'Change the homepage banner for the winter menu',
    description: 'New photos are in the shared Drive folder. Headline: "Warm up with our Winter Collection".',
    priority: 'medium',
    status: 'todo',
    createdAt: now - 6 * HOUR,
  });
  ticket(docs, 'demo-acme', {
    title: 'Show estimated delivery date on product pages',
    description: 'Would be nice but not urgent.',
    priority: 'low',
    status: 'todo',
    createdAt: now - 50 * MIN,
  });

  const bloomRepo = { id: 202, fullName: 'bloom-petal/booking-app', private: true, defaultBranch: 'main', htmlUrl: 'https://github.com/bloom-petal/booking-app' };
  docs['workspaces/demo-bloom'] = workspaceDoc({ name: 'Bloom & Petal Florist', inviteCode: 'BLOM-7781', repo: bloomRepo, now });
  seedUpdates(docs, 'demo-bloom', bloomRepo, [[6, 8 * HOUR], [4, 3 * HOUR]], now);
  ticket(docs, 'demo-bloom', {
    title: 'Let customers pick a delivery time slot',
    description: 'Morning / afternoon / evening options for same-day bouquets.',
    priority: 'medium',
    status: 'todo',
    createdAt: now - 4 * HOUR,
  });

  docs[`users/${owner.uid}`] = { workspaceIds: ['demo-acme', 'demo-bloom'] };
  docs[`users/${developer.uid}`] = { workspaceIds: ['demo-acme', 'demo-bloom'] };
  return docs;
}
