'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { ChevronDown, LogIn, LogOut, Moon, Package, Search, Settings, ShoppingBag, ShoppingCart, Sun, Truck, User, UserPlus } from 'lucide-react';
import { useAuth } from '@/context/auth';
import { useCart } from '@/context/cart';
import { useTheme } from '@/context/theme';
import { api } from '@/lib/api';
import { BRAND } from '@/lib/catalog';
import { money } from '@/lib/format';
import { cx } from './ui';

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <Link href="/" className={cx('flex shrink-0 items-center gap-2 text-lg font-extrabold tracking-tight', light ? 'text-white' : 'text-fg')}>
      <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-fg shadow-md shadow-primary/30">
        <ShoppingBag className="size-[18px]" strokeWidth={2.25} />
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
      <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-subtle" />
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search phones, laptops, headphones…"
        aria-label="Search products"
        className="h-11 w-full rounded-full border border-line bg-surface-2 pr-28 pl-11 text-sm text-fg placeholder:text-subtle transition-colors focus:border-primary focus:bg-surface focus:ring-4 focus:ring-primary/15 focus:outline-none"
      />
      <button
        type="submit"
        className="absolute top-1/2 right-1.5 h-8 -translate-y-1/2 rounded-full bg-primary px-4 text-xs font-semibold text-primary-fg hover:bg-primary-hover"
      >
        Search
      </button>
    </form>
  );
}

export function ThemeToggle({ className }: { className?: string }) {
  const { resolved, toggle } = useTheme();
  const dark = resolved === 'dark';
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={dark ? 'Light theme' : 'Dark theme'}
      className={cx('rounded-full p-2.5 text-fg-2 transition-colors hover:bg-surface-2 hover:text-fg', className)}
    >
      {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
    </button>
  );
}

function AccountMenu() {
  const { customer, logout } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const item = 'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-fg-2 hover:bg-surface-2 hover:text-fg';

  return (
    <div ref={ref} className="relative hidden sm:block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full py-1.5 pr-2.5 pl-1.5 text-fg-2 transition-colors hover:bg-surface-2 hover:text-fg"
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-primary-soft text-primary-soft-fg">
          {customer ? <span className="text-xs font-bold">{customer.name.trim()[0]?.toUpperCase()}</span> : <User className="size-4" />}
        </span>
        <span className="hidden text-left leading-tight xl:block">
          <span className="block text-[11px] text-muted">{customer ? 'Hello,' : 'Welcome'}</span>
          <span className="block max-w-28 truncate text-sm font-semibold text-fg">{customer ? customer.name.split(' ')[0] : 'Sign in'}</span>
        </span>
        <ChevronDown className={cx('size-4 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-2 w-60 rounded-2xl border border-line bg-surface p-2 shadow-xl shadow-black/10">
          {customer ? (
            <>
              <div className="border-b border-line px-3 pt-1 pb-3">
                <p className="truncate text-sm font-semibold text-fg">{customer.name}</p>
                <p className="truncate text-xs text-muted">{customer.email}</p>
              </div>
              <div className="pt-2">
                <Link role="menuitem" href="/orders" className={item}>
                  <Package className="size-4" /> My orders
                </Link>
                <Link role="menuitem" href="/settings" className={item}>
                  <Settings className="size-4" /> Settings
                </Link>
                <button
                  role="menuitem"
                  type="button"
                  className={cx(item, 'hover:bg-danger-soft hover:text-danger')}
                  onClick={async () => {
                    await logout();
                    router.push('/');
                  }}
                >
                  <LogOut className="size-4" /> Sign out
                </button>
              </div>
            </>
          ) : (
            <>
              <Link role="menuitem" href="/login" className={item}>
                <LogIn className="size-4" /> Sign in
              </Link>
              <Link role="menuitem" href="/register" className={item}>
                <UserPlus className="size-4" /> Create account
              </Link>
              <Link role="menuitem" href="/settings" className={item}>
                <Settings className="size-4" /> Settings
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function CategoryBar() {
  const [categories, setCategories] = useState<string[]>([]);
  const params = useSearchParams();
  const pathname = usePathname();
  const active = pathname === '/products' ? params.get('category') : null;

  useEffect(() => {
    api.categories().then(setCategories, () => undefined);
  }, []);

  const link = (on: boolean) =>
    cx(
      'shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
      on ? 'bg-primary-soft text-primary-soft-fg' : 'text-fg-2 hover:bg-surface-2 hover:text-fg',
    );

  return (
    <nav className="no-scrollbar mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto px-4 py-2" aria-label="Categories">
      <Link href="/products" className={link(pathname === '/products' && !active && !params.get('sort'))}>
        All products
      </Link>
      <Link href="/products?sort=newest" className={link(pathname === '/products' && params.get('sort') === 'newest')}>
        New arrivals
      </Link>
      <span className="mx-1 h-5 w-px shrink-0 bg-line" />
      {categories.map((c) => (
        <Link key={c} href={`/products?category=${encodeURIComponent(c)}`} className={link(active === c)}>
          {c}
        </Link>
      ))}
    </nav>
  );
}

export function Header() {
  const { count, subtotal, ready } = useCart();

  return (
    <header className="sticky top-0 z-30">
      <div className="bg-primary text-primary-fg">
        <p className="mx-auto flex max-w-7xl items-center justify-center gap-2 px-4 py-2 text-center text-xs font-medium">
          <Truck className="size-3.5 shrink-0" /> Free delivery on every order
          <span className="hidden sm:inline">· Cash on delivery available · Secure payments by PayU</span>
        </p>
      </div>
      <div className="border-b border-line bg-surface/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[68px] max-w-7xl items-center gap-4 px-4 lg:gap-8">
          <Logo />
          <Suspense fallback={<div className="hidden flex-1 md:block" />}>
            <SearchBox className="hidden flex-1 md:block" />
          </Suspense>
          <div className="ml-auto flex items-center gap-1 md:ml-0">
            <ThemeToggle />
            <AccountMenu />
            <Link
              href="/cart"
              className="flex items-center gap-2.5 rounded-full py-1.5 pr-1.5 pl-2.5 text-fg-2 transition-colors hover:bg-surface-2 hover:text-fg lg:pr-3"
              aria-label={`Cart, ${count} item${count === 1 ? '' : 's'}`}
            >
              <span className="relative">
                <ShoppingCart className="size-5" />
                {ready && count > 0 && (
                  <span className="absolute -top-2 -right-2.5 flex min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-[18px] font-bold text-primary-fg ring-2 ring-surface">
                    {count > 99 ? '99+' : count}
                  </span>
                )}
              </span>
              <span className="hidden text-left leading-tight lg:block">
                <span className="block text-[11px] text-muted">Cart</span>
                <span className="block text-sm font-semibold text-fg tabular-nums">{ready ? money(subtotal) : '—'}</span>
              </span>
            </Link>
          </div>
        </div>
        <div className="px-4 pb-3 md:hidden">
          <Suspense fallback={null}>
            <SearchBox />
          </Suspense>
        </div>
        <div className="hidden border-t border-line md:block">
          <Suspense fallback={null}>
            <CategoryBar />
          </Suspense>
        </div>
      </div>
    </header>
  );
}
