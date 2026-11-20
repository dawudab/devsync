import { cn } from '@/lib/utils';

export function SegmentedControl({ options, value, onChange, size = 'md', className, ariaLabel }) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn('inline-flex rounded-xl bg-ink-100 p-1', className)}>
      {options.map((opt) => {
        const active = opt.value === value;
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              'inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium transition-all',
              size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-9 px-3 text-sm',
              active ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-700',
            )}
          >
            {Icon && <Icon className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} />}
            {opt.label}
            {opt.count != null && <span className={cn('rounded-full px-1.5 text-[11px]', active ? 'bg-ink-100 text-ink-600' : 'bg-ink-200/70 text-ink-500')}>{opt.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
