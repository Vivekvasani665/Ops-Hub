import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { DashboardTrendPoint } from '@/shared';
import { formatCompactMoney, formatMoney, formatNumber } from '@/lib/utils';

const LINE = '#2563eb';
const dayLabel = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

function SalesTooltip({ active, payload }: { active?: boolean; payload?: { payload: DashboardTrendPoint & { label2: string } }[] }) {
  const p = active && payload?.[0]?.payload;
  if (!p) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-slate-500">{p.label2}</p>
      <p className="mt-0.5 text-sm font-semibold text-slate-900">{formatMoney(p.revenue)}</p>
      <p className="text-slate-500">
        {formatNumber(p.orders)} order{p.orders === 1 ? '' : 's'}
      </p>
    </div>
  );
}

/** Daily revenue (non-cancelled orders) over the selected window. One series, one axis. */
export function SalesChart({ data, height = 260 }: { data: DashboardTrendPoint[]; height?: number }) {
  const rows = data.map((d) => ({ ...d, rupees: d.revenue / 100, label2: dayLabel.format(new Date(`${d.date}T00:00:00Z`)) }));
  const dense = rows.length > 10;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={rows} margin={{ top: 8, right: 24, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={LINE} stopOpacity={0.16} />
            <stop offset="100%" stopColor={LINE} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#eef2f7" vertical={false} />
        <XAxis
          dataKey="label2"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11, fill: '#64748b' }}
          interval={dense ? 'preserveStartEnd' : 0}
          minTickGap={16}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={56}
          tick={{ fontSize: 11, fill: '#64748b' }}
          tickFormatter={(v: number) => formatCompactMoney(v * 100)}
        />
        <Tooltip content={<SalesTooltip />} cursor={{ stroke: '#94a3b8', strokeDasharray: '3 3' }} />
        <Area
          type="monotone"
          dataKey="rupees"
          name="Sales"
          stroke={LINE}
          strokeWidth={2}
          fill="url(#salesFill)"
          dot={dense ? false : { r: 4, fill: '#fff', stroke: LINE, strokeWidth: 2 }}
          activeDot={{ r: 5, fill: LINE, stroke: '#fff', strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
