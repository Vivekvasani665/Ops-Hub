import { Area, CartesianGrid, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { DashboardTrendPoint } from '@/shared';
import { formatCompactMoney, formatMoney, formatNumber } from '@/lib/utils';

const ORDERS = '#2563eb';
const REVENUE = '#16a34a';

export function ChartLegend() {
  return (
    <div className="flex items-center gap-4 text-xs text-slate-600">
      <span className="flex items-center gap-1.5">
        <span className="h-0.5 w-3.5 rounded" style={{ background: ORDERS }} /> Orders
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-0.5 w-3.5 rounded" style={{ background: REVENUE }} /> Revenue
      </span>
    </div>
  );
}

export function OrdersRevenueChart({ data, height = 240 }: { data: DashboardTrendPoint[]; height?: number }) {
  const rows = data.map((d) => ({ ...d, revenueRupees: d.revenue / 100 }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={rows} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
        <defs>
          <linearGradient id="ordersFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ORDERS} stopOpacity={0.18} />
            <stop offset="100%" stopColor={ORDERS} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={REVENUE} stopOpacity={0.12} />
            <stop offset="100%" stopColor={REVENUE} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
        <YAxis yAxisId="orders" tickLine={false} axisLine={false} allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
        <YAxis
          yAxisId="revenue"
          orientation="right"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11, fill: '#64748b' }}
          tickFormatter={(v: number) => formatCompactMoney(v * 100)}
          width={56}
        />
        <Tooltip
          contentStyle={{ borderRadius: 10, borderColor: '#e2e8f0', fontSize: 12 }}
          formatter={(value: number, name: string) =>
            name === 'Revenue' ? [formatMoney(Math.round(value * 100)), name] : [formatNumber(value), name]
          }
        />
        <Area yAxisId="revenue" type="monotone" dataKey="revenueRupees" name="Revenue" stroke={REVENUE} strokeWidth={2} fill="url(#revenueFill)" dot={{ r: 3.5, fill: '#fff', strokeWidth: 2 }} />
        <Area yAxisId="orders" type="monotone" dataKey="orders" name="Orders" stroke={ORDERS} strokeWidth={2} fill="url(#ordersFill)" dot={{ r: 3.5, fill: '#fff', strokeWidth: 2 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
