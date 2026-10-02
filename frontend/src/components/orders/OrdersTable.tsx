import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { ArrowRight, Copy, Eye, MoreVertical, ShoppingCart } from 'lucide-react';
import { nextStatuses, type OrderListItemDto } from '@/shared';
import { formatDateTime, formatMoney } from '@/lib/utils';
import { TRANSITION_LABEL } from '@/lib/status';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { Dropdown, DropdownItem } from '@/components/ui/Dropdown';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { OrderStatusBadge } from './OrderStatusBadge';

function RowActions({ order }: { order: OrderListItemDto }) {
  const navigate = useNavigate();
  const next = nextStatuses(order.status);
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
                navigate(`/orders/${order.id}`);
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
  if (isPending) return <TableSkeleton rows={5} cols={6} />;
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
    <Table>
      <THead>
        <TR className="hover:bg-transparent">
          <TH>Order #</TH>
          <TH>Customer</TH>
          <TH>Amount</TH>
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
              <OrderStatusBadge status={o.status} />
            </TD>
            <TD className="text-slate-500">{formatDateTime(o.createdAt)}</TD>
            <TD>
              <div className="flex items-center justify-end gap-2">
                <Link
                  to={`/orders/${o.id}`}
                  className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-blue-600 shadow-xs hover:bg-blue-50"
                >
                  View
                </Link>
                <RowActions order={o} />
              </div>
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
