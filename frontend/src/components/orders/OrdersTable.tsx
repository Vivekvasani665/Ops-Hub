import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { ArrowRight, Copy, Eye, MoreVertical, Pencil, ShoppingCart } from 'lucide-react';
import { allowedTransitions, type OrderListItemDto } from '@/shared';
import { formatDateTime, formatMoney } from '@/lib/utils';
import { useCan } from '@/features/auth/hooks';
import { TRANSITION_LABEL } from '@/lib/status';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { Dropdown, DropdownItem } from '@/components/ui/Dropdown';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { OrderStatusBadge } from './OrderStatusBadge';
import { PaymentBadge } from './PaymentBadge';
import { UpdateStatusDialog } from './UpdateStatusDialog';

function RowActions({ order, onUpdate }: { order: OrderListItemDto; onUpdate: () => void }) {
  const navigate = useNavigate();
  const next = allowedTransitions(order.status, order.payment);
  return (
    <Dropdown
      className="w-52"
      trigger={({ toggle }) => (
        <button
          onClick={toggle}
          className="cursor-pointer rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
          aria-label={`More actions for order ${order.orderNumber}`}
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      )}
    >
      {(close) => (
        <>
          <DropdownItem
            onClick={() => {
              close();
              navigate(`/orders/${order.id}`);
            }}
          >
            <Eye className="h-4 w-4" /> View details
          </DropdownItem>
          {next.map((s) => (
            <DropdownItem
              key={s}
              danger={s === 'CANCELLED'}
              onClick={() => {
                close();
                onUpdate();
              }}
            >
              <ArrowRight className="h-4 w-4" /> {TRANSITION_LABEL[s]}…
            </DropdownItem>
          ))}
          <DropdownItem
            onClick={() => {
              close();
              void navigator.clipboard?.writeText(`#${order.orderNumber}`);
              toast.success(`Copied #${order.orderNumber}`);
            }}
          >
            <Copy className="h-4 w-4" /> Copy order number
          </DropdownItem>
        </>
      )}
    </Dropdown>
  );
}

export function OrdersTable({
  orders,
  isPending,
  error,
  onRetry,
  emptyAction,
  filtered,
}: {
  orders: OrderListItemDto[] | undefined;
  isPending: boolean;
  error: unknown;
  onRetry: () => void;
  emptyAction?: ReactNode;
  filtered?: boolean;
}) {
  const canChangeStatus = useCan('orders:update_status');
  const canCancel = useCan('orders:cancel');
  const canUpdate = canChangeStatus || canCancel;
  const [editing, setEditing] = useState<OrderListItemDto | null>(null);
  if (isPending) return <TableSkeleton rows={5} cols={7} />;
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  if (!orders || orders.length === 0)
    return (
      <EmptyState
        icon={<ShoppingCart className="h-6 w-6" />}
        title={filtered ? 'No orders match your filters' : 'No orders yet'}
        description={filtered ? 'Try a different search, status or date range.' : 'Orders you create will appear here.'}
        action={emptyAction}
      />
    );
  return (
    <>
      <Table>
        <THead>
          <TR className="hover:bg-transparent">
            <TH>Order ID</TH>
            <TH>Customer</TH>
            <TH>Total Amount</TH>
            <TH>Payment Method</TH>
            <TH>Status</TH>
            <TH>Created At</TH>
            <TH className="text-right">Actions</TH>
          </TR>
        </THead>
        <TBody>
          {orders.map((o) => (
            <TR key={o.id}>
              <TD className="font-semibold text-slate-900">
                <Link to={`/orders/${o.id}`} className="hover:text-blue-600">
                  #{o.orderNumber}
                </Link>
              </TD>
              <TD>
                <span className="block text-slate-800">{o.customer.name}</span>
                <span className="block text-xs text-slate-400">{o.customer.email}</span>
              </TD>
              <TD className="text-slate-800">{formatMoney(o.totalAmount)}</TD>
              <TD>
                <PaymentBadge payment={o.payment} />
              </TD>
              <TD>
                <OrderStatusBadge status={o.status} />
              </TD>
              <TD className="text-slate-500">{formatDateTime(o.createdAt)}</TD>
              <TD>
                <div className="flex items-center justify-end gap-1.5">
                  <Link
                    to={`/orders/${o.id}`}
                    className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-blue-600 shadow-xs hover:bg-blue-50"
                  >
                    View
                  </Link>
                  {canUpdate && (
                    <button
                      onClick={() => setEditing(o)}
                      className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-blue-600"
                      aria-label={`Update status of order ${o.orderNumber}`}
                      title="Update status"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <RowActions order={o} onUpdate={() => setEditing(o)} />
                </div>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
      {editing && <UpdateStatusDialog key={editing.id} order={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
