import { ArrowUp, ArrowRight, ArrowDown } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { useLanguage } from '@/context/LanguageContext';
import { priorityMeta, statusMeta, STATUS_ICONS } from '@/lib/constants';

const PRIORITY_ICONS = { high: ArrowUp, medium: ArrowRight, low: ArrowDown };

export function PriorityBadge({ priority }) {
  const { t } = useLanguage();
  const meta = priorityMeta(priority);
  return (
    <Badge tone={meta.tone} icon={PRIORITY_ICONS[meta.value]}>
      {t(`priority.${meta.value}`)}
    </Badge>
  );
}

export function StatusBadge({ status }) {
  const { t } = useLanguage();
  const meta = statusMeta(status);
  return (
    <Badge tone={meta.tone} icon={STATUS_ICONS[meta.value]}>
      {t(`status.${meta.value}`)}
    </Badge>
  );
}
