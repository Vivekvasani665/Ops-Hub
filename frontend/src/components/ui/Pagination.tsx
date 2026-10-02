import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn, formatNumber } from '@/lib/utils';

function pageWindow(page: number, totalPages: number, size = 5): number[] {
  const half = Math.floor(size / 2);
  let start = Math.max(1, page - half);
  const end = Math.min(totalPages, start + size - 1);
  start = Math.max(1, end - size + 1);
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

export function Pagination({
  page,
  limit,
  total,
  totalPages,
  onPageChange,
  noun = 'results',
}: {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  noun?: string;
}) {
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(total, page * limit);
  const btn =
    'inline-flex h-8 min-w-8 cursor-pointer items-center justify-center rounded-md px-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40';
  return (
    <div className="flex flex-col items-center justify-between gap-3 px-5 py-4 sm:flex-row">
      <p className="text-xs text-slate-500">
        Showing {formatNumber(from)}–{formatNumber(to)} of {formatNumber(total)} {noun}
      </p>
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button
            className={cn(btn, 'border border-slate-200 text-slate-500 hover:bg-slate-50')}
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          {pageWindow(page, totalPages).map((p) => (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className={cn(btn, p === page ? 'bg-blue-600 font-medium text-white' : 'text-slate-600 hover:bg-slate-100')}
            >
              {p}
            </button>
          ))}
          <button
            className={cn(btn, 'border border-slate-200 text-slate-500 hover:bg-slate-50')}
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
