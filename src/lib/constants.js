import { Sparkles, Wrench, Zap, ShieldCheck, Cog, Circle, CircleDashed, CheckCircle2 } from 'lucide-react';

export const STATUS_ICONS = { todo: Circle, in_progress: CircleDashed, completed: CheckCircle2 };

export const REACTIONS = ['👍', '🚀', '❤️', '👀'];

export const IMPACT_META = {
  feature: { label: 'New feature', icon: Sparkles, chip: 'bg-violet-50 text-violet-700 ring-violet-200', dot: 'bg-violet-500' },
  fix: { label: 'Fix', icon: Wrench, chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200', dot: 'bg-emerald-500' },
  improvement: { label: 'Improvement', icon: Zap, chip: 'bg-sky-50 text-sky-700 ring-sky-200', dot: 'bg-sky-500' },
  security: { label: 'Security', icon: ShieldCheck, chip: 'bg-amber-50 text-amber-700 ring-amber-200', dot: 'bg-amber-500' },
  maintenance: { label: 'Behind the scenes', icon: Cog, chip: 'bg-ink-100 text-ink-600 ring-ink-200', dot: 'bg-ink-400' },
};

export const TONES = {
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  sky: 'bg-sky-50 text-sky-700 ring-sky-200',
  rose: 'bg-rose-50 text-rose-700 ring-rose-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
  ink: 'bg-ink-100 text-ink-600 ring-ink-200',
  brand: 'bg-brand-50 text-brand-700 ring-brand-200',
};

export const TICKET_STATUSES = [
  { value: 'todo', label: 'To Do', tone: 'ink' },
  { value: 'in_progress', label: 'In Progress', tone: 'sky' },
  { value: 'completed', label: 'Completed', tone: 'emerald' },
];

export const TICKET_PRIORITIES = [
  { value: 'low', label: 'Low', tone: 'ink', hint: 'Nice to have' },
  { value: 'medium', label: 'Medium', tone: 'amber', hint: 'Soon-ish' },
  { value: 'high', label: 'High', tone: 'rose', hint: 'Urgent' },
];

export const statusMeta = (value) => TICKET_STATUSES.find((s) => s.value === value) || TICKET_STATUSES[0];
export const priorityMeta = (value) => TICKET_PRIORITIES.find((p) => p.value === value) || TICKET_PRIORITIES[1];

export const ROLES = {
  owner: { value: 'owner', label: 'Business Owner', short: 'Owner', tone: 'brand' },
  team_member: { value: 'team_member', label: 'Team Member', short: 'Team', tone: 'violet' },
  developer: { value: 'developer', label: 'Developer', short: 'Developer', tone: 'emerald' },
};

export const roleMeta = (value) => ROLES[value] || ROLES.team_member;

export const APPROVAL_STATUSES = {
  pending: { value: 'pending', label: 'Needs sign-off', tone: 'amber' },
  approved: { value: 'approved', label: 'Approved', tone: 'emerald' },
  changes_requested: { value: 'changes_requested', label: 'Tweaks requested', tone: 'rose' },
};

export const approvalMeta = (value) => APPROVAL_STATUSES[value] || APPROVAL_STATUSES.pending;

export const TICKET_KINDS = {
  change_request: { value: 'change_request', label: 'Change Request', tone: 'brand' },
  suggestion: { value: 'suggestion', label: 'Suggestion / Idea', tone: 'violet' },
};

export const MILESTONE_STATUSES = [
  { value: 'planned', label: 'Planned', tone: 'ink' },
  { value: 'in_progress', label: 'In Progress', tone: 'sky' },
  { value: 'completed', label: 'Completed', tone: 'emerald' },
];
