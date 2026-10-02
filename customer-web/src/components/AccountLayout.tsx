'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { LogOut, Package, ShoppingBag } from 'lucide-react';
import { useAuth } from '@/context/auth';
import { cx } from './ui';

/** Account area shell: profile card + navigation on the left, page content on the right. */
export function AccountLayout({ children }: { children: ReactNode }) {
  const { customer, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  if (!customer) return null;

  const initials = customer.name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  const links = [
    { href: '/orders', label: 'My Orders', icon: Package, active: pathname.startsWith('/orders') },
    { href: '/products', label: 'Continue Shopping', icon: ShoppingBag, active: false },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-4 lg:sticky lg:top-24">
        <div className="flex items-center gap-3 border-b border-slate-100 px-2 pb-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white">{initials}</span>
          <div className="min-w-0">
            <p className="truncate font-semibold">{customer.name}</p>
            <p className="truncate text-xs text-slate-500">{customer.email}</p>
          </div>
        </div>
        <nav className="mt-3 flex gap-1 overflow-x-auto lg:flex-col" aria-label="Account">
          {links.map(({ href, label, icon: Icon, active }) => (
            <Link
              key={label}
              href={href}
              className={cx(
                'flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium',
                active ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
              )}
            >
              <Icon className="size-4" /> {label}
            </Link>
          ))}
          <button
            type="button"
            onClick={async () => {
              await logout();
              router.push('/');
            }}
            className="flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-600 hover:bg-rose-50 hover:text-rose-600"
          >
            <LogOut className="size-4" /> Logout
          </button>
        </nav>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
