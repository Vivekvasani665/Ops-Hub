'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, MapPin, X } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { PAYMENT_STATUS_LABEL, STATUS_LABEL, dateTime, money, paymentMethodLabel } from '@/lib/format';
import { redirectToPayu } from '@/lib/payu';
import type { Order, OrderStatus } from '@/lib/types';
import { useProductMedia } from '@/lib/useProductMedia';
import { RequireAuth } from '@/components/RequireAuth';
import { Alert, Button, EmptyState, PageLoader, ProductImage, StatusBadge, cx } from '@/components/ui';


const FLOW: OrderStatus[] = ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'];

/** Step tracker with the time each status was reached (from the order's status history). */
function Tracking({ order }: { order: Order }) {
  const reachedAt = new Map(order.timeline.map((t) => [t.status, t.at]));
  const cancelled = order.status === 'CANCELLED';
  // For a cancelled order, show the steps it got through and then the cancellation.
  const lastReached = Math.max(...FLOW.map((s, i) => (reachedAt.has(s) ? i : -1)));
  const steps: { status: OrderStatus; done: boolean }[] = cancelled
    ? [...FLOW.slice(0, Math.max(1, lastReached + 1)).map((s) => ({ status: s, done: true })), { status: 'CANCELLED' as OrderStatus, done: true }]
    : FLOW.map((s, i) => ({ status: s, done: i <= FLOW.indexOf(order.status) }));

  return (
    <ol className="flex flex-col gap-0 sm:flex-row sm:items-start" aria-label="Order tracking">
      {steps.map(({ status, done }, i) => {
        const isCancel = status === 'CANCELLED';
        const nextDone = steps[i + 1]?.done;
        return (
          <li key={status} className="relative flex flex-1 gap-3 pb-6 last:pb-0 sm:flex-col sm:items-center sm:gap-2 sm:pb-0 sm:text-center">
            {i < steps.length - 1 && (
              <span
                className={cx(
                  'absolute top-8 bottom-0 left-[15px] w-0.5 sm:top-[15px] sm:right-[-50%] sm:bottom-auto sm:left-1/2 sm:h-0.5 sm:w-auto',
                  nextDone ? (steps[i + 1]?.status === 'CANCELLED' ? 'bg-danger/50' : 'bg-success') : 'bg-surface-3',
                )}
              />
            )}
            <span
              className={cx(
                'relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full ring-4 ring-surface',
                isCancel ? 'bg-danger text-white dark:text-slate-950' : done ? 'bg-success text-white dark:text-slate-950' : 'bg-surface-3 text-subtle',
              )}
            >
              {isCancel ? <X className="size-4" /> : done ? <Check className="size-4" /> : <span className="size-2 rounded-full bg-current" />}
            </span>
            <span>
              <span className={cx('block text-sm font-semibold', done ? 'text-fg' : 'text-subtle')}>{STATUS_LABEL[status]}</span>
              <span className="block text-xs text-muted">{reachedAt.get(status) ? dateTime(reachedAt.get(status)!) : done ? '' : 'Pending'}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** `?payment=` set by the PayU return handler (/payment/success|failure) or by a redirect that could not start. */
const OUTCOME_MESSAGE: Record<string, { tone: 'error' | 'info'; title?: string; text: string }> = {
  failed: { tone: 'error', title: 'Payment Failed', text: 'Your payment was not completed.' },
  cancelled: { tone: 'info', text: 'Payment was cancelled. Your order is saved — you can pay whenever you are ready.' },
  pending: { tone: 'info', text: 'Payment is still processing. This page updates once PayU confirms it.' },
  invalid: { tone: 'error', text: 'Payment verification failed. If money was deducted, it will be confirmed or refunded automatically.' },
  init_failed: { tone: 'error', text: 'Unable to initialize payment. Please try again.' },
  closed: { tone: 'error', text: 'This order can no longer be paid online.' },
};

function countdown(seconds: number) {
  const m = Math.floor(seconds / 60);
  return `${m}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Online payment panel of an unpaid order: retry on PayU, status check and the payment window countdown. */
function PayNow({ order, onOrder, initialOutcome }: { order: Order; onOrder: (o: Order) => void; initialOutcome: string | null }) {
  const router = useRouter();
  const [secondsLeft, setSecondsLeft] = useState(order.payment?.payableForSeconds ?? 0);
  const [stage, setStage] = useState<'redirecting' | 'checking' | null>(null);
  const [message, setMessage] = useState(
    initialOutcome ? (OUTCOME_MESSAGE[initialOutcome] ?? null) : order.payment?.status === 'FAILED' ? OUTCOME_MESSAGE.failed! : null,
  );

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
      if (fresh.payment?.status === 'PAID') router.replace(`/orders/${order.id}/success`);
      else setMessage({ tone: 'info', text: 'We have not received a successful payment for this order yet.' });
    } catch {
      setMessage({ tone: 'error', text: 'Could not check the payment status. Please try again in a moment.' });
    } finally {
      setStage(null);
    }
  }, [order.id, onOrder, router]);

  async function pay() {
    setMessage(null);
    setStage('redirecting');
    const failure = await redirectToPayu(order.id);
    setStage(null);
    if (failure === 'already_paid') {
      router.replace(`/orders/${order.id}/success`);
      return;
    }
    setMessage(OUTCOME_MESSAGE[failure]!);
    if (failure === 'closed') onOrder(await api.order(order.id));
  }

  const busy = stage !== null;
  const expired = secondsLeft <= 0;
  const retry = message?.title === 'Payment Failed' || initialOutcome === 'cancelled' || initialOutcome === 'init_failed';

  return (
    <section className="space-y-4 rounded-2xl border border-warning/30 bg-warning-soft/50 p-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-semibold">{message?.title ?? 'Complete your payment'}</h2>
        {!expired && (
          <p className="text-sm text-fg-2">
            Order held for <span className="font-medium tabular-nums">{countdown(secondsLeft)}</span>
          </p>
        )}
      </div>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      {order.payment?.lastError && message?.title === 'Payment Failed' && <p className="text-xs text-muted">Reason: {order.payment.lastError}</p>}
      {expired ? (
        <Alert>The payment window has closed. This order will be cancelled and its items released.</Alert>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={pay} loading={stage === 'redirecting'} disabled={busy}>
            {stage === 'redirecting' ? 'Redirecting to PayU…' : retry ? 'Try Again' : `Pay ${money(order.totalAmount)}`}
          </Button>
          <Button variant="secondary" onClick={check} loading={stage === 'checking'} disabled={busy}>
            I already paid — check status
          </Button>
        </div>
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
  const media = useProductMedia(order?.items.map((i) => i.productId) ?? []);

  useEffect(() => {
    api.order(id).then(setOrder, setError);
  }, [id]);

  // An unpaid online order may have been paid while the browser lost the result: ask the backend to check.
  useEffect(() => {
    if (!order || reconciled.current) return;
    if (order.payment?.method === 'ONLINE' && order.payment.status !== 'PAID' && order.status === 'PENDING' && order.payment.payableForSeconds > 0) {
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

  const shipTo = order.notes?.match(/Ship to: (.*?)(?: · Phone: (.*))?$/m);
  const note = order.notes?.match(/Customer note: (.*)/)?.[1];
  const payment = order.payment;

  return (
    <div className="space-y-6">
      {justPlaced && (
        <Alert tone="success">
          {payment?.method === 'ONLINE' && payment.status === 'PAID'
            ? <>Payment successful! Your order <strong>#{order.orderNumber}</strong> is confirmed.</>
            : <>Thank you! Your order <strong>#{order.orderNumber}</strong> has been placed.</>}
        </Alert>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link href="/orders" className="mb-2 inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
            <ArrowLeft className="size-4" /> My Orders
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Order #{order.orderNumber}</h1>
          <p className="text-sm text-muted">Placed {dateTime(order.createdAt)}</p>
        </div>
        <StatusBadge status={order.status} />
      </div>

      {payment && payment.payableForSeconds > 0 && <PayNow order={order} onOrder={setOrder} initialOutcome={outcome} />}

      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <Tracking order={order} />
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <section className="rounded-2xl border border-line bg-surface">
          <h2 className="border-b border-line px-5 py-4 font-semibold">Items ({order.itemCount})</h2>
          <ul className="divide-y divide-line">
            {order.items.map((i) => {
              const m = media.get(i.productId);
              return (
                <li key={i.productId} className="flex items-center gap-4 px-5 py-4">
                  <Link href={`/products/${i.productId}`} className="shrink-0 overflow-hidden rounded-xl bg-surface-2">
                    <ProductImage src={m?.imageUrl} name={i.name} category={m?.category ?? ''} width={160} className="size-16" />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <Link href={`/products/${i.productId}`} className="line-clamp-1 font-medium hover:text-primary">
                      {i.name}
                    </Link>
                    <p className="text-sm text-muted">
                      {money(i.unitPrice)} × {i.quantity}
                    </p>
                  </div>
                  <span className="font-semibold tabular-nums">{money(i.lineTotal)}</span>
                </li>
              );
            })}
          </ul>
        </section>

        <div className="space-y-6">
          <section className="space-y-3 rounded-2xl border border-line bg-surface p-5">
            <h2 className="font-semibold">Order Summary</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Subtotal</dt>
                <dd className="tabular-nums">{money(order.totalAmount)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Shipping</dt>
                <dd className="font-medium text-success">Free</dd>
              </div>
              <div className="flex justify-between border-t border-line pt-2.5 text-base font-bold">
                <dt>Total</dt>
                <dd className="tabular-nums">{money(order.totalAmount)}</dd>
              </div>
            </dl>
          </section>

          {payment && (
            <section className="space-y-2 rounded-2xl border border-line bg-surface p-5 text-sm">
              <h2 className="font-semibold">Payment Method</h2>
              <div className="flex items-center justify-between gap-3">
                <span className="text-fg-2">{paymentMethodLabel(payment)}</span>
                <span
                  className={cx(
                    'rounded-full px-2.5 py-0.5 text-xs font-semibold',
                    payment.status === 'PAID' ? 'bg-success-soft text-success' : payment.status === 'PENDING' ? 'bg-warning-soft text-warning' : 'bg-danger-soft text-danger',
                  )}
                >
                  {payment.method === 'COD' && payment.status === 'PENDING' ? 'Pay on delivery' : PAYMENT_STATUS_LABEL[payment.status]}
                </span>
              </div>
              {payment.paidAt && <p className="text-xs text-subtle">Paid {dateTime(payment.paidAt)}</p>}
              {payment.status === 'REFUNDED' && <p className="text-xs text-muted">The amount has been refunded to your original payment method.</p>}
            </section>
          )}

          {shipTo && (
            <section className="space-y-2 rounded-2xl border border-line bg-surface p-5 text-sm">
              <h2 className="flex items-center gap-2 font-semibold">
                <MapPin className="size-4 text-subtle" /> Shipping Address
              </h2>
              <p className="text-fg-2">{shipTo[1]}</p>
              {shipTo[2] && <p className="text-muted">Phone: {shipTo[2]}</p>}
              {note && <p className="border-t border-line pt-2 text-muted">Note: {note}</p>}
            </section>
          )}
        </div>
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
