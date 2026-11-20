import { cn, initials } from '@/lib/utils';

const PALETTE = ['bg-brand-100 text-brand-700', 'bg-violet-100 text-violet-700', 'bg-emerald-100 text-emerald-700', 'bg-amber-100 text-amber-700', 'bg-rose-100 text-rose-700', 'bg-sky-100 text-sky-700'];

function colorFor(seed = '') {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

const SIZES = { xs: 'h-6 w-6 text-[10px]', sm: 'h-8 w-8 text-xs', md: 'h-10 w-10 text-sm', lg: 'h-12 w-12 text-base' };

export function Avatar({ name, src, size = 'sm', className }) {
  if (src) return <img src={src} alt={name} className={cn('shrink-0 rounded-full object-cover', SIZES[size], className)} referrerPolicy="no-referrer" />;
  return (
    <span className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-semibold', SIZES[size], colorFor(name), className)} aria-hidden>
      {initials(name)}
    </span>
  );
}
