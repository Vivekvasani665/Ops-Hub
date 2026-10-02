import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ArrowRight, Box, IndianRupee, ShoppingCart, Users, type LucideIcon } from 'lucide-react';
import { DASHBOARD_RANGES, type DashboardRange } from '@/shared';
import { useAuthUser } from '@/features/auth/auth-context';
import { useCan } from '@/features/auth/hooks';
import { useDashboardSummary } from '@/features/dashboard/hooks';
import { useOrders } from '@/features/orders/hooks';
import { cn, formatMoney, formatNumber, greeting } from '@/lib/utils';
import { Card, CardHeader } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { SalesChart } from '@/components/dashboard/SalesChart';
import { StatusDonut } from '@/components/dashboard/StatusDonut';
import { InventoryAlertsCard, RecentActivityCard } from '@/components/dashboard/DashboardWidgets';
import { OrderStatusBadge } from '@/components/orders/OrderStatusBadge';

const RANGE_OPTIONS = DASHBOARD_RANGES.map((d) => ({ value: String(d), label: `Last ${d} days` }));

function StatCard({
  label,
  value,
  icon: Icon,
  iconClass,
  note,
  noteClass = 'text-emerald-600',
  loading,
  to,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  iconClass: string;
  note?: ReactNode;
  noteClass?: string;
  loading: boolean;
  to?: string;
}) {
  const body = (
    <Card className={cn('flex h-full items-start gap-4 p-5', to && 'transition-shadow hover:shadow-md')}>
      <span className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-xl', iconClass)}>
        <Icon className="h-[22px] w-[22px]" strokeWidth={1.9} />
      </span>
      <div className="min-w-0">
        <p className="text-sm text-slate-500">{label}</p>
        {loading ? (
          <div className="mt-2 space-y-2">
            <Skeleton className="h-7 w-28" />
            <Skeleton className="h-3.5 w-20" />
          </div>
        ) : (
          <>
            <p className="mt-1 truncate text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
            {note && <p className={cn('mt-1 text-xs font-medium', noteClass)}>{note}</p>}
          </>
        )}
      </div>
    </Card>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

function RecentOrdersCard() {
  const orders = useOrders({ page: 1, limit: 6 });
  const rows = orders.data?.data ?? [];
  return (
    <Card className="flex h-full flex-col">
      <CardHeader
        title="Recent Orders"
        action={
          <Link to="/orders" className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700">
            View all <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        }
      />
      <div className="flex-1 px-5 pt-3 pb-3">
        {orders.isPending ? (
          <div className="space-y-4 py-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-5" />
            ))}
          </div>
        ) : orders.isError ? (
          <ErrorState error={orders.error} onRetry={() => orders.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState icon={<ShoppingCart className="h-6 w-6" />} title="No orders yet" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((o) => (
              <li key={o.id}>
                <Link to={`/orders/${o.id}`} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 py-3 hover:opacity-80 sm:grid-cols-[72px_1fr_88px_100px]">
                  <span className="text-sm font-semibold text-slate-900">#{o.orderNumber}</span>
                  <span className="truncate text-sm text-slate-600">{o.customer.name}</span>
                  <span className="hidden text-right text-sm text-slate-800 sm:block">{formatMoney(o.totalAmount)}</span>
                  <span className="text-right">
                    <OrderStatusBadge status={o.status} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

export function DashboardPage() {
  const user = useAuthUser();
  const canInventory = useCan('inventory:read');
  const canCustomers = useCan('customers:read');
  const [days, setDays] = useState<DashboardRange>(7);
  const summary = useDashboardSummary(days);
  const s = summary.data;
  const loading = summary.isPending;
  const periodSales = s?.trend.reduce((sum, d) => sum + d.revenue, 0) ?? 0;
  const periodOrders = s?.trend.reduce((sum, d) => sum + d.orders, 0) ?? 0;
  const restock = s ? s.lowStockProducts + s.outOfStockProducts : 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">
            {greeting()}, {user.name.split(/\s+/)[0]}! Here's what's happening with your store.
          </p>
        </div>
        <Select
          className="sm:w-40"
          aria-label="Date range"
          options={RANGE_OPTIONS}
          value={String(days)}
          onChange={(e) => setDays(Number(e.target.value) as DashboardRange)}
        />
      </div>

      {summary.isError ? (
        <Card>
          <ErrorState error={summary.error} onRetry={() => summary.refetch()} />
        </Card>
      ) : (
        <>
          <div className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4', summary.isPlaceholderData && 'opacity-70')}>
            <StatCard
              loading={loading}
              label="Total Sales"
              icon={IndianRupee}
              iconClass="bg-emerald-50 text-emerald-600"
              value={s ? formatMoney(s.totalRevenue) : ''}
              note={`+${formatMoney(periodSales)} in last ${days} days`}
            />
            <StatCard
              loading={loading}
              label="Total Orders"
              icon={ShoppingCart}
              iconClass="bg-pink-50 text-pink-600"
              value={s ? formatNumber(s.totalOrders) : ''}
              note={`+${formatNumber(periodOrders)} in last ${days} days`}
              to="/orders"
            />
            <StatCard
              loading={loading}
              label="Total Customers"
              icon={Users}
              iconClass="bg-blue-50 text-blue-600"
              value={s ? formatNumber(s.totalCustomers) : ''}
              note={s && `+${formatNumber(s.newCustomers)} new in last ${days} days`}
              to={canCustomers ? '/customers' : undefined}
            />
            <StatCard
              loading={loading}
              label="Total Products"
              icon={Box}
              iconClass="bg-violet-50 text-violet-600"
              value={s ? formatNumber(s.totalProducts) : ''}
              note={restock > 0 ? `${formatNumber(restock)} need restock` : 'All products in stock'}
              noteClass={restock > 0 ? 'text-amber-600' : 'text-emerald-600'}
              to="/products"
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <Card>
              <CardHeader
                title="Sales Overview"
                description={`Daily sales, last ${days} days`}
                action={
                  <div className="text-right">
                    <p className="text-lg font-semibold text-slate-900">{s ? formatMoney(periodSales) : '—'}</p>
                    <p className="text-xs text-slate-500">Total sales</p>
                  </div>
                }
              />
              <div className="px-3 pt-2 pb-4">
                {loading ? <Skeleton className="mx-2 h-[260px]" /> : s && <SalesChart data={s.trend} />}
              </div>
            </Card>
            <RecentOrdersCard />
          </div>

          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            <Card>
              <CardHeader title="Order Status" description="All orders by current status" />
              <div className="p-5">{loading ? <Skeleton className="h-44" /> : s && <StatusDonut distribution={s.statusDistribution} />}</div>
            </Card>
            {canInventory && <InventoryAlertsCard />}
            <RecentActivityCard />
          </div>
        </>
      )}
    </div>
  );
}
