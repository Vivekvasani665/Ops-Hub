import { useState } from 'react';
import { toast } from 'sonner';
import { allowedTransitions, type OrderListItemDto, type OrderStatus } from '@/shared';
import { useUpdateOrderStatus } from '@/features/orders/hooks';
import { useCan } from '@/features/auth/hooks';
import { ORDER_STATUS_META, TRANSITION_LABEL } from '@/lib/status';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Field, Textarea } from '@/components/ui/Input';
import { OrderStatusBadge } from './OrderStatusBadge';

/** Quick status change from the orders list. Only transitions the state machine allows are offered. */
export function UpdateStatusDialog({ order, onClose }: { order: OrderListItemDto; onClose: () => void }) {
  const canUpdate = useCan('orders:update_status');
  const canCancel = useCan('orders:cancel');
  const update = useUpdateOrderStatus(order.id);
  const options = allowedTransitions(order.status, order.payment).filter((s) => (s === 'CANCELLED' ? canCancel : canUpdate));
  const [status, setStatus] = useState<OrderStatus | null>(options.find((s) => s !== 'CANCELLED') ?? options[0] ?? null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (!status) return;
    setError(null);
    update.mutate(
      { status, reason: reason.trim() || undefined },
      {
        onSuccess: () => {
          toast.success(`Order #${order.orderNumber} is now ${ORDER_STATUS_META[status].label.toLowerCase()}`);
          onClose();
        },
        onError: (e) => setError(errorMessage(e)),
      },
    );
  };

  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title={`Update order #${order.orderNumber}`}
      description={
        <span className="inline-flex items-center gap-2">
          Current status <OrderStatusBadge status={order.status} />
        </span>
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {options.length > 0 && (
            <Button variant={status === 'CANCELLED' ? 'danger' : 'primary'} onClick={submit} loading={update.isPending} disabled={!status}>
              {status ? TRANSITION_LABEL[status] : 'Update'}
            </Button>
          )}
        </>
      }
    >
      {options.length === 0 ? (
        <p className="text-sm text-slate-600">
          {order.status === 'DELIVERED' || order.status === 'CANCELLED'
            ? 'This order is closed; its status can no longer change.'
            : 'You do not have permission to change this order.'}
        </p>
      ) : (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-slate-700">Move to</span>
            <div className="grid gap-2 sm:grid-cols-2">
              {options.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition-colors',
                    status === s
                      ? s === 'CANCELLED'
                        ? 'border-red-400 bg-red-50 text-red-700'
                        : 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-slate-200 text-slate-700 hover:bg-slate-50',
                  )}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: ORDER_STATUS_META[s].color }} />
                  {ORDER_STATUS_META[s].label}
                </button>
              ))}
            </div>
          </div>
          <Field label={status === 'CANCELLED' ? 'Cancellation reason' : 'Note (optional)'}>
            <Textarea
              value={reason}
              maxLength={300}
              onChange={(e) => setReason(e.target.value)}
              placeholder={status === 'CANCELLED' ? 'Customer requested cancellation' : 'Visible in the order history'}
            />
          </Field>
          {order.payment?.method === 'RAZORPAY' && order.payment.status !== 'PAID' && (
            <p className="text-xs text-amber-700">Online payment isn't complete, so this order can only be cancelled.</p>
          )}
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        </div>
      )}
    </Dialog>
  );
}
