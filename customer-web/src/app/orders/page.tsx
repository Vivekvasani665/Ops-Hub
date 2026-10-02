'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { dateTime, money } from '@/lib/format';
import type { Order, PageMeta } from '@/lib/types';
import { RequireAuth } from '@/components/RequireAuth';
import { Alert, Button, EmptyState, PageLoader, StatusBadge } from '@/components/ui';

function OrderList() {
  const [page, setPage] = useState(1);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [error, setError] = useState<string | null>(null);

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
          <Link href="/" className="inline-block rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white">
            Start shopping
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <ul className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {orders.map((o) => (
          <li key={o.id}>
            <Link href={`/orders/${o.id}`} className="flex flex-col gap-2 p-4 hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">Order #{o.orderNumber}</p>
                <p className="text-sm text-slate-500">
                  {dateTime(o.createdAt)} · {o.itemCount} item{o.itemCount === 1 ? '' : 's'}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <StatusBadge status={o.status} />
                <span className="w-28 text-right font-semibold tabular-nums">{money(o.totalAmount)}</span>
              </div>
            </Link>
          </li>
        ))}
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
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">My orders</h1>
      <RequireAuth>
        <OrderList />
      </RequireAuth>
    </div>
  );
}
