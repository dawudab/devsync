/**
 * DevSync translation core.
 *
 * Pure, dependency-free module shared by the web app (Demo Mode) and Cloud Functions.
 * - `heuristicTranslate` turns a normalized change into a plain-English summary without any AI.
 * - `buildTranslationPrompt` / `TRANSLATION_SCHEMA` / `coerceTranslation` are used by the Gemini integration.
 *
 * A normalized change looks like:
 * {
 *   kind: 'push' | 'pull_request_opened' | 'pull_request_merged',
 *   repo, branch, defaultBranch,
 *   commits: [{ sha, message, author, url, timestamp }],
 *   pr: { number, title, body, url, baseBranch, headBranch } | null,
 *   stats: { additions, deletions, filesChanged, files: [] },
 *   diffExcerpt?: string
 * }
 */

export const IMPACT_LABELS = {
  feature: 'New feature',
  fix: 'Fix',
  improvement: 'Improvement',
  security: 'Security',
  maintenance: 'Behind the scenes',
};

const TYPE_TO_IMPACT = {
  feat: 'feature', feature: 'feature', add: 'feature', new: 'feature',
  fix: 'fix', bugfix: 'fix', hotfix: 'fix', bug: 'fix', patch: 'fix',
  perf: 'improvement', style: 'improvement', ux: 'improvement', ui: 'improvement', improve: 'improvement', enhance: 'improvement',
  security: 'security', sec: 'security',
  refactor: 'maintenance', chore: 'maintenance', docs: 'maintenance', doc: 'maintenance', test: 'maintenance',
  tests: 'maintenance', ci: 'maintenance', build: 'maintenance', deps: 'maintenance', revert: 'maintenance',
};

const IMPACT_PRIORITY = { security: 5, fix: 4, feature: 3, improvement: 2, maintenance: 1 };

const AREAS = [
  [/auth|login|log.?in|sign.?in|session|jwt|oauth|sso|password|2fa|mfa/i, 'sign-in'],
  [/pay|billing|checkout|stripe|invoice|subscription|cart|refund|paypal/i, 'payments & checkout'],
  [/onboard|sign.?up|register|registration/i, 'sign-up'],
  [/e-?mail|mail|notif|sms|push.?notif/i, 'notifications'],
  [/search|filter|sort/i, 'search'],
  [/order|product|inventory|catalog|shipping/i, 'products & orders'],
  [/profile|account|settings|preferences/i, 'customer accounts'],
  [/dashboard|admin|backoffice/i, 'the admin dashboard'],
  [/upload|image|photo|file|media|avatar/i, 'file & photo uploads'],
  [/report|analytics|chart|metric|tracking|stats/i, 'reports & analytics'],
  [/i18n|l10n|translat|locale|language/i, 'language support'],
  [/perf|speed|cache|slow|latency|lazy/i, 'speed'],
  [/ui|ux|css|style|layout|design|theme|button|modal|navbar|nav|mobile|responsive|tailwind/i, "the app's look and feel"],
  [/db|database|migration|schema|sql|firestore|postgres|mongo|query|index/i, 'how data is stored'],
  [/api|endpoint|server|backend|graphql|rest|webhook/i, 'the behind-the-scenes systems'],
  [/deploy|pipeline|docker|infra|k8s|terraform|workflow|ci\b|build/i, 'the release process'],
  [/test|spec|e2e|jest|vitest|cypress|playwright/i, 'automated quality checks'],
  [/deps|dependenc|package|upgrade|bump/i, 'the software building blocks'],
];

const SYMPTOMS = [
  { area: 'sign-in', re: /expir|timeout|time.?out|session|logged.?out|logout|refresh/i, text: 'customers were getting randomly logged out when trying to sign in' },
  { area: 'sign-in', re: /redirect|loop/i, text: 'some people got stuck in a loop while signing in' },
  { area: 'sign-in', re: /password|reset/i, text: 'resetting a password was not working reliably' },
  { area: 'payments & checkout', re: /declin|charge|card|tax|total|price|coupon|discount/i, text: 'some customers had trouble completing a payment' },
  { area: 'notifications', re: /send|deliver|spam|bounce/i, text: "some emails or notifications weren't reaching customers" },
];

const GENERIC_SYMPTOMS = [
  [/charge|payment|checkout|card|stripe/i, 'some customers had trouble completing a payment'],
  [/crash|exception|error|500|fail|broken|null|undefined/i, 'part of the app could show an error or stop working'],
  [/slow|perf|latency|timeout|hang/i, 'some pages were loading slower than they should'],
  [/typo|copy|wording|text|label/i, 'some text on screen was wrong or confusing'],
  [/mobile|small screen|responsive|layout|overflow|overlap|align|css|style|render|display/i, 'some screens looked broken, especially on phones'],
  [/duplicate|twice|double/i, 'some items were showing up twice'],
  [/email|notif|sms/i, "some notifications weren't being sent correctly"],
  [/upload|image|file/i, 'uploading files or photos sometimes failed'],
  [/search|filter|sort/i, "search results weren't always accurate"],
  [/date|time.?zone|timezone/i, 'some dates and times were showing incorrectly'],
];

const JARGON = [
  [/\bJWTs?\b/gi, 'login session'],
  [/\b(access|refresh|auth) tokens?\b/gi, 'login session'],
  [/\bOAuth2?\b/gi, 'sign-in'],
  [/\bmiddleware\b/gi, 'system'],
  [/\bendpoints?\b/gi, 'feature'],
  [/\bAPIs?\b/g, 'system'],
  [/\bUI\b/g, 'screen'],
  [/\bUX\b/g, 'experience'],
  [/\bDB\b/g, 'database'],
  [/\bbugs?\b/gi, 'issue'],
  [/\bdeps\b/gi, 'building blocks'],
  [/\bcomponents?\b/gi, 'screen element'],
  [/\b(null|undefined)\b/gi, 'missing value'],
  [/\bconfig\b/gi, 'settings'],
  [/\brepo\b/gi, 'project'],
  [/\bimpl\b/gi, 'implement'],
  [/\bperf\b/gi, 'performance'],
  [/\bi18n\b/gi, 'translations'],
  [/\bCTA\b/g, 'call-to-action button'],
  [/\b(LCP|TTFB|FCP)\b/g, 'load time'],
  [/\bSSR\b/g, 'page loading'],
  [/\bCRUD\b/g, 'create and edit'],
  [/`([^`]+)`/g, '$1'],
  [/\s*\(#\d+\)\s*$/g, ''],
  [/\s*#\d+\b/g, ''],
];

const LEADING_VERBS = /^(add(ed|s)?|implement(ed|s)?|introduc(e|ed|es)|creat(e|ed|es)|support(s|ed)?|build|built|new|initial)\s+/i;
const FIX_VERBS = /^(fix(ed|es)?|resolv(e|ed|es)|correct(ed|s)?|patch(ed|es)?|repair(ed|s)?|handle[ds]?)\s+/i;

const CONVENTIONAL = /^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/;

export function parseCommitMessage(message = '') {
  const firstLine = String(message).split('\n')[0].trim();
  const body = String(message).split('\n').slice(1).join('\n').trim();
  const m = firstLine.match(CONVENTIONAL);
  if (m) {
    const type = m[1].toLowerCase();
    return { type, scope: m[2] || '', breaking: Boolean(m[3]), subject: m[4].trim(), body, isMerge: false };
  }
  const isMerge = /^merge (pull request|branch|remote)/i.test(firstLine);
  const lower = firstLine.toLowerCase();
  let type = 'chore';
  if (/^(fix|resolve|correct|patch|repair|hotfix)/.test(lower) || /\bfix(es|ed)?\b|\bbug\b/.test(lower)) type = 'fix';
  else if (/^(add|implement|introduce|create|support|new)\b/.test(lower)) type = 'feat';
  else if (/^(improve|optimi[sz]e|speed|enhance|polish|tweak)/.test(lower)) type = 'perf';
  else if (/^(refactor|clean|rename|move|restructure)/.test(lower)) type = 'refactor';
  else if (/^(update|bump|upgrade)\b.*(dep|package|version)/.test(lower)) type = 'deps';
  else if (/secur|vulnerab|xss|csrf|cve/.test(lower)) type = 'security';
  else if (/^(doc|readme)/.test(lower)) type = 'docs';
  else if (/^test/.test(lower)) type = 'test';
  return { type, scope: '', breaking: false, subject: firstLine, body, isMerge };
}

function detectArea(text) {
  for (const [re, label] of AREAS) if (re.test(text)) return label;
  return 'the app';
}

function cleanSubject(subject) {
  let s = subject;
  for (const [re, rep] of JARGON) s = s.replace(re, rep);
  return s.replace(/\s{2,}/g, ' ').replace(/[.\s]+$/, '').trim();
}

/** Sentence-case the first word unless it looks like a proper noun or acronym ("Apple Pay", "iOS", "SMS"). */
function lowerFirst(s) {
  if (!s) return s;
  const [first, second = ''] = s.split(/\s+/);
  if (!/^[A-Z][a-z'-]*$/.test(first)) return s;
  if (/^[A-Z]/.test(second)) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function firstSentence(text) {
  const line = String(text || '')
    .split('\n')
    .map((l) => l.replace(/^[-*#>\s]+/, '').trim())
    .find((l) => l && !/^(closes|fixes|resolves|co-authored-by|signed-off-by)\b/i.test(l));
  if (!line) return null;
  const sentence = cleanSubject(line.split(/(?<=[.!?])\s/)[0]);
  return sentence.length > 12 ? `${upperFirst(sentence)}.` : null;
}

function upperFirst(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function findSymptom(area, text) {
  const specific = SYMPTOMS.find((s) => s.area === area && s.re.test(text));
  if (specific) return specific.text;
  const generic = GENERIC_SYMPTOMS.find(([re]) => re.test(text));
  return generic ? generic[1] : null;
}

function sizeOf(stats = {}) {
  const lines = (stats.additions || 0) + (stats.deletions || 0);
  const files = stats.filesChanged || 0;
  if (lines > 600 || files > 25) return 'large';
  if (lines > 120 || files > 8) return 'medium';
  return 'small';
}

function statusSentence(change, size) {
  const sizeText = {
    small: 'a small, low-risk change',
    medium: 'a medium-sized change',
    large: 'a larger change, so a quick test on your side is a good idea',
  }[size];
  const branch = change.branch || change.pr?.headBranch;
  const isDefault = branch && change.defaultBranch && branch === change.defaultBranch;
  if (change.kind === 'pull_request_opened') return `It's ready for review and isn't live yet — ${sizeText}.`;
  if (change.kind === 'pull_request_merged') return `It has been approved and added to the main version of the app — ${sizeText}.`;
  if (isDefault) return `It's been added to the main version of the app — ${sizeText}.`;
  return `This is still a work in progress on a separate copy of the app and isn't live yet — ${sizeText}.`;
}

function whySentence(impact, area, symptom) {
  switch (impact) {
    case 'fix':
      return symptom ? "Customers shouldn't run into this problem anymore." : `${upperFirst(area)} should now work reliably for your customers.`;
    case 'feature':
      return `This gives your customers more they can do in ${area}.`;
    case 'improvement':
      return area === 'speed' ? 'Pages should feel quicker and smoother.' : `${upperFirst(area)} should feel smoother and more polished.`;
    case 'security':
      return "This helps keep your business and your customers' data safe.";
    default:
      return "Nothing changes for customers today, but it keeps the app healthy and makes future updates faster and safer.";
  }
}

function headlineFor(impact, parsed, area, symptom) {
  const subject = cleanSubject(parsed.subject);
  switch (impact) {
    case 'fix':
      if (symptom) return `We fixed an issue where ${symptom}.`;
      return `We fixed an issue with ${area}: ${lowerFirst(subject.replace(FIX_VERBS, ''))}.`;
    case 'feature': {
      const what = lowerFirst(subject.replace(LEADING_VERBS, ''));
      return area === 'the app' || /\b(to|for|in|on)\b/.test(what) ? `We added ${what}.` : `We added ${what} to ${area}.`;
    }
    case 'improvement':
      return area === 'speed' ? 'We made the app faster.' : `We improved ${area}: ${lowerFirst(subject)}.`;
    case 'security':
      return `We strengthened security around ${area}.`;
    default:
      if (parsed.type === 'docs' || parsed.type === 'doc') return "We updated the project's internal documentation.";
      if (parsed.type === 'test' || parsed.type === 'tests') return 'We added automated checks that catch problems before customers do.';
      if (parsed.type === 'deps' || /bump|upgrade|dependenc/i.test(parsed.subject)) return 'We updated the software building blocks the app relies on.';
      if (parsed.type === 'ci' || parsed.type === 'build') return 'We improved how new versions of the app are built and released.';
      return `We did some behind-the-scenes housekeeping on ${area}.`;
  }
}

function pickPrimary(change) {
  const candidates = [];
  if (change.pr?.title) candidates.push({ message: `${change.pr.title}\n\n${change.pr.body || ''}` });
  for (const c of change.commits || []) candidates.push(c);
  const parsed = candidates
    .map((c) => ({ c, p: parseCommitMessage(c.message) }))
    .filter(({ p }) => !p.isMerge);
  if (!parsed.length) return parseCommitMessage(candidates[0]?.message || 'Update');
  if (change.pr?.title) return parsed[0].p;
  parsed.sort((a, b) => (IMPACT_PRIORITY[impactOf(b.p)] || 0) - (IMPACT_PRIORITY[impactOf(a.p)] || 0));
  return parsed[0].p;
}

function impactOf(parsed) {
  return TYPE_TO_IMPACT[parsed.type] || 'maintenance';
}

/** Deterministic, offline translation. Always returns exactly three bullets. */
export function heuristicTranslate(change) {
  const primary = pickPrimary(change);
  const impact = impactOf(primary);
  const area =
    primary.type === 'perf'
      ? 'speed'
      : [primary.scope, primary.subject, (change.stats?.files || []).slice(0, 10).join(' ')]
          .map((text) => (text ? detectArea(text) : 'the app'))
          .find((a) => a !== 'the app') || 'the app';
  const symptom = impact === 'fix' ? findSymptom(area, `${primary.scope} ${primary.subject} ${primary.body}`) : null;
  const size = sizeOf(change.stats);
  const headline = headlineFor(impact, primary, area, symptom);

  const meaningful = (change.commits || []).filter((c) => !parseCommitMessage(c.message).isMerge);
  const detail = firstSentence(change.pr?.body) || firstSentence(primary.body);
  let what;
  if (meaningful.length > 1) {
    const areas = [...new Set(meaningful.map((c) => {
      const p = parseCommitMessage(c.message);
      return detectArea(p.scope || p.subject);
    }))].filter((a) => a !== 'the app');
    what = `This update bundles ${meaningful.length} changes${areas.length ? `, mainly touching ${areas.slice(0, 3).join(', ')}` : ''}.`;
  } else if (detail) {
    what = detail;
  } else if (impact === 'fix') {
    what = symptom
      ? `The problem was in ${area}, and the fix has been put in place.`
      : `The problem: ${lowerFirst(cleanSubject(primary.subject).replace(FIX_VERBS, ''))}.`;
  } else if (impact === 'maintenance') {
    what = `Your developer tidied up ${area} so it's easier to work on.`;
  } else {
    what = `The change focuses on ${area}.`;
  }

  return {
    headline,
    bullets: [what, whySentence(impact, area, symptom), statusSentence(change, size)],
    impact,
    area,
    risk: size === 'large' ? 'high' : size === 'medium' ? 'medium' : 'low',
    breaking: primary.breaking,
    source: 'heuristic',
  };
}

export const TRANSLATION_SCHEMA = {
  type: 'OBJECT',
  properties: {
    headline: { type: 'STRING', description: 'One friendly sentence (max 20 words) describing the change for a non-technical business owner.' },
    bullets: { type: 'ARRAY', items: { type: 'STRING' }, minItems: 3, maxItems: 3, description: 'Exactly three short plain-English bullets: what changed, why it matters to customers, and whether it is live / any action needed.' },
    impact: { type: 'STRING', enum: ['feature', 'fix', 'improvement', 'security', 'maintenance'] },
    area: { type: 'STRING', description: 'Short product area in plain language, e.g. "sign-in", "checkout".' },
    risk: { type: 'STRING', enum: ['low', 'medium', 'high'] },
  },
  required: ['headline', 'bullets', 'impact', 'area', 'risk'],
};

export function buildTranslationPrompt(change, { maxDiffChars = 12000 } = {}) {
  const commits = (change.commits || [])
    .slice(0, 30)
    .map((c) => `- ${c.sha ? c.sha.slice(0, 7) : ''} ${String(c.message).split('\n')[0]}`)
    .join('\n');
  const stats = change.stats || {};
  const diff = change.diffExcerpt ? String(change.diffExcerpt).slice(0, maxDiffChars) : '(not available)';
  return `You are DevSync, an assistant that explains software changes to non-technical small-business owners.

Rules:
- Write for someone with zero programming knowledge. Never use jargon such as API, JWT, middleware, refactor, endpoint, commit, branch, merge, diff, repo.
- Focus on the effect on the business and its customers.
- Be honest and specific; do not invent features that are not supported by the input.
- Use "we" to refer to the development team. Keep it warm and concise.
- Return exactly 3 bullets: (1) what changed, (2) why it matters to customers, (3) whether it is live yet and any action the owner should take.
- Event status: ${describeKind(change)}.

Example:
Raw: "fix(auth): resolve JWT expiration bug in OAuth middleware"
Headline: "We fixed an issue where customers were getting randomly logged out when trying to sign in."

Repository: ${change.repo || 'unknown'}
Branch: ${change.branch || change.pr?.headBranch || 'unknown'} (main branch: ${change.defaultBranch || 'main'})
${change.pr ? `Pull request #${change.pr.number}: ${change.pr.title}\n${String(change.pr.body || '').slice(0, 1500)}` : ''}
Commits:
${commits || '(none)'}
Stats: ${stats.filesChanged ?? '?'} files changed, +${stats.additions ?? '?'} / -${stats.deletions ?? '?'} lines
Files: ${(stats.files || []).slice(0, 40).join(', ')}

Diff excerpt:
${diff}`;
}

function describeKind(change) {
  const isDefault = change.branch && change.branch === change.defaultBranch;
  if (change.kind === 'pull_request_opened') return 'proposed and waiting for review, NOT live yet';
  if (change.kind === 'pull_request_merged') return 'approved and merged into the main version';
  return isDefault ? 'pushed directly to the main version' : 'work in progress on a separate branch, NOT live yet';
}

/** Validate a model response; fall back to the heuristic for anything missing. */
export function coerceTranslation(raw, change) {
  const fallback = heuristicTranslate(change);
  if (!raw || typeof raw !== 'object') return fallback;
  const str = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
  const bullets = Array.isArray(raw.bullets) ? raw.bullets.map((b) => str(b, 280)).filter(Boolean) : [];
  while (bullets.length < 3) bullets.push(fallback.bullets[bullets.length]);
  return {
    headline: str(raw.headline, 200) || fallback.headline,
    bullets: bullets.slice(0, 3),
    impact: IMPACT_LABELS[raw.impact] ? raw.impact : fallback.impact,
    area: str(raw.area, 60) || fallback.area,
    risk: ['low', 'medium', 'high'].includes(raw.risk) ? raw.risk : fallback.risk,
    breaking: fallback.breaking,
    source: 'gemini',
  };
}
