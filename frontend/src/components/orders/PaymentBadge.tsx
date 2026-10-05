import type { OrderPaymentDto } from '@/shared';
import { Badge } from '@/components/ui/Badge';
import { PAYMENT_STATUS_META, paymentMethodLabel } from '@/lib/status';

/** Payment method + status of a storefront order; staff-created orders have no payment record. */
export function PaymentBadge({ payment }: { payment: Pick<OrderPaymentDto, 'method' | 'status' | 'instrument'> | null }) {
  if (!payment) return <span className="text-slate-400">—</span>;
  const meta = PAYMENT_STATUS_META[payment.status];
  return (
    <span className="inline-flex items-center gap-2">
      <span className="text-xs font-medium text-slate-700">{paymentMethodLabel(payment)}</span>
      <Badge tone={meta.tone}>{meta.label}</Badge>
    </span>
  );
}

/** Payment status alone (orders table column). */
export function PaymentStatusBadge({ payment }: { payment: Pick<OrderPaymentDto, 'status'> | null }) {
  if (!payment) return <span className="text-slate-400">—</span>;
  const meta = PAYMENT_STATUS_META[payment.status];
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}
