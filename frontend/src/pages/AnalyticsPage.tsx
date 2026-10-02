import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ORDER_STATUSES } from '@/shared';
import { useDashboardSummary } from '@/features/dashboard/hooks';
import { ORDER_STATUS_META } from '@/lib/status';
import { formatMoney, formatNumber } from '@/lib/utils';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardHeader } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { ChartLegend, OrdersRevenueChart } from '@/components/dashboard/OrdersRevenueChart';

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
    </Card>
  );
}

export function AnalyticsPage() {
  const summary = useDashboardSummary();

  if (summary.isError)
    return (
      <Card>
        <ErrorState error={summary.error} onRetry={() => summary.refetch()} />
      </Card>
    );

  const s = summary.data;
  const weekOrders = s?.trend.reduce((n, d) => n + d.orders, 0) ?? 0;
  const weekRevenue = s?.trend.reduce((n, d) => n + d.revenue, 0) ?? 0;
  const statusRows = s ? ORDER_STATUSES.map((st) => ({ name: ORDER_STATUS_META[st].label, value: s.statusDistribution[st] ?? 0, color: ORDER_STATUS_META[st].color })) : [];

  return (
    <div className="space-y-5">
      <PageHeader title="Analytics" description="Seven-day performance for your organization." />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {s ? (
          <>
            <Stat label="Orders (7 days)" value={formatNumber(weekOrders)} />
            <Stat label="Revenue (7 days)" value={formatMoney(weekRevenue)} />
            <Stat label="Avg. order value" value={weekOrders ? formatMoney(Math.round(weekRevenue / weekOrders)) : '—'} />
            <Stat label="Total orders" value={formatNumber(s.totalOrders)} />
          </>
        ) : (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)
        )}
      </div>
      <Card>
        <CardHeader title="Orders & Revenue" description="Last 7 days" action={<ChartLegend />} />
        <div className="px-3 py-4">{s ? <OrdersRevenueChart data={s.trend} height={340} /> : <Skeleton className="mx-2 h-[340px]" />}</div>
      </Card>
      <Card>
        <CardHeader title="Orders by status" description="All time" />
        <div className="px-3 py-4">
          {s ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={statusRows} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis tickLine={false} axisLine={false} allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip cursor={{ fill: '#f1f5f9' }} contentStyle={{ borderRadius: 10, borderColor: '#e2e8f0', fontSize: 12 }} formatter={(v: number) => [formatNumber(v), 'Orders']} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={56}>
                  {statusRows.map((r) => (
                    <Cell key={r.name} fill={r.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <Skeleton className="mx-2 h-[280px]" />
          )}
        </div>
      </Card>
    </div>
  );
}
