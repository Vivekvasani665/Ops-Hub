'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { LogOut, Package, Settings, ShoppingBag } from 'lucide-react';
import { useAuth } from '@/context/auth';
import { cx } from './ui';

/** Account area shell: profile card + navigation on the left, page content on the right. */
export function AccountLayout({ children }: { children: ReactNode }) {
  const { customer, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const initials = customer?.name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  const links = [
    ...(customer ? [{ href: '/orders', label: 'My Orders', icon: Package, active: pathname.startsWith('/orders') }] : []),
    { href: '/settings', label: 'Settings', icon: Settings, active: pathname === '/settings' },
    { href: '/products', label: 'Continue Shopping', icon: ShoppingBag, active: false },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[270px_1fr]">
      <aside className="h-fit rounded-2xl border border-line bg-surface p-4 lg:sticky lg:top-40">
        {customer ? (
          <div className="flex items-center gap-3 border-b border-line px-2 pb-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-fg">{initials}</span>
            <div className="min-w-0">
              <p className="truncate font-semibold text-fg">{customer.name}</p>
              <p className="truncate text-xs text-muted">{customer.email}</p>
            </div>
          </div>
        ) : (
          <div className="border-b border-line px-2 pb-4">
            <p className="font-semibold text-fg">Welcome, guest</p>
            <p className="mt-0.5 text-xs text-muted">
              <Link href="/login" className="font-medium text-primary hover:underline">
                Sign in
              </Link>{' '}
              to see your orders.
            </p>
          </div>
        )}
        <nav className="no-scrollbar mt-3 flex gap-1 overflow-x-auto lg:flex-col" aria-label="Account">
          {links.map(({ href, label, icon: Icon, active }) => (
            <Link
              key={label}
              href={href}
              className={cx(
                'flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                active ? 'bg-primary-soft text-primary-soft-fg' : 'text-fg-2 hover:bg-surface-2 hover:text-fg',
              )}
            >
              <Icon className="size-4" /> {label}
            </Link>
          ))}
          {customer && (
            <button
              type="button"
              onClick={async () => {
                await logout();
                router.push('/');
              }}
              className="flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-fg-2 hover:bg-danger-soft hover:text-danger"
            >
              <LogOut className="size-4" /> Logout
            </button>
          )}
        </nav>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
