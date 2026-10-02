'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useAuth } from '@/context/auth';
import { PageLoader } from './ui';

/** Client-side gate; the backend still enforces authentication on every storefront order endpoint. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { customer, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !customer) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [loading, customer, router, pathname]);

  if (loading || !customer) return <PageLoader />;
  return <>{children}</>;
}

/** Only allow same-site relative redirects after login. */
export function safeNext(next: string | null) {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}
