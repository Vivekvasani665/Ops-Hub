'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CalendarDays, CheckCircle2, Clock3, CreditCard, Hash, IndianRupee } from 'lucide-react';
import { api } from '@/lib/api';
import { dateTime, money, paymentMethodLabel } from '@/lib/format';
import type { Order } from '@/lib/types';
import { RequireAuth } from '@/components/RequireAuth';
import { Alert, PageLoader } from '@/components/ui';

function Success() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.order(id).then(setOrder, (err: Error) => setError(err.message));
  }, [id]);

  if (error) return <Alert>Could not load your order: {error}</Alert>;
  if (!order) return <PageLoader />;

  // Reached only after COD placement or a server-verified payment; guard against a stale link anyway.
  const awaitingPayment = order.payment?.method === 'ONLINE' && (order.payment.status === 'PENDING' || order.payment.status === 'FAILED');

  const facts = [
    { icon: Hash, label: 'Order ID', value: `#${order.orderNumber}` },
    { icon: CalendarDays, label: 'Order Date', value: dateTime(order.createdAt) },
    { icon: IndianRupee, label: 'Total', value: money(order.totalAmount) },
    { icon: CreditCard, label: 'Payment', value: order.payment ? paymentMethodLabel(order.payment) : '—' },
  ];

  return (
    <div className="mx-auto max-w-lg py-4">
      <div className="rounded-3xl border border-line bg-surface p-6 text-center sm:p-10">
        {awaitingPayment ? (
          <Clock3 className="mx-auto size-16 text-warning" strokeWidth={1.5} />
        ) : (
          <span className="mx-auto flex size-20 items-center justify-center rounded-full bg-success-soft">
            <CheckCircle2 className="size-12 text-success" strokeWidth={1.75} />
          </span>
        )}
        <h1 className="mt-5 text-2xl font-bold tracking-tight">{awaitingPayment ? 'Payment pending' : 'Order Placed Successfully!'}</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
          {awaitingPayment
            ? 'We have not received your payment yet. Complete it from the order page.'
            : order.payment?.status === 'PAID'
              ? 'Thank you for shopping with us. Your payment is confirmed and your order is being processed.'
              : 'Thank you for shopping with us. Your order has been placed and will be confirmed shortly.'}
        </p>

        <dl className="mt-8 grid grid-cols-2 gap-4 rounded-2xl border border-line p-4 text-left">
          {facts.map(({ icon: Icon, label, value }) => (
            <div key={label} className="flex items-start gap-2.5">
              <Icon className="mt-0.5 size-4 shrink-0 text-subtle" />
              <div className="min-w-0">
                <dt className="text-xs text-muted">{label}</dt>
                <dd className="truncate text-sm font-semibold text-fg">{value}</dd>
              </div>
            </div>
          ))}
        </dl>

        <div className="mt-8 space-y-3">
          <Link href={`/orders/${order.id}`} className="block rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-fg hover:bg-primary-hover">
            {awaitingPayment ? 'Complete payment' : 'View Order'}
          </Link>
          <Link href="/products" className="block rounded-xl px-4 py-3 text-sm font-semibold text-primary ring-1 ring-primary hover:bg-primary-soft">
            Continue Shopping
          </Link>
          <Link href="/orders" className="inline-block pt-1 text-sm font-medium text-primary hover:underline">
            My Orders
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function OrderSuccessPage() {
  return (
    <RequireAuth>
      <Success />
    </RequireAuth>
  );
}
