import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, type LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/utils';

export function Trend({ value, suffix }: { value: number | null; suffix: string }) {
  if (value === null) return <span className="text-xs text-slate-500">New {suffix}</span>;
  const up = value >= 0;
  return (
    <span className="flex flex-col">
      <span className={cn('flex items-center gap-1 text-sm font-semibold', up ? 'text-emerald-600' : 'text-red-600')}>
        {up ? <ArrowUp className="h-3.5 w-3.5" strokeWidth={2.5} /> : <ArrowDown className="h-3.5 w-3.5" strokeWidth={2.5} />}
        {Math.abs(value).toFixed(1)}%
      </span>
      <span className="text-xs text-slate-500">{suffix}</span>
    </span>
  );
}

export function KpiCard({
  label,
  value,
  icon: Icon,
  iconClass,
  footer,
  aside,
  loading,
}: {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  iconClass: string;
  footer?: ReactNode;
  aside?: ReactNode;
  loading?: boolean;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-3">
        <span className={cn('flex h-9 w-9 items-center justify-center rounded-lg', iconClass)}>
          <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
        </span>
        <span className="text-sm text-slate-600">{label}</span>
      </div>
      {loading ? (
        <div className="mt-4 space-y-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-4 w-20" />
        </div>
      ) : (
        <>
          <p className="mt-4 text-[28px] leading-none font-semibold tracking-tight text-slate-900">{value}</p>
          <div className="mt-3 flex min-h-9 items-end justify-between gap-2">
            <div>{footer}</div>
            {aside}
          </div>
        </>
      )}
    </Card>
  );
}
