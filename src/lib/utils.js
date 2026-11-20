export function cn(...classes) {
  return classes.flat().filter(Boolean).join(' ');
}

const UNITS = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

const rtfEn = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const rtfAr = new Intl.RelativeTimeFormat('ar', { numeric: 'auto' });

export function timeAgo(ms, lang = 'en') {
  if (!ms) return '';
  const seconds = Math.round((ms - Date.now()) / 1000);
  if (Math.abs(seconds) < 45) return lang === 'ar' ? 'الآن' : 'just now';
  const rtf = lang === 'ar' ? rtfAr : rtfEn;
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size || unit === 'minute') return rtf.format(Math.round(seconds / size), unit);
  }
  return '';
}

export function formatDateTime(ms, lang = 'en') {
  return ms
    ? new Date(ms).toLocaleString(lang === 'ar' ? 'ar-SA' : undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : '';
}

export function shortSha(sha) {
  return sha ? String(sha).slice(0, 7) : '';
}

export function greeting(name, lang = 'en') {
  const h = new Date().getHours();
  if (lang === 'ar') {
    const part = h < 12 ? 'صباح الخير' : h < 18 ? 'مساء الخير' : 'مساء النور';
    return name ? `${part}، ${name.split(' ')[0]}` : part;
  }
  const part = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  return name ? `${part}, ${name.split(' ')[0]}` : part;
}

export function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('') || '?';
}

/** Owner-friendly delivery status for a feed update. */
export function deliveryStatus(update) {
  if (update.kind === 'pull_request_opened') return { label: 'In review', tone: 'amber' };
  if (update.kind === 'pull_request_merged') return { label: 'Shipped', tone: 'emerald' };
  if (update.branch && update.branch === update.defaultBranch) return { label: 'Shipped', tone: 'emerald' };
  return { label: 'In progress', tone: 'sky' };
}

export function buildInviteLink(inviteCode) {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/join?code=${encodeURIComponent(inviteCode)}`;
}

export function formatInviteMessage({ inviterName, role, businessName, inviteCode }) {
  const roleLabel = role === 'developer' ? 'dev' : role === 'owner' ? 'owner' : 'team member';
  const inviteLink = buildInviteLink(inviteCode);
  return `${inviterName || 'Someone'} is inviting you as ${roleLabel} to ${businessName || 'a workspace'}. Join here: ${inviteLink} | Invite Code: ${inviteCode}`;
}

export async function shareInvite({ inviterName, role, businessName, inviteCode }) {
  const text = formatInviteMessage({ inviterName, role, businessName, inviteCode });
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ title: `Join ${businessName || 'DevSync'}`, text });
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled';
    }
  }
  await navigator.clipboard.writeText(text);
  return 'copied';
}
