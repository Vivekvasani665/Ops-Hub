import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useMe } from './hooks';
import { AuthUserProvider } from './auth-context';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { ErrorState } from '@/components/ui/ErrorState';

export function RequireAuth({ children }: { children: ReactNode }) {
  const me = useMe();
  const location = useLocation();

  if (me.isPending) return <FullPageSpinner />;
  if (me.isError)
    return (
      <div className="flex h-full items-center justify-center p-6">
        <ErrorState error={me.error} onRetry={() => me.refetch()} />
      </div>
    );
  if (!me.data) {
    const next = location.pathname + location.search;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }
  return <AuthUserProvider user={me.data}>{children}</AuthUserProvider>;
}
