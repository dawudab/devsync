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

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

export function timeAgo(ms) {
  if (!ms) return '';
  const seconds = Math.round((ms - Date.now()) / 1000);
  if (Math.abs(seconds) < 45) return 'just now';
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size || unit === 'minute') return rtf.format(Math.round(seconds / size), unit);
  }
  return '';
}

export function formatDateTime(ms) {
  return ms ? new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
}

export function shortSha(sha) {
  return sha ? String(sha).slice(0, 7) : '';
}

export function greeting(name) {
  const h = new Date().getHours();
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
