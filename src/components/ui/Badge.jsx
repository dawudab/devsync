import { TONES } from '@/lib/constants';
import { cn } from '@/lib/utils';

export function Badge({ tone = 'ink', icon: Icon, className, children, dot = false }) {
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', TONES[tone] || tone, className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {children}
    </span>
  );
}
