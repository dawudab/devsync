import { ArrowUp, ArrowRight, ArrowDown } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { priorityMeta, statusMeta, STATUS_ICONS } from '@/lib/constants';

const PRIORITY_ICONS = { high: ArrowUp, medium: ArrowRight, low: ArrowDown };

export function PriorityBadge({ priority }) {
  const meta = priorityMeta(priority);
  return (
    <Badge tone={meta.tone} icon={PRIORITY_ICONS[meta.value]}>
      {meta.label}
    </Badge>
  );
}

export function StatusBadge({ status }) {
  const meta = statusMeta(status);
  return (
    <Badge tone={meta.tone} icon={STATUS_ICONS[meta.value]}>
      {meta.label}
    </Badge>
  );
}
