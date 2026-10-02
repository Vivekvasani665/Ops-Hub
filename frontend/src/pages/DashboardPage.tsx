import { useState } from 'react';
import { Link } from 'react-router';
import { ArrowDown, ArrowRight, CalendarDays, CheckCircle2, Clock3, IndianRupee, Plus, RefreshCw, Search, Settings2, ShoppingCart } from 'lucide-react';
import { ORDER_STATUSES, type OrderStatus } from '@/shared';
import { useAuthUser } from '@/features/auth/auth-context';
import { useCan } from '@/features/auth/hooks';
import { useDashboardSummary } from '@/features/dashboard/hooks';
import { useOrders } from '@/features/orders/hooks';
import { useDebounce } from '@/hooks/useDebounce';
import { useUiStore } from '@/stores/ui.store';
import { ORDER_STATUS_META } from '@/lib/status';
import { DATE_RANGE_OPTIONS, rangeToFrom, type DateRange } from '@/lib/date-range';
import { cn, formatDateTime, formatMoney, formatNumber, greeting, percentChange } from '@/lib/utils';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { Pagination } from '@/components/ui/Pagination';
import { KpiCard, Trend } from '@/components/dashboard/KpiCard';
import { ChartLegend, OrdersRevenueChart } from '@/components/dashboard/OrdersRevenueChart';
import { StatusDonut } from '@/components/dashboard/StatusDonut';
import { InventoryAlertsCard, RecentActivityCard, RecentNotificationsCard } from '@/components/dashboard/DashboardWidgets';
import { OrdersTable } from '@/components/orders/OrdersTable';

const STATUS_OPTIONS = ORDER_STATUSES.map((s) => ({ value: s, label: ORDER_STATUS_META[s].label }));

function RecentOrders() {
  const canCreate = useCan('orders:create');
  const openCreate = useUiStore((s) => s.setCreateOrderOpen);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<OrderStatus | ''>('');
  const [range, setRange] = useState<DateRange>('7d');
  const [page, setPage] = useState(1);
  const debounced = useDebounce(search.trim(), 300);
  const params = { page, limit: 5, search: debounced, status, from: rangeToFrom(range) };
  const orders = useOrders(params);
  const filtered = Boolean(debounced || status || range !== 'all');

  return (
    <Card>
      <CardHeader
        title="Recent Orders"
        action={
          <Link to="/orders" className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700">
            View all orders <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        }
      />
      <div className="flex flex-col gap-3 px-5 pt-4 pb-4 md:flex-row md:items-center">
        <Input
          className="md:w-72"
          icon={<Search className="h-4 w-4" />}
          placeholder="Search order / customer..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <Select
          className="md:w-36"
          placeholder="All Statuses"
          options={STATUS_OPTIONS}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as OrderStatus | '');
            setPage(1);
          }}
        />
        <Select
          className="md:w-36"
          options={DATE_RANGE_OPTIONS}
          value={range}
          onChange={(e) => {
            setRange(e.target.value as DateRange);
            setPage(1);
          }}
        />
        {canCreate && (
          <Button className="md:ml-auto" onClick={() => openCreate(true)}>
            <Plus className="h-4 w-4" /> Create Order
          </Button>
        )}
      </div>
      <div className="mx-5 overflow-hidden rounded-lg border border-slate-100">
        <OrdersTable
          orders={orders.data?.data}
          isPending={orders.isPending}
          error={orders.error}
          onRetry={() => orders.refetch()}
          filtered={filtered}
        />
      </div>
      {orders.data && orders.data.meta.total > 0 && (
        <Pagination {...orders.data.meta} onPageChange={setPage} noun="orders" />
      )}
      {!orders.data && <div className="h-5" />}
    </Card>
  );
}

export function DashboardPage() {
  const user = useAuthUser();
  const summary = useDashboardSummary();
  const s = summary.data;
  const firstName = user.name.split(/\s+/)[0];
  const loading = summary.isPending;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0 space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-[26px] font-semibold tracking-tight text-slate-900">
              {greeting()}, {firstName}
            </h1>
            <p className="mt-1 text-[15px] text-slate-600">Here's what's happening with your organization today.</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500 sm:pt-2">
            <CalendarDays className="h-4 w-4" />
            <span>Last updated: {s ? formatDateTime(s.generatedAt) : '—'}</span>
            <button
              onClick={() => summary.refetch()}
              className="ml-1 cursor-pointer rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
              aria-label="Refresh dashboard"
            >
              <RefreshCw className={cn('h-4 w-4', summary.isFetching && 'animate-spin')} />
            </button>
          </div>
        </div>

        {summary.isError ? (
          <Card>
            <ErrorState error={summary.error} onRetry={() => summary.refetch()} />
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-[1fr_1fr_1fr_1fr_1.45fr]">
              <KpiCard
                loading={loading}
                label="Orders Today"
                icon={ShoppingCart}
                iconClass="bg-blue-50 text-blue-600"
                value={s ? formatNumber(s.ordersToday) : ''}
                footer={s && <Trend value={percentChange(s.ordersToday, s.ordersYesterday)} suffix="vs. yesterday" />}
              />
              <KpiCard
                loading={loading}
                label="Pending Orders"
                icon={Clock3}
                iconClass="bg-amber-50 text-amber-600"
                value={s ? formatNumber(s.pendingOrders) : ''}
                footer={<span className="text-sm font-medium text-amber-600">Needs attention</span>}
              />
              <KpiCard
                loading={loading}
                label="Processing"
                icon={Settings2}
                iconClass="bg-violet-50 text-violet-600"
                value={s ? formatNumber(s.processingOrders) : ''}
                footer={<span className="text-sm font-medium text-blue-600">Active</span>}
              />
              <KpiCard
                loading={loading}
                label="Delivered"
                icon={CheckCircle2}
                iconClass="bg-emerald-50 text-emerald-600"
                value={s ? formatNumber(s.deliveredOrders) : ''}
                footer={s && <Trend value={percentChange(s.deliveredLast7Days, s.deliveredPrev7Days)} suffix="vs. last 7 days" />}
              />
              <KpiCard
                loading={loading}
                label="Revenue Today"
                icon={IndianRupee}
                iconClass="bg-indigo-50 text-indigo-600"
                value={s ? formatMoney(s.revenueToday) : ''}
                footer={s && <Trend value={percentChange(s.revenueToday, s.revenueYesterday)} suffix="vs. yesterday" />}
                aside={
                  s && s.lowStockProducts + s.outOfStockProducts > 0 ? (
                    <Link to="/inventory?stock=low" className="mb-5 flex items-center gap-0.5 text-[11px] font-medium text-red-600 hover:underline">
                      <ArrowDown className="h-3 w-3" /> Needs restock
                    </Link>
                  ) : undefined
                }
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-[1.25fr_1.1fr_1fr]">
              <Card className="lg:col-span-2 2xl:col-span-1">
                <CardHeader title="Orders & Revenue" action={<ChartLegend />} />
                <div className="px-3 pt-4 pb-4">
                  {loading ? <Skeleton className="mx-2 h-[240px]" /> : s && <OrdersRevenueChart data={s.trend} />}
                </div>
              </Card>
              <Card>
                <CardHeader title="Order Status Distribution" />
                <div className="p-5">
                  {loading ? <Skeleton className="h-44" /> : s && <StatusDonut distribution={s.statusDistribution} />}
                </div>
              </Card>
              <InventoryAlertsCard />
            </div>
          </>
        )}

        <RecentOrders />
      </div>

      <aside className="min-w-0 space-y-5 xl:pt-[76px]">
        <RecentNotificationsCard />
        <RecentActivityCard />
      </aside>
    </div>
  );
}
