import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { OrderDto } from '@/shared';
import { getSocket } from '@/lib/socket';
import { orderKeys } from '@/features/orders/hooks';
import { dashboardKeys } from '@/features/dashboard/hooks';
import { inventoryKeys } from '@/features/inventory/hooks';
import { productKeys } from '@/features/products/hooks';
import { auditKeys } from '@/features/audit/hooks';
import { jobKeys } from '@/features/jobs/hooks';
import { notificationKeys } from '@/features/misc/hooks';
import { nextStatuses } from '@/shared';

/** Connects the org-scoped socket and keeps the TanStack Query cache fresh. */
export function useRealtime(enabled: boolean) {
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const socket = getSocket();
    const invalidate = (key: readonly unknown[]) => void qc.invalidateQueries({ queryKey: key });

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('order:created', () => {
      invalidate(orderKeys.lists());
      invalidate(dashboardKeys.all);
    });
    socket.on('order:updated', ({ order, to }) => {
      qc.setQueryData<OrderDto>(orderKeys.detail(order.id), (prev) =>
        prev && prev.status !== to
          ? { ...prev, status: to, allowedTransitions: [...nextStatuses(to)] }
          : prev,
      );
      invalidate(orderKeys.detail(order.id));
      invalidate(orderKeys.lists());
      invalidate(dashboardKeys.all);
    });
    socket.on('inventory:updated', () => {
      invalidate(inventoryKeys.all);
      invalidate(productKeys.all);
      invalidate(dashboardKeys.all);
    });
    socket.on('notification:created', ({ notification }) => {
      invalidate(notificationKeys.all);
      const show =
        notification.severity === 'error'
          ? toast.error
          : notification.severity === 'warning'
            ? toast.warning
            : notification.severity === 'success'
              ? toast.success
              : toast.info;
      show(notification.title, { description: notification.message });
    });
    socket.on('job:updated', () => invalidate(jobKeys.all));
    socket.on('audit:created', () => invalidate(auditKeys.all));

    socket.connect();
    return () => {
      socket.off();
      socket.disconnect();
      setConnected(false);
    };
  }, [enabled, qc]);

  return { connected };
}
