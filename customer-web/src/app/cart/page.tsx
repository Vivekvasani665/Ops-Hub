'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight, Minus, Plus, ShieldCheck, ShoppingCart, Trash2 } from 'lucide-react';
import { useCart } from '@/context/cart';
import { useAuth } from '@/context/auth';
import { api } from '@/lib/api';
import { money } from '@/lib/format';
import type { Product } from '@/lib/types';
import { CheckoutSteps } from '@/components/CheckoutSteps';
import { PaymentMarks } from '@/components/Footer';
import { Alert, EmptyState, PageLoader, ProductImage, cx } from '@/components/ui';

export default function CartPage() {
  const { lines, ready, subtotal, count, setQuantity, remove, sync } = useCart();
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
          <Link href="/products" className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
            <ShoppingCart className="size-4" /> Start shopping
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
  const blocked = problems.length > 0 || !live;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight">
          Shopping Cart <span className="text-base font-normal text-slate-400">({count} item{count === 1 ? '' : 's'})</span>
        </h1>
        <CheckoutSteps current={0} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
          {lines.map((l) => {
            const p = live?.get(l.productId);
            const max = p ? Math.max(p.available, l.quantity) : l.quantity;
            const issue = live && (!p ? 'No longer available' : !p.inStock ? 'Out of stock' : l.quantity > p.available ? `Only ${p.available} available` : null);
            return (
              <li key={l.productId} className="flex gap-4 p-4 sm:p-5">
                <Link href={`/products/${l.productId}`} className="shrink-0 overflow-hidden rounded-xl bg-slate-100">
                  <ProductImage src={p?.imageUrl ?? l.imageUrl} name={l.name} category={p?.category ?? l.category ?? ''} width={200} className="size-20 sm:size-24" />
                </Link>
                <div className="flex min-w-0 flex-1 flex-col justify-between gap-3 sm:flex-row sm:items-center">
                  <div className="min-w-0">
                    <Link href={`/products/${l.productId}`} className="line-clamp-2 font-semibold hover:text-blue-600">
                      {l.name}
                    </Link>
                    <p className="text-sm text-slate-500">{money(l.price)} each</p>
                    {issue && <p className="mt-1 text-sm font-medium text-rose-600">{issue}</p>}
                  </div>
                  <div className="flex items-center justify-between gap-4 sm:justify-end">
                    <div className="flex items-center rounded-lg ring-1 ring-slate-300">
                      <button type="button" aria-label={`Decrease ${l.name}`} className="p-2 text-slate-600 hover:text-slate-900" onClick={() => setQuantity(l.productId, l.quantity - 1)}>
                        <Minus className="size-3.5" />
                      </button>
                      <span className="w-8 text-center text-sm font-semibold tabular-nums" aria-live="polite">
                        {l.quantity}
                      </span>
                      <button
                        type="button"
                        aria-label={`Increase ${l.name}`}
                        className="p-2 text-slate-600 hover:text-slate-900 disabled:text-slate-300"
                        disabled={l.quantity >= max}
                        onClick={() => setQuantity(l.productId, l.quantity + 1)}
                      >
                        <Plus className="size-3.5" />
                      </button>
                    </div>
                    <p className="w-24 text-right font-bold tabular-nums">{money(l.price * l.quantity)}</p>
                    <button type="button" onClick={() => remove(l.productId)} aria-label={`Remove ${l.name}`} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600">
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <aside className="h-fit space-y-4 rounded-2xl border border-slate-200 bg-white p-5 lg:sticky lg:top-24">
          <h2 className="text-lg font-semibold">Order Summary</h2>
          <dl className="space-y-2.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Subtotal</dt>
              <dd className="tabular-nums">{money(subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Shipping</dt>
              <dd className="font-medium text-emerald-600">Free</dd>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-3 text-base font-bold">
              <dt>Total</dt>
              <dd className="tabular-nums">{money(subtotal)}</dd>
            </div>
          </dl>
          {problems.length > 0 && <Alert>Fix the highlighted items before checking out.</Alert>}
          <Link
            href={customer ? '/checkout' : '/login?next=/checkout'}
            aria-disabled={blocked}
            className={cx(
              'flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold text-white',
              blocked ? 'pointer-events-none bg-blue-300' : 'bg-blue-600 hover:bg-blue-700',
            )}
          >
            {customer ? 'Proceed to Checkout' : 'Sign in to Checkout'} <ArrowRight className="size-4" />
          </Link>
          <Link href="/products" className="block text-center text-sm font-medium text-slate-600 hover:text-slate-900">
            Continue shopping
          </Link>
          <div className="space-y-2 border-t border-slate-100 pt-4">
            <p className="flex items-center gap-2 text-xs text-slate-500">
              <ShieldCheck className="size-4 text-emerald-600" /> Secure checkout powered by PayU
            </p>
            <PaymentMarks />
          </div>
        </aside>
      </div>
    </div>
  );
}
