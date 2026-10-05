import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { ArrowLeft, CreditCard, Mail, User } from 'lucide-react';
import type { OrderStatus } from '@/shared';
import { useOrder, useUpdateOrderStatus } from '@/features/orders/hooks';
import { useCan } from '@/features/auth/hooks';
import { toApiError } from '@/lib/api';
import { ORDER_STATUS_META, PAYMENT_STATUS_META, TRANSITION_LABEL, paymentGatewayLabel, paymentMethodLabel } from '@/lib/status';
import { formatDateTime, formatMoney, formatNumber } from '@/lib/utils';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Textarea } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { OrderStatusBadge } from '@/components/orders/OrderStatusBadge';
import { PaymentBadge } from '@/components/orders/PaymentBadge';

function DetailSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-5 lg:grid-cols-3">
        <Skeleton className="h-64 lg:col-span-2" />
        <Skeleton className="h-64" />
      </div>
    </div>
  );
}

export function OrderDetailPage() {
  const { id = '' } = useParams();
  const order = useOrder(id);
  const update = useUpdateOrderStatus(id);
  const canUpdate = useCan('orders:update_status');
  const canCancel = useCan('orders:cancel');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState<OrderStatus | null>(null);

  if (order.isPending) return <DetailSkeleton />;
  if (order.isError) {
    const err = toApiError(order.error);
    return (
      <Card>
        {err.status === 404 ? (
          <EmptyState
            title="Order not found"
            description="It may have been removed, or it belongs to a different organization."
            action={
              <Link to="/orders" className="text-sm font-medium text-blue-600 hover:underline">
                Back to orders
              </Link>
            }
          />
        ) : (
          <ErrorState error={order.error} onRetry={() => order.refetch()} />
        )}
      </Card>
    );
  }

  const o = order.data;
  const actions = o.allowedTransitions.filter((s) => (s === 'CANCELLED' ? canCancel : canUpdate));

  const transition = (status: OrderStatus, why?: string) => {
    setPending(status);
    update.mutate(
      { status, reason: why || undefined },
      {
        onSuccess: (updated) => {
          toast.success(`Order #${updated.orderNumber} is now ${ORDER_STATUS_META[updated.status].label}`);
          setCancelOpen(false);
          setReason('');
        },
        onError: (e) => {
          const err = toApiError(e);
          if (err.code === 'INVALID_STATUS_TRANSITION' || err.code === 'CONCURRENT_MODIFICATION') {
            toast.error('Order changed in the meantime', { description: `${err.message} Showing the latest version.` });
            void order.refetch();
          } else {
            toast.error(err.message);
          }
        },
        onSettled: () => setPending(null),
      },
    );
  };

  const units = o.items.reduce((n, i) => n + i.quantity, 0);
  const history = [...o.statusHistory].reverse();

  return (
    <div className="space-y-5">
      <div>
        <Link to="/orders" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" /> Orders
        </Link>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Order #{o.orderNumber}</h1>
            <OrderStatusBadge status={o.status} />
            <span className="text-sm text-slate-500">Created {formatDateTime(o.createdAt)} by {o.createdBy.name}</span>
          </div>
          {actions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {actions.map((s) =>
                s === 'CANCELLED' ? (
                  <Button key={s} variant="outline" className="text-red-600 hover:bg-red-50" disabled={update.isPending} onClick={() => setCancelOpen(true)}>
                    {TRANSITION_LABEL[s]}
                  </Button>
                ) : (
                  <Button key={s} loading={pending === s} disabled={update.isPending} onClick={() => transition(s)}>
                    {TRANSITION_LABEL[s]}
                  </Button>
                ),
              )}
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Items" description={`${o.items.length} products · ${formatNumber(units)} units`} />
          <div className="mt-4">
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Product</TH>
                  <TH>SKU</TH>
                  <TH className="text-right">Unit price</TH>
                  <TH className="text-right">Qty</TH>
                  <TH className="text-right">Line total</TH>
                </TR>
              </THead>
              <TBody>
                {o.items.map((i) => (
                  <TR key={i.productId}>
                    <TD className="font-medium text-slate-800">{i.name}</TD>
                    <TD className="text-slate-500">{i.sku}</TD>
                    <TD className="text-right">{formatMoney(i.unitPrice)}</TD>
                    <TD className="text-right">{i.quantity}</TD>
                    <TD className="text-right font-medium text-slate-800">{formatMoney(i.lineTotal)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
          <div className="flex justify-end border-t border-slate-100 px-5 py-4">
            <div className="flex items-baseline gap-6">
              <span className="text-sm text-slate-500">Total</span>
              <span className="text-xl font-semibold text-slate-900">{formatMoney(o.totalAmount)}</span>
            </div>
          </div>
          {o.notes && (
            <div className="border-t border-slate-100 px-5 py-4">
              <p className="text-xs font-medium text-slate-500">Notes</p>
              <p className="mt-1 text-sm text-slate-700">{o.notes}</p>
            </div>
          )}
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Customer" />
            <CardBody className="space-y-3">
              <p className="flex items-center gap-2 text-sm text-slate-800">
                <User className="h-4 w-4 text-slate-400" /> {o.customer.name}
              </p>
              <a href={`mailto:${o.customer.email}`} className="flex items-center gap-2 text-sm text-blue-600 hover:underline">
                <Mail className="h-4 w-4 text-slate-400" /> {o.customer.email}
              </a>
            </CardBody>
          </Card>
          {o.payment && (
            <Card>
              <CardHeader title="Payment" />
              <CardBody className="space-y-3 text-sm">
                <p className="flex items-center gap-2 text-slate-800">
                  <CreditCard className="h-4 w-4 text-slate-400" /> <PaymentBadge payment={o.payment} />
                </p>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
                  <dt className="text-slate-500">Method</dt>
                  <dd className="text-slate-800">
                    {o.payment.method === 'COD' ? 'Cash on delivery (COD)' : paymentMethodLabel(o.payment)}
                    {o.payment.instrumentDetail && <span className="text-slate-500"> · {o.payment.instrumentDetail}</span>}
                  </dd>
                  <dt className="text-slate-500">Gateway</dt>
                  <dd className="text-slate-800">{paymentGatewayLabel(o.payment)}</dd>
                  <dt className="text-slate-500">Status</dt>
                  <dd className="text-slate-800">{PAYMENT_STATUS_META[o.payment.status].label}</dd>
                  {o.payment.gatewayTransactionId && (
                    <>
                      <dt className="text-slate-500">PayU payment ID</dt>
                      <dd className="font-mono break-all text-slate-800">{o.payment.gatewayTransactionId}</dd>
                    </>
                  )}
                  {o.payment.gatewayOrderId && (
                    <>
                      <dt className="text-slate-500">Transaction ID</dt>
                      <dd className="font-mono break-all text-slate-800">{o.payment.gatewayOrderId}</dd>
                    </>
                  )}
                  {o.payment.paidAt && (
                    <>
                      <dt className="text-slate-500">Paid at</dt>
                      <dd className="text-slate-800">{formatDateTime(o.payment.paidAt)}</dd>
                    </>
                  )}
                  {o.payment.refundedAt && (
                    <>
                      <dt className="text-slate-500">Refunded at</dt>
                      <dd className="text-slate-800">{formatDateTime(o.payment.refundedAt)}</dd>
                    </>
                  )}
                </dl>
                {o.payment.method === 'ONLINE' && o.payment.status !== 'PAID' && o.status === 'PENDING' && (
                  <p className="text-xs text-amber-700">Awaiting online payment. The order can be confirmed once the payment is verified.</p>
                )}
              </CardBody>
            </Card>
          )}
          <Card>
            <CardHeader title="Status timeline" />
            <CardBody>
              <ol className="space-y-0">
                {history.map((h, idx) => (
                  <li key={`${h.at}-${h.to}`} className="relative flex gap-3 pb-5 last:pb-0">
                    {idx < history.length - 1 && <span className="absolute top-4 bottom-0 left-[5px] w-px bg-slate-200" />}
                    <span className="relative mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full ring-4 ring-white" style={{ background: ORDER_STATUS_META[h.to].color }} />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-slate-800">
                        {h.from ? `${ORDER_STATUS_META[h.from].label} → ${ORDER_STATUS_META[h.to].label}` : `Created as ${ORDER_STATUS_META[h.to].label}`}
                      </span>
                      <span className="block text-xs text-slate-500">
                        {h.changedBy.name} · {formatDateTime(h.at)}
                      </span>
                      {h.reason && <span className="mt-0.5 block text-xs text-slate-600 italic">“{h.reason}”</span>}
                    </span>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        </div>
      </div>

      <Dialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        size="sm"
        title={`Cancel order #${o.orderNumber}?`}
        description="Reserved stock is released back to inventory. This cannot be undone."
        footer={
          <>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>
              Keep order
            </Button>
            <Button variant="danger" loading={pending === 'CANCELLED'} onClick={() => transition('CANCELLED', reason.trim())}>
              Cancel order
            </Button>
          </>
        }
      >
        <Field label="Reason (optional)">
          <Textarea value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="Customer requested cancellation" />
        </Field>
      </Dialog>
    </div>
  );
}
