import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { ORDER_STATUSES, type OrderStatus } from '@/shared';
import { ORDER_STATUS_META } from '@/lib/status';
import { formatNumber } from '@/lib/utils';

export function StatusDonut({ distribution }: { distribution: Record<OrderStatus, number> }) {
  const total = ORDER_STATUSES.reduce((s, k) => s + (distribution[k] ?? 0), 0);
  const rows = ORDER_STATUSES.map((s) => ({
    status: s,
    name: ORDER_STATUS_META[s].label,
    value: distribution[s] ?? 0,
    color: ORDER_STATUS_META[s].color,
  }));
  const pct = (v: number) => (total === 0 ? '0' : ((v / total) * 100).toFixed(1));

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row lg:flex-col 2xl:flex-row">
      <div className="relative h-44 w-44 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={total === 0 ? [{ name: 'None', value: 1, color: '#e2e8f0' }] : rows.filter((r) => r.value > 0)}
              dataKey="value"
              nameKey="name"
              innerRadius="64%"
              outerRadius="100%"
              paddingAngle={total === 0 ? 0 : 1}
              stroke="none"
              startAngle={90}
              endAngle={-270}
              isAnimationActive={false}
            >
              {(total === 0 ? [{ color: '#e2e8f0' }] : rows.filter((r) => r.value > 0)).map((r, i) => (
                <Cell key={i} fill={r.color} />
              ))}
            </Pie>
            {total > 0 && (
              <Tooltip
                contentStyle={{ borderRadius: 10, borderColor: '#e2e8f0', fontSize: 12 }}
                formatter={(v: number, n: string) => [`${formatNumber(v)} (${pct(v)}%)`, n]}
              />
            )}
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-semibold text-slate-900">{formatNumber(total)}</span>
          <span className="text-xs text-slate-500">Total Orders</span>
        </div>
      </div>
      <ul className="w-full min-w-0 flex-1 space-y-2.5">
        {rows.map((r) => (
          <li key={r.status} className="flex items-center gap-2 text-xs">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: r.color }} />
            <span className="flex-1 text-slate-600">{r.name}</span>
            <span className="text-slate-500 tabular-nums">
              {formatNumber(r.value)} ({pct(r.value)}%)
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
