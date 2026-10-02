import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export type Tone = 'gray' | 'blue' | 'green' | 'amber' | 'red' | 'purple' | 'orange' | 'indigo';

export const toneClasses: Record<Tone, { badge: string; dot: string }> = {
  gray: { badge: 'bg-slate-100 text-slate-700 ring-slate-200', dot: 'bg-slate-400' },
  blue: { badge: 'bg-blue-50 text-blue-700 ring-blue-200', dot: 'bg-blue-500' },
  green: { badge: 'bg-emerald-50 text-emerald-700 ring-emerald-200', dot: 'bg-emerald-500' },
  amber: { badge: 'bg-amber-50 text-amber-700 ring-amber-200', dot: 'bg-amber-500' },
  red: { badge: 'bg-red-50 text-red-700 ring-red-200', dot: 'bg-red-500' },
  purple: { badge: 'bg-violet-50 text-violet-700 ring-violet-200', dot: 'bg-violet-500' },
  orange: { badge: 'bg-orange-50 text-orange-700 ring-orange-200', dot: 'bg-orange-500' },
  indigo: { badge: 'bg-indigo-50 text-indigo-700 ring-indigo-200', dot: 'bg-indigo-500' },
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  dot?: boolean;
}

export function Badge({ tone = 'gray', dot, className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset',
        toneClasses[tone].badge,
        className,
      )}
      {...props}
    >
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', toneClasses[tone].dot)} />}
      {children}
    </span>
  );
}
