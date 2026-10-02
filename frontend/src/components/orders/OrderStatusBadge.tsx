import type { OrderStatus } from '@/shared';
import { Badge } from '@/components/ui/Badge';
import { ORDER_STATUS_META } from '@/lib/status';

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const meta = ORDER_STATUS_META[status];
  return (
    <Badge tone={meta.tone} dot>
      {meta.label}
    </Badge>
  );
}
