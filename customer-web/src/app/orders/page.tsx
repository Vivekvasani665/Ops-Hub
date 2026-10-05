'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { ChevronRight, ShoppingBag } from 'lucide-react';
import { api } from '@/lib/api';
import { dateTime, money } from '@/lib/format';
import { useProductMedia } from '@/lib/useProductMedia';
import type { Order, PageMeta } from '@/lib/types';
import { AccountLayout } from '@/components/AccountLayout';
import { RequireAuth } from '@/components/RequireAuth';
import { Alert, Button, EmptyState, PageLoader, ProductImage, StatusBadge } from '@/components/ui';

/** Shown when the PayU return could not be matched to an order (e.g. a tampered or unverifiable response). */
function PaymentNotice() {
  const outcome = useSearchParams().get('payment');
  if (outcome === 'invalid') return <Alert>Payment verification failed. If money was deducted, it will be confirmed or refunded automatically.</Alert>;
  if (outcome === 'pending') return <Alert tone="info">Payment is still processing. Your order will update once PayU confirms it.</Alert>;
  return null;
}

function OrderList() {
  const [page, setPage] = useState(1);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const media = useProductMedia(orders?.map((o) => o.items[0]?.productId ?? '').filter(Boolean) ?? []);

  useEffect(() => {
    setOrders(null);
    api.orders(page).then(
      (r) => {
        setOrders(r.data);
        setMeta(r.meta);
      },
      (err: Error) => setError(err.message),
    );
  }, [page]);

  if (error) return <Alert>Could not load your orders: {error}</Alert>;
  if (!orders) return <PageLoader />;
  if (orders.length === 0) {
    return (
      <EmptyState
        title="No orders yet"
        body="When you place an order it will show up here."
        action={
          <Link href="/products" className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
            <ShoppingBag className="size-4" /> Start shopping
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <ul className="space-y-3">
        {orders.map((o) => {
          const first = o.items[0];
          const m = first ? media.get(first.productId) : undefined;
          const awaitingPayment = !!o.payment && o.payment.payableForSeconds > 0;
          return (
            <li key={o.id}>
              <Link
                href={`/orders/${o.id}`}
                className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 transition-shadow hover:shadow-md"
              >
                <div className="shrink-0 overflow-hidden rounded-xl bg-slate-100">
                  <ProductImage src={m?.imageUrl} name={first?.name ?? 'Order'} category={m?.category ?? ''} width={160} className="size-16" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">Order #{o.orderNumber}</p>
                  <p className="truncate text-sm text-slate-500">
                    {first?.name}
                    {o.items.length > 1 && ` + ${o.items.length - 1} more`}
                  </p>
                  <p className="text-sm text-slate-500">
                    {o.itemCount} item{o.itemCount === 1 ? '' : 's'} · <span className="font-semibold text-slate-900">{money(o.totalAmount)}</span>
                  </p>
                </div>
                <div className="hidden flex-col items-end gap-1.5 sm:flex">
                  <div className="flex items-center gap-2">
                    {awaitingPayment && (
                      <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">Awaiting payment</span>
                    )}
                    <StatusBadge status={o.status} />
                  </div>
                  <span className="text-xs text-slate-400">{dateTime(o.createdAt)}</span>
                </div>
                <span className="hidden rounded-lg px-3 py-2 text-sm font-medium text-blue-600 ring-1 ring-blue-200 md:block">View Details</span>
                <ChevronRight className="size-5 shrink-0 text-slate-300 md:hidden" />
              </Link>
              <div className="mt-1 flex items-center gap-2 px-2 sm:hidden">
                <StatusBadge status={o.status} />
                {awaitingPayment && <span className="text-xs font-medium text-amber-700">Awaiting payment</span>}
              </div>
            </li>
          );
        })}
      </ul>
      {meta && meta.totalPages > 1 && (
        <nav className="flex items-center justify-center gap-3" aria-label="Pagination">
          <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-sm text-slate-500">
            Page {meta.page} of {meta.totalPages}
          </span>
          <Button variant="secondary" disabled={page >= meta.totalPages} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </nav>
      )}
    </div>
  );
}

export default function OrdersPage() {
  return (
    <RequireAuth>
      <AccountLayout>
        <div className="space-y-5">
          <h1 className="text-2xl font-bold tracking-tight">My Orders</h1>
          <Suspense fallback={null}>
            <PaymentNotice />
          </Suspense>
          <OrderList />
        </div>
      </AccountLayout>
    </RequireAuth>
  );
}
