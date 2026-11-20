/**
 * Generates realistic GitHub webhook payloads for the simulator and demo seed data.
 * Output matches the subset of GitHub's payload schema consumed by normalizeGithubEvent.
 */

const SCENARIOS = [
  {
    kind: 'push',
    branch: 'main',
    commits: ['fix(auth): resolve JWT expiration bug in OAuth middleware'],
    files: ['src/server/middleware/oauth.ts', 'src/server/auth/jwt.ts', 'tests/auth.spec.ts'],
  },
  {
    kind: 'pr_merged',
    title: 'feat(checkout): add Apple Pay and Google Pay support',
    body: 'Adds wallet payments to the checkout flow using Stripe Payment Request Button.',
    head: 'feature/wallet-payments',
    files: ['src/checkout/PaymentForm.tsx', 'src/checkout/wallet.ts', 'src/server/stripe.ts'],
    additions: 342,
    deletions: 41,
  },
  {
    kind: 'push',
    branch: 'feature/order-history',
    commits: ['feat(orders): add order history page with filters', 'style(orders): tweak mobile table layout', 'test(orders): cover empty state'],
    files: ['src/pages/orders/History.tsx', 'src/components/OrderTable.tsx', 'src/api/orders.ts', 'tests/orders.spec.ts'],
  },
  {
    kind: 'pr_opened',
    title: 'perf: lazy-load product images and cache catalog API responses',
    body: 'Cuts LCP on the catalog page from 3.8s to 1.6s.',
    head: 'perf/catalog-images',
    files: ['src/components/ProductCard.tsx', 'src/server/cache.ts'],
    additions: 128,
    deletions: 37,
  },
  {
    kind: 'push',
    branch: 'main',
    commits: ['fix(email): order confirmation emails not sent when SMTP send times out'],
    files: ['src/server/email/send.ts', 'src/server/queue.ts'],
  },
  {
    kind: 'push',
    branch: 'main',
    commits: ['chore(deps): bump next from 15.2.1 to 15.3.0', 'chore: update eslint config'],
    files: ['package.json', 'package-lock.json', 'eslint.config.js'],
  },
  {
    kind: 'pr_merged',
    title: 'fix(ui): navbar overlaps content on small screens',
    body: '',
    head: 'fix/mobile-navbar',
    files: ['src/components/Navbar.tsx', 'src/styles/nav.css'],
    additions: 18,
    deletions: 9,
  },
  {
    kind: 'push',
    branch: 'main',
    commits: ['security: sanitize user input in review form to prevent XSS'],
    files: ['src/components/ReviewForm.tsx', 'src/server/reviews.ts'],
  },
];

const AUTHORS = [
  { login: 'alex-dev', name: 'Alex Rivera' },
  { login: 'jamie-codes', name: 'Jamie Chen' },
];

function hex(len = 40) {
  let s = '';
  const chars = '0123456789abcdef';
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * 16)];
  return s;
}

export function sampleScenarioCount() {
  return SCENARIOS.length;
}

/**
 * @param {{ fullName: string, id?: number, defaultBranch?: string }} repo
 * @param {number} [index] scenario index; random when omitted
 * @returns {{ event: 'push'|'pull_request', payload: object }}
 */
export function createSampleEvent(repo, index, at = new Date()) {
  const s = SCENARIOS[index ?? Math.floor(Math.random() * SCENARIOS.length)];
  const author = AUTHORS[Math.floor(Math.random() * AUTHORS.length)];
  const repository = {
    id: repo.id ?? 1,
    full_name: repo.fullName,
    html_url: `https://github.com/${repo.fullName}`,
    default_branch: repo.defaultBranch || 'main',
  };
  const sender = { login: author.login, avatar_url: null };

  if (s.kind === 'push') {
    const before = hex();
    const commits = s.commits.map((message, i) => {
      const id = hex();
      return {
        id,
        message,
        distinct: true,
        url: `${repository.html_url}/commit/${id}`,
        timestamp: new Date(at.getTime() - (s.commits.length - i) * 60000).toISOString(),
        author: { name: author.name, username: author.login },
        added: i === 0 ? s.files.slice(0, 1) : [],
        modified: s.files.slice(i === 0 ? 1 : 0),
        removed: [],
      };
    });
    const after = commits[commits.length - 1].id;
    return {
      event: 'push',
      payload: {
        ref: `refs/heads/${s.branch}`,
        before,
        after,
        compare: `${repository.html_url}/compare/${before.slice(0, 12)}...${after.slice(0, 12)}`,
        deleted: false,
        forced: false,
        commits,
        repository,
        sender,
      },
    };
  }

  const number = 40 + Math.floor(Math.random() * 200);
  const merged = s.kind === 'pr_merged';
  return {
    event: 'pull_request',
    payload: {
      action: merged ? 'closed' : 'opened',
      number,
      pull_request: {
        number,
        title: s.title,
        body: s.body,
        html_url: `${repository.html_url}/pull/${number}`,
        draft: false,
        merged,
        merged_at: merged ? at.toISOString() : null,
        created_at: at.toISOString(),
        merge_commit_sha: merged ? hex() : null,
        user: { login: author.login },
        head: { ref: s.head, sha: hex() },
        base: { ref: repository.default_branch, sha: hex() },
        additions: s.additions,
        deletions: s.deletions,
        changed_files: s.files.length,
        commits: 3,
      },
      repository,
      sender,
    },
  };
}
