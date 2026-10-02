'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { PAYMENT_STATUS_LABEL, STATUS_LABEL, dateTime, money, paymentMethodLabel } from '@/lib/format';
import { payWithRazorpay, type PaymentOutcome, type PaymentStage, type PreferredMethod } from '@/lib/razorpay';
import type { Order, OrderStatus } from '@/lib/types';
import { RequireAuth } from '@/components/RequireAuth';
import { Alert, Button, EmptyState, PageLoader, StatusBadge, cx } from '@/components/ui';

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

const OUTCOME_MESSAGE: Record<Exclude<PaymentOutcome['kind'], 'paid'>, { tone: 'error' | 'info'; text: string }> = {
  cancelled: { tone: 'info', text: 'Payment cancelled. Your order is saved — you can pay whenever you are ready.' },
  failed: { tone: 'error', text: 'Payment failed. Please try again or choose another payment method.' },
  verification_failed: {
    tone: 'error',
    text: 'We could not verify this payment. If money was deducted, it will be confirmed or refunded automatically.',
  },
  timeout: { tone: 'error', text: 'The payment timed out. Please try again.' },
  closed: { tone: 'error', text: 'This order can no longer be paid online.' },
  network: { tone: 'error', text: 'Network error while processing the payment. We are checking its status with the bank.' },
};

function countdown(seconds: number) {
  const m = Math.floor(seconds / 60);
  return `${m}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Online payment panel of an unpaid order: retry, status check and the payment window countdown. */
function PayNow({ order, onOrder, initialOutcome }: { order: Order; onOrder: (o: Order) => void; initialOutcome: string | null }) {
  const router = useRouter();
  const [secondsLeft, setSecondsLeft] = useState(order.payment?.payableForSeconds ?? 0);
  const [stage, setStage] = useState<PaymentStage | 'checking' | null>(null);
  const [message, setMessage] = useState<{ tone: 'error' | 'info'; text: string } | null>(
    initialOutcome && initialOutcome in OUTCOME_MESSAGE ? OUTCOME_MESSAGE[initialOutcome as keyof typeof OUTCOME_MESSAGE] : null,
  );
  const [method, setMethod] = useState<PreferredMethod>('upi');

  useEffect(() => setSecondsLeft(order.payment?.payableForSeconds ?? 0), [order]);
  useEffect(() => {
    const t = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  const check = useCallback(async () => {
    setStage('checking');
    try {
      const fresh = await api.reconcilePayment(order.id);
      onOrder(fresh);
      if (fresh.payment?.status === 'PAID') setMessage(null);
      return fresh;
    } catch {
      setMessage({ tone: 'error', text: 'Could not check the payment status. Please try again in a moment.' });
      return null;
    } finally {
      setStage(null);
    }
  }, [order.id, onOrder]);

  async function pay() {
    setMessage(null);
    const outcome = await payWithRazorpay(order.id, method, setStage);
    setStage(null);
    if (outcome.kind === 'paid') {
      onOrder(outcome.order);
      router.replace(`/orders/${order.id}?placed=1`);
      return;
    }
    if (outcome.kind === 'network' && outcome.maybePaid) {
      setMessage({ tone: 'info', text: outcome.message });
      await check();
      return;
    }
    const base = OUTCOME_MESSAGE[outcome.kind];
    const text =
      outcome.kind === 'failed'
        ? `Payment failed: ${outcome.message}. Please try again or choose another payment method.`
        : 'message' in outcome
          ? outcome.message
          : base.text;
    setMessage({ tone: base.tone, text });
    if (outcome.kind === 'closed') onOrder(await api.order(order.id));
  }

  const busy = stage !== null;
  const expired = secondsLeft <= 0;

  return (
    <section className="space-y-4 rounded-2xl border border-amber-200 bg-amber-50/50 p-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-semibold">Complete your payment</h2>
        {!expired && (
          <p className="text-sm text-slate-600">
            Order held for <span className="font-medium tabular-nums">{countdown(secondsLeft)}</span>
          </p>
        )}
      </div>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      {order.payment?.lastError && !message && <Alert>Last attempt: {order.payment.lastError}</Alert>}
      {expired ? (
        <Alert>The payment window has closed. This order will be cancelled and its items released.</Alert>
      ) : (
        <>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Preferred payment method">
            {(
              [
                ['upi', 'UPI / QR'],
                ['card', 'Card'],
                ['other', 'Wallet / net banking'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={method === value}
                onClick={() => setMethod(value)}
                disabled={busy}
                className={cx(
                  'rounded-lg px-3 py-1.5 text-sm ring-1',
                  method === value ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={pay} loading={busy && stage !== 'checking'} disabled={busy}>
              {stage === 'starting'
                ? 'Loading payment…'
                : stage === 'awaiting'
                  ? 'Waiting for payment…'
                  : stage === 'verifying'
                    ? 'Verifying payment…'
                    : `Pay ${money(order.totalAmount)}`}
            </Button>
            <Button variant="secondary" onClick={check} loading={stage === 'checking'} disabled={busy}>
              I already paid — check status
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const justPlaced = params.get('placed') === '1';
  const outcome = params.get('payment');
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const reconciled = useRef(false);

  useEffect(() => {
    api.order(id).then(setOrder, setError);
  }, [id]);

  // An unpaid online order may have been paid while the browser lost the result: ask the backend to check.
  useEffect(() => {
    if (!order || reconciled.current) return;
    if (order.payment?.method === 'RAZORPAY' && order.payment.status === 'PENDING' && order.status === 'PENDING') {
      reconciled.current = true;
      api.reconcilePayment(order.id).then(setOrder, () => undefined);
    }
  }, [order]);

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
      {justPlaced &&
        (order.payment?.method === 'RAZORPAY' && order.payment.status === 'PAID' ? (
          <Alert tone="success">
            Payment successful! Your order <strong>#{order.orderNumber}</strong> is confirmed.
          </Alert>
        ) : (
          order.payment?.method !== 'RAZORPAY' && (
            <Alert tone="success">
              Thank you! Your order <strong>#{order.orderNumber}</strong> has been placed. The store will confirm it shortly.
            </Alert>
          )
        ))}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Order #{order.orderNumber}</h1>
          <p className="text-sm text-slate-500">Placed {dateTime(order.createdAt)}</p>
        </div>
        <StatusBadge status={order.status} />
      </div>

      {order.payment && order.payment.payableForSeconds > 0 && (
        <PayNow order={order} onOrder={setOrder} initialOutcome={outcome} />
      )}

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
          {order.payment && (
            <div>
              <h2 className="font-semibold">Payment</h2>
              <p className="mt-1 text-slate-600">{paymentMethodLabel(order.payment)}</p>
              <p
                className={cx(
                  'mt-0.5 font-medium',
                  order.payment.status === 'PAID' ? 'text-emerald-700' : order.payment.status === 'PENDING' ? 'text-amber-700' : 'text-rose-700',
                )}
              >
                {order.payment.method === 'COD' && order.payment.status === 'PENDING'
                  ? 'Pay on delivery'
                  : PAYMENT_STATUS_LABEL[order.payment.status]}
                {order.payment.paidAt && <span className="font-normal text-slate-400"> · {dateTime(order.payment.paidAt)}</span>}
              </p>
              {order.payment.status === 'REFUNDED' && (
                <p className="mt-1 text-xs text-slate-500">The amount has been refunded to your original payment method.</p>
              )}
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
