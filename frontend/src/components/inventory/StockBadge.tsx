import type { StockStatus } from '@/shared';
import { Badge } from '@/components/ui/Badge';
import { STOCK_STATUS_META } from '@/lib/status';

export function StockBadge({ status, available }: { status: StockStatus; available?: number }) {
  const meta = STOCK_STATUS_META[status];
  const label =
    status === 'LOW_STOCK' && available !== undefined && available <= 3 ? `${available} left` : meta.label;
  return (
    <Badge tone={status === 'LOW_STOCK' && label.endsWith('left') ? 'red' : meta.tone}>{label}</Badge>
  );
}
