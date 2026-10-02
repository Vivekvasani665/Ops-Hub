'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Search, ShoppingBag, ShoppingCart, User } from 'lucide-react';
import { useAuth } from '@/context/auth';
import { useCart } from '@/context/cart';
import { BRAND } from '@/lib/catalog';
import { cx } from './ui';

const NAV = [
  { href: '/', label: 'Home' },
  { href: '/products', label: 'Shop' },
  { href: '/#categories', label: 'Categories' },
  { href: '/orders', label: 'My Orders' },
];

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <Link href="/" className={cx('flex items-center gap-2 text-lg font-bold tracking-tight', light ? 'text-white' : 'text-slate-900')}>
      <span className="flex size-8 items-center justify-center rounded-lg bg-blue-600 text-white">
        <ShoppingBag className="size-4.5" strokeWidth={2.25} />
      </span>
      {BRAND}
    </Link>
  );
}

function SearchBox({ className }: { className?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get('search') ?? '');
  useEffect(() => setQ(params.get('search') ?? ''), [params]);

  return (
    <form
      role="search"
      className={cx('relative', className)}
      onSubmit={(e) => {
        e.preventDefault();
        const term = q.trim();
        router.push(term ? `/products?search=${encodeURIComponent(term)}` : '/products');
      }}
    >
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search for products…"
        aria-label="Search products"
        className="h-10 w-full rounded-full border border-slate-200 bg-slate-50 pr-4 pl-9 text-sm placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100 focus:outline-none"
      />
    </form>
  );
}

export function Header() {
  const { customer } = useAuth();
  const { count, ready } = useCart();
  const pathname = usePathname();

  const isActive = (href: string) => (href === '/' ? pathname === '/' : !href.includes('#') && pathname.startsWith(href));

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4">
        <Logo />
        <nav className="hidden items-center gap-1 text-sm lg:flex" aria-label="Main">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={cx(
                'rounded-lg px-3 py-2 font-medium transition-colors',
                isActive(n.href) ? 'text-blue-600' : 'text-slate-600 hover:text-slate-900',
              )}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <Suspense fallback={<div className="hidden flex-1 md:block" />}>
          <SearchBox className="ml-auto hidden w-full max-w-sm md:block" />
        </Suspense>
        <div className="ml-auto flex items-center gap-1 md:ml-0">
          <Link
            href={customer ? '/orders' : '/login'}
            className="hidden items-center gap-2 rounded-full p-2 text-slate-700 hover:bg-slate-100 sm:flex"
            aria-label={customer ? 'My account' : 'Sign in'}
          >
            <User className="size-5" />
            <span className="hidden max-w-28 truncate text-sm font-medium xl:block">{customer ? customer.name.split(' ')[0] : 'Sign in'}</span>
          </Link>
          <Link href="/cart" className="relative rounded-full p-2 text-slate-700 hover:bg-slate-100" aria-label={`Cart, ${count} item${count === 1 ? '' : 's'}`}>
            <ShoppingCart className="size-5" />
            {ready && count > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex min-w-4.5 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] leading-4.5 font-semibold text-white">
                {count > 99 ? '99+' : count}
              </span>
            )}
          </Link>
        </div>
      </div>
      <div className="px-4 pb-3 md:hidden">
        <Suspense fallback={null}>
          <SearchBox />
        </Suspense>
      </div>
    </header>
  );
}
