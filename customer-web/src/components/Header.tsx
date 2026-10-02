'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/context/auth';
import { useCart } from '@/context/cart';
import { api } from '@/lib/api';

export function Header() {
  const { customer, loading, logout } = useAuth();
  const { count, ready } = useCart();
  const router = useRouter();
  const [storeName, setStoreName] = useState('Store');

  useEffect(() => {
    api.store().then((s) => setStoreName(s.name), () => undefined);
  }, []);

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Link href="/" className="text-lg font-semibold tracking-tight text-slate-900">
          {storeName}
        </Link>

        <nav className="flex items-center gap-1 text-sm sm:gap-3">
          <Link href="/" className="hidden rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 sm:block">
            Shop
          </Link>
          {customer && (
            <Link href="/orders" className="rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900">
              My orders
            </Link>
          )}
          <Link
            href="/cart"
            className="relative rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            aria-label={`Cart, ${count} item${count === 1 ? '' : 's'}`}
          >
            Cart
            {ready && count > 0 && (
              <span className="ml-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-slate-900 px-1.5 text-xs font-medium text-white">
                {count}
              </span>
            )}
          </Link>
          {!loading &&
            (customer ? (
              <div className="flex items-center gap-2">
                <span className="hidden max-w-36 truncate text-slate-500 md:block" title={customer.email}>
                  {customer.name}
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    await logout();
                    router.push('/');
                  }}
                  className="rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <Link href="/login" className="rounded-lg bg-slate-900 px-3 py-2 font-medium text-white hover:bg-slate-800">
                Sign in
              </Link>
            ))}
        </nav>
      </div>
    </header>
  );
}
