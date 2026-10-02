'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useCart } from '@/context/cart';
import { useAuth } from '@/context/auth';
import { api } from '@/lib/api';
import { money } from '@/lib/format';
import type { Product } from '@/lib/types';
import { Alert, EmptyState, PageLoader, ProductThumb } from '@/components/ui';

export default function CartPage() {
  const { lines, ready, subtotal, setQuantity, remove, sync } = useCart();
  const { customer } = useAuth();
  const [live, setLive] = useState<Map<string, Product> | null>(null);

  // Refresh prices and stock from the catalog; the cart only holds a snapshot.
  const ids = lines.map((l) => l.productId).join(',');
  useEffect(() => {
    if (!ready) return;
    if (!ids) return setLive(new Map());
    api.products({ ids: ids.split(',') }).then(
      (r) => {
        setLive(new Map(r.data.map((p) => [p.id, p])));
        sync(r.data);
      },
      () => setLive(new Map()),
    );
  }, [ids, ready, sync]);

  if (!ready) return <PageLoader />;
  if (lines.length === 0) {
    return (
      <EmptyState
        title="Your cart is empty"
        body="Browse the shop and add something you like."
        action={
          <Link href="/" className="inline-block rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white">
            Start shopping
          </Link>
        }
      />
    );
  }

  const problems = live
    ? lines.filter((l) => {
        const p = live.get(l.productId);
        return !p || !p.inStock || l.quantity > p.available;
      })
    : [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Your cart</h1>
      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <ul className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
          {lines.map((l) => {
            const p = live?.get(l.productId);
            const max = p ? Math.max(p.available, l.quantity) : l.quantity;
            const issue = live && (!p ? 'No longer available' : !p.inStock ? 'Out of stock' : l.quantity > p.available ? `Only ${p.available} available` : null);
            return (
              <li key={l.productId} className="flex gap-4 p-4">
                <ProductThumb name={l.name} category={p?.category ?? l.sku} className="size-20 shrink-0 rounded-xl text-lg" />
                <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <Link href={`/products/${l.productId}`} className="font-medium hover:underline">
                      {l.name}
                    </Link>
                    <p className="text-sm text-slate-500">{money(l.price)} each</p>
                    {issue && <p className="text-sm text-rose-600">{issue}</p>}
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center rounded-lg ring-1 ring-slate-300">
                      <button
                        type="button"
                        aria-label={`Decrease ${l.name}`}
                        className="px-3 py-1.5 text-slate-600 hover:text-slate-900"
                        onClick={() => setQuantity(l.productId, l.quantity - 1)}
                      >
                        −
                      </button>
                      <span className="w-8 text-center text-sm tabular-nums" aria-live="polite">
                        {l.quantity}
                      </span>
                      <button
                        type="button"
                        aria-label={`Increase ${l.name}`}
                        className="px-3 py-1.5 text-slate-600 hover:text-slate-900 disabled:text-slate-300"
                        disabled={l.quantity >= max}
                        onClick={() => setQuantity(l.productId, l.quantity + 1)}
                      >
                        +
                      </button>
                    </div>
                    <p className="w-24 text-right font-medium tabular-nums">{money(l.price * l.quantity)}</p>
                    <button type="button" onClick={() => remove(l.productId)} className="text-sm text-slate-500 hover:text-rose-600">
                      Remove
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <aside className="h-fit space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold">Order summary</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Subtotal</dt>
              <dd className="tabular-nums">{money(subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Shipping</dt>
              <dd>Free</dd>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold">
              <dt>Total</dt>
              <dd className="tabular-nums">{money(subtotal)}</dd>
            </div>
          </dl>
          {problems.length > 0 && <Alert>Fix the highlighted items before checking out.</Alert>}
          <Link
            href={customer ? '/checkout' : '/login?next=/checkout'}
            aria-disabled={problems.length > 0 || !live}
            className={`block rounded-lg px-4 py-2.5 text-center text-sm font-medium text-white ${
              problems.length > 0 || !live ? 'pointer-events-none bg-slate-400' : 'bg-slate-900 hover:bg-slate-800'
            }`}
          >
            {customer ? 'Proceed to checkout' : 'Sign in to checkout'}
          </Link>
          <Link href="/" className="block text-center text-sm text-slate-600 hover:text-slate-900">
            Continue shopping
          </Link>
        </aside>
      </div>
    </div>
  );
}
