'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { STATUS_LABEL, dateTime, money } from '@/lib/format';
import type { Order, OrderStatus } from '@/lib/types';
import { RequireAuth } from '@/components/RequireAuth';
import { Alert, EmptyState, PageLoader, StatusBadge, cx } from '@/components/ui';

const FLOW: OrderStatus[] = ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'];

function Progress({ order }: { order: Order }) {
  if (order.status === 'CANCELLED') return <Alert>This order was cancelled.</Alert>;
  const current = FLOW.indexOf(order.status);
  return (
    <ol className="grid grid-cols-5 gap-2" aria-label="Order progress">
      {FLOW.map((s, i) => (
        <li key={s} className="space-y-2">
          <div className={cx('h-1.5 rounded-full', i <= current ? 'bg-emerald-500' : 'bg-slate-200')} />
          <p className={cx('text-xs', i <= current ? 'font-medium text-slate-900' : 'text-slate-400')}>{STATUS_LABEL[s]}</p>
        </li>
      ))}
    </ol>
  );
}

function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const justPlaced = useSearchParams().get('placed') === '1';
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    api.order(id).then(setOrder, setError);
  }, [id]);

  if (error) {
    return error instanceof ApiError && error.status === 404 ? (
      <EmptyState title="Order not found" action={<Link href="/orders" className="text-sm font-medium underline">View my orders</Link>} />
    ) : (
      <Alert>Could not load order: {error.message}</Alert>
    );
  }
  if (!order) return <PageLoader />;

  const shipTo = order.notes?.match(/Ship to: (.*)/)?.[1];
  const note = order.notes?.match(/Customer note: (.*)/)?.[1];

  return (
    <div className="space-y-6">
      {justPlaced && (
        <Alert tone="success">
          Thank you! Your order <strong>#{order.orderNumber}</strong> has been placed. The store will confirm it shortly.
        </Alert>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Order #{order.orderNumber}</h1>
          <p className="text-sm text-slate-500">Placed {dateTime(order.createdAt)}</p>
        </div>
        <StatusBadge status={order.status} />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <Progress order={order} />
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Item</th>
                <th className="px-4 py-3 text-right font-medium">Qty</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {order.items.map((i) => (
                <tr key={i.productId}>
                  <td className="px-4 py-3">
                    <p className="font-medium">{i.name}</p>
                    <p className="text-slate-500">{money(i.unitPrice)} each</p>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{i.quantity}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{money(i.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 font-semibold">
                <td className="px-4 py-3" colSpan={2}>
                  Total
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{money(order.totalAmount)}</td>
              </tr>
            </tfoot>
          </table>
        </section>

        <aside className="h-fit space-y-5 rounded-2xl border border-slate-200 bg-white p-5 text-sm">
          {shipTo && (
            <div>
              <h2 className="font-semibold">Shipping to</h2>
              <p className="mt-1 text-slate-600">{shipTo}</p>
            </div>
          )}
          {note && (
            <div>
              <h2 className="font-semibold">Your note</h2>
              <p className="mt-1 text-slate-600">{note}</p>
            </div>
          )}
          <div>
            <h2 className="font-semibold">History</h2>
            <ul className="mt-2 space-y-1.5">
              {order.timeline.map((t, i) => (
                <li key={i} className="flex justify-between gap-3 text-slate-600">
                  <span>{STATUS_LABEL[t.status]}</span>
                  <span className="text-slate-400">{dateTime(t.at)}</span>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>

      <div className="flex gap-4 text-sm">
        <Link href="/orders" className="font-medium text-slate-900 hover:underline">
          ← All orders
        </Link>
        <Link href="/" className="text-slate-600 hover:text-slate-900">
          Continue shopping
        </Link>
      </div>
    </div>
  );
}

export default function OrderPage() {
  return (
    <RequireAuth>
      <Suspense fallback={<PageLoader />}>
        <OrderDetail />
      </Suspense>
    </RequireAuth>
  );
}
