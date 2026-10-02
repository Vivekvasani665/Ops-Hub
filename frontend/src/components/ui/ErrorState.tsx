import { AlertTriangle, RefreshCw } from 'lucide-react';
import { toApiError } from '@/lib/api';
import { Button } from './Button';

export function ErrorState({ error, onRetry, compact }: { error: unknown; onRetry?: () => void; compact?: boolean }) {
  const err = toApiError(error);
  return (
    <div className={compact ? 'px-4 py-6 text-center' : 'flex flex-col items-center px-6 py-12 text-center'}>
      <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-red-50 text-red-500">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <p className="text-sm font-semibold text-slate-800">Something went wrong</p>
      <p className="mt-1 text-sm text-slate-500">{err.message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5" /> Try again
        </Button>
      )}
    </div>
  );
}
