import { createSampleEvent } from '@shared/sample-events.js';
import { normalizeGithubEvent, buildUpdateDoc } from '@shared/github-events.js';
import { heuristicTranslate } from '@shared/translator-core.js';
import { generateId } from './ids';

export const DEMO_PERSONAS = {
  owner: { uid: 'demo-owner', displayName: 'Sarah Lee', photoURL: null, isAnonymous: false, roleHint: 'owner' },
  team_member: { uid: 'demo-team', displayName: 'Jordan Kim', photoURL: null, isAnonymous: false, roleHint: 'team_member' },
  developer: { uid: 'demo-dev', displayName: 'Alex Rivera', photoURL: null, isAnonymous: false, roleHint: 'developer' },
};

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

function workspaceDoc({ name, inviteCode, repo, links, budget, businessProfile, now }) {
  return {
    name,
    ownerId: DEMO_PERSONAS.owner.uid,
    members: {
      [DEMO_PERSONAS.owner.uid]: 'owner',
      [DEMO_PERSONAS.team_member.uid]: 'team_member',
      [DEMO_PERSONAS.developer.uid]: 'developer',
    },
    profiles: {
      [DEMO_PERSONAS.owner.uid]: { name: DEMO_PERSONAS.owner.displayName, photoURL: null },
      [DEMO_PERSONAS.team_member.uid]: { name: DEMO_PERSONAS.team_member.displayName, photoURL: null },
      [DEMO_PERSONAS.developer.uid]: { name: DEMO_PERSONAS.developer.displayName, photoURL: null },
    },
    inviteCode,
    businessProfile: businessProfile || { tagline: '', industry: '' },
    workspaceLinks: links || { productionUrl: '', stagingUrl: '', designUrl: '' },
    budget: budget || { hourlyRate: 120, monthlyBudget: 4800, currency: 'USD' },
    ticketCounter: 0,
    createdAt: now - 30 * DAY,
    github: {
      installationId: `demo-${Math.floor(Math.random() * 1e6)}`,
      account: { login: repo.fullName.split('/')[0], type: 'Organization' },
      repos: [repo],
      selectedRepo: repo,
      status: 'connected',
      connectedAt: now - 29 * DAY,
    },
  };
}

function seedUpdates(docs, wsId, repo, scenarioIdx, now) {
  const ids = [];
  scenarioIdx.forEach(([idx, ago, approval = 'pending'], i) => {
    const at = new Date(now - ago);
    const { event, payload } = createSampleEvent(repo, idx, at);
    const { change } = normalizeGithubEvent(event, payload);
    if (change.kind === 'push' && change.stats.additions == null) {
      change.stats.additions = 12 + i * 23;
      change.stats.deletions = 3 + i * 7;
    }
    const id = generateId();
    const deliveryId = crypto.randomUUID();
    docs[`workspaces/${wsId}/updates/${id}`] = {
      ...buildUpdateDoc(change, heuristicTranslate(change), { deliveryId }),
      approvalStatus: approval,
      approvedBy: approval === 'approved' ? { uid: DEMO_PERSONAS.owner.uid, name: DEMO_PERSONAS.owner.displayName } : null,
      approvedAt: approval === 'approved' ? at.getTime() + 15 * MIN : null,
      approvalNote: approval === 'changes_requested' ? 'Can we make the button label a bit larger on mobile?' : null,
      createdAt: at.getTime(),
    };
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
  const id = generateId();
  docs[`workspaces/${wsId}/tickets/${id}`] = {
    number: ws.ticketCounter,
    kind: data.kind || 'change_request',
    milestoneId: data.milestoneId || null,
    linkedCommit: null,
    createdBy: data.createdBy || { uid: DEMO_PERSONAS.owner.uid, name: DEMO_PERSONAS.owner.displayName },
    activity: [{ type: 'created', by: (data.createdBy || DEMO_PERSONAS.owner).name || DEMO_PERSONAS.owner.displayName, at: data.createdAt }],
    updatedAt: data.createdAt,
    ...data,
  };
  return id;
}

export function buildDemoSeed() {
  const now = Date.now();
  const docs = {};
  const { owner, team_member: team, developer } = DEMO_PERSONAS;

  const acmeRepo = { id: 101, fullName: 'acme-coffee/storefront', private: true, defaultBranch: 'main', htmlUrl: 'https://github.com/acme-coffee/storefront' };
  docs['workspaces/demo-acme'] = workspaceDoc({
    name: 'Acme Coffee Co.',
    inviteCode: 'ACME-2024',
    repo: acmeRepo,
    businessProfile: { tagline: 'Small-batch roastery & online storefront', industry: 'Food & Beverage' },
    links: {
      productionUrl: 'https://acmecoffee.example.com',
      stagingUrl: 'https://staging.acmecoffee.example.com',
      designUrl: 'https://figma.com/file/acme-storefront',
    },
    budget: { hourlyRate: 125, monthlyBudget: 5000, currency: 'USD' },
    now,
  });

  const acme = seedUpdates(docs, 'demo-acme', acmeRepo, [
    [7, 3 * DAY, 'approved'],
    [5, 2 * DAY, 'approved'],
    [2, 26 * HOUR, 'changes_requested'],
    [3, 5 * HOUR, 'approved'],
    [1, 2 * HOUR, 'pending'],
    [0, 25 * MIN, 'pending'],
  ], now);

  const latest = acme[acme.length - 1];
  docs[`workspaces/demo-acme/updates/${latest.id}`].reactions = { '🚀': [owner.uid], '👍': [developer.uid, team.uid] };
  const c1 = comment(docs, 'demo-acme', latest.id, owner, 'owner', 'Amazing — a few customers emailed about this last week. Is it live for everyone now?', now - 18 * MIN);
  comment(docs, 'demo-acme', latest.id, developer, 'developer', 'Yes! It shipped to production about 20 minutes ago. Let me know if anyone still sees it.', now - 12 * MIN, c1);

  const wallet = acme[acme.length - 2];
  docs[`workspaces/demo-acme/updates/${wallet.id}`].reactions = { '❤️': [owner.uid, team.uid], '🚀': [owner.uid, developer.uid] };
  comment(docs, 'demo-acme', wallet.id, owner, 'owner', 'Love this. Can we announce it in Friday’s newsletter?', now - 90 * MIN);
  docs[`workspaces/demo-acme/updates/${acme[2].id}`].reactions = { '👀': [owner.uid] };

  // Milestones for Acme Coffee Co.
  const m1 = generateId();
  const m2 = generateId();
  const m3 = generateId();
  docs[`workspaces/demo-acme/milestones/${m1}`] = {
    title: 'Phase 1: Holiday Storefront Launch',
    description: 'Core checkout reliability, mobile speed improvements, and winter collection launch.',
    targetDate: new Date(now + 5 * DAY).toISOString().slice(0, 10),
    order: 0,
    progress: 100,
    status: 'completed',
    linkedUpdateIds: [acme[0].id, acme[1].id, latest.id],
    linkedTicketIds: [],
    createdBy: owner.uid,
    createdAt: now - 14 * DAY,
    updatedAt: now - 1 * DAY,
  };
  docs[`workspaces/demo-acme/milestones/${m2}`] = {
    title: 'Phase 2: Gift Cards & Apple Pay',
    description: 'Digital gift cards ($25, $50, $100) and one-tap wallet checkout.',
    targetDate: new Date(now + 14 * DAY).toISOString().slice(0, 10),
    order: 1,
    progress: 65,
    status: 'in_progress',
    linkedUpdateIds: [wallet.id],
    linkedTicketIds: [],
    createdBy: owner.uid,
    createdAt: now - 10 * DAY,
    updatedAt: now - 2 * HOUR,
  };
  docs[`workspaces/demo-acme/milestones/${m3}`] = {
    title: 'Phase 3: Subscription Club',
    description: 'Monthly coffee bean auto-delivery with pause/skip controls.',
    targetDate: new Date(now + 35 * DAY).toISOString().slice(0, 10),
    order: 2,
    progress: 15,
    status: 'planned',
    linkedUpdateIds: [],
    linkedTicketIds: [],
    createdBy: owner.uid,
    createdAt: now - 4 * DAY,
    updatedAt: now - 4 * DAY,
  };

  // Tickets for Acme Coffee Co.
  const t1 = ticket(docs, 'demo-acme', {
    title: 'Add a gift card option at checkout',
    description: 'Customers keep asking if they can buy gift cards for the holidays. Ideally $25, $50 and $100 options.',
    priority: 'high',
    kind: 'change_request',
    milestoneId: m2,
    status: 'in_progress',
    createdAt: now - 2 * DAY,
    activity: [
      { type: 'created', by: owner.displayName, at: now - 2 * DAY },
      { type: 'status', from: 'todo', to: 'in_progress', by: developer.displayName, at: now - 30 * HOUR },
    ],
    updatedAt: now - 30 * HOUR,
  });
  ticket(docs, 'demo-acme', {
    title: 'Customers are getting logged out randomly',
    description: 'Got 3 emails this week from people saying they had to sign in again in the middle of ordering.',
    priority: 'high',
    kind: 'change_request',
    milestoneId: m1,
    status: 'completed',
    createdAt: now - 4 * DAY,
    linkedCommit: { sha: latest.change.commits[0].sha, message: latest.change.commits[0].message, url: latest.change.commits[0].url, updateId: latest.id },
    activity: [
      { type: 'created', by: owner.displayName, at: now - 4 * DAY },
      { type: 'status', from: 'todo', to: 'in_progress', by: developer.displayName, at: now - 3 * DAY },
      { type: 'linked', sha: latest.change.commits[0].sha, by: developer.displayName, at: now - 25 * MIN },
      { type: 'status', from: 'in_progress', to: 'completed', by: developer.displayName, at: now - 24 * MIN },
    ],
    updatedAt: now - 24 * MIN,
  });
  ticket(docs, 'demo-acme', {
    title: 'Change the homepage banner for the winter menu',
    description: 'New photos are in the shared Drive folder. Headline: "Warm up with our Winter Collection".',
    priority: 'medium',
    kind: 'change_request',
    milestoneId: m1,
    status: 'todo',
    createdAt: now - 6 * HOUR,
  });
  ticket(docs, 'demo-acme', {
    title: 'Idea: Add tasting notes quiz for first-time visitors',
    description: 'Customers at the tasting bar love picking beans by roast & flavor profile — could be a fun web quiz.',
    priority: 'low',
    kind: 'suggestion',
    createdBy: { uid: team.uid, name: team.displayName },
    status: 'todo',
    createdAt: now - 50 * MIN,
  });

  // Budget logs for Acme Coffee Co.
  docs[`workspaces/demo-acme/budgetLogs/${generateId()}`] = {
    hours: 8.5,
    description: 'Fixed session timeout bug & deployed checkout reliability patch',
    ticketId: t1,
    updateId: latest.id,
    loggedBy: { uid: developer.uid, name: developer.displayName },
    loggedAt: now - 1 * DAY,
  };
  docs[`workspaces/demo-acme/budgetLogs/${generateId()}`] = {
    hours: 14,
    description: 'Apple Pay & gift card cart flow implementation',
    ticketId: t1,
    updateId: wallet.id,
    loggedBy: { uid: developer.uid, name: developer.displayName },
    loggedAt: now - 3 * DAY,
  };
  docs[`workspaces/demo-acme/budgetLogs/${generateId()}`] = {
    hours: 6,
    description: 'Homepage image compression & mobile performance tuning',
    ticketId: null,
    updateId: acme[0].id,
    loggedBy: { uid: developer.uid, name: developer.displayName },
    loggedAt: now - 5 * DAY,
  };

  // Weekly digest for Acme Coffee Co.
  docs[`workspaces/demo-acme/weeklyDigests/${generateId()}`] = {
    headline: 'Strong week — checkout fixes shipped and Gift Cards hit 65%',
    summary: 'Your team shipped 6 updates this week, resolved the customer sign-out issue, and moved Phase 2 (Gift Cards & Apple Pay) forward. Two recent updates are ready for your quick sign-off.',
    health: 'on_track',
    createdAt: now - 2 * HOUR,
  };

  // Sample invites
  docs['invites/ACME99'] = {
    code: 'ACME99',
    workspaceId: 'demo-acme',
    workspaceName: 'Acme Coffee Co.',
    role: 'team_member',
    createdBy: owner.uid,
    usedBy: null,
    createdAt: now - 2 * DAY,
  };

  // Second workspace: Bloom & Petal Florist
  const bloomRepo = { id: 202, fullName: 'bloom-petal/booking-app', private: true, defaultBranch: 'main', htmlUrl: 'https://github.com/bloom-petal/booking-app' };
  docs['workspaces/demo-bloom'] = workspaceDoc({
    name: 'Bloom & Petal Florist',
    inviteCode: 'BLOM-7781',
    repo: bloomRepo,
    businessProfile: { tagline: 'Same-day bespoke floral delivery', industry: 'Retail' },
    links: {
      productionUrl: 'https://bloomandpetal.example.com',
      stagingUrl: 'https://preview.bloomandpetal.example.com',
      designUrl: '',
    },
    budget: { hourlyRate: 110, monthlyBudget: 3300, currency: 'USD' },
    now,
  });
  seedUpdates(docs, 'demo-bloom', bloomRepo, [[6, 8 * HOUR, 'approved'], [4, 3 * HOUR, 'pending']], now);
  docs[`workspaces/demo-bloom/milestones/${generateId()}`] = {
    title: 'Phase 1: Same-Day Delivery Slots',
    description: 'Allow morning, afternoon, and evening delivery windows at checkout.',
    targetDate: new Date(now + 10 * DAY).toISOString().slice(0, 10),
    order: 0,
    progress: 40,
    status: 'in_progress',
    linkedUpdateIds: [],
    linkedTicketIds: [],
    createdBy: owner.uid,
    createdAt: now - 5 * DAY,
    updatedAt: now - 3 * HOUR,
  };
  ticket(docs, 'demo-bloom', {
    title: 'Let customers pick a delivery time slot',
    description: 'Morning / afternoon / evening options for same-day bouquets.',
    priority: 'medium',
    kind: 'change_request',
    status: 'todo',
    createdAt: now - 4 * HOUR,
  });
  docs[`workspaces/demo-bloom/budgetLogs/${generateId()}`] = {
    hours: 7.5,
    description: 'Delivery slot calendar UI and availability rules',
    ticketId: null,
    updateId: null,
    loggedBy: { uid: developer.uid, name: developer.displayName },
    loggedAt: now - 6 * HOUR,
  };

  docs[`users/${owner.uid}`] = { workspaceIds: ['demo-acme', 'demo-bloom'] };
  docs[`users/${team.uid}`] = { workspaceIds: ['demo-acme', 'demo-bloom'] };
  docs[`users/${developer.uid}`] = { workspaceIds: ['demo-acme', 'demo-bloom'] };
  return docs;
}
