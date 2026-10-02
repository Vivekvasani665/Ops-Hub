import { AlertTriangle, FileBarChart, RefreshCw, ShoppingCart, type LucideIcon } from 'lucide-react';
import type { NotificationDto } from '@/shared';

const ICONS: Record<NotificationDto['type'], LucideIcon> = {
  ORDER_CREATED: ShoppingCart,
  ORDER_STATUS_CHANGED: RefreshCw,
  LOW_STOCK: AlertTriangle,
  DAILY_REPORT: FileBarChart,
};

const COLORS: Record<NotificationDto['severity'], string> = {
  info: 'bg-blue-500',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  error: 'bg-red-500',
};

export function NotificationIcon({ notification, size = 'md' }: { notification: NotificationDto; size?: 'sm' | 'md' }) {
  const Icon = ICONS[notification.type] ?? ShoppingCart;
  const dim = size === 'sm' ? 'h-8 w-8' : 'h-9 w-9';
  return (
    <span
      className={`flex ${dim} shrink-0 items-center justify-center rounded-full text-white shadow-sm ${COLORS[notification.severity] ?? 'bg-blue-500'}`}
    >
      <Icon className="h-4 w-4" />
    </span>
  );
}

export function notificationLink(n: NotificationDto): string | null {
  if (n.entityType === 'ORDER' && n.entityId) return `/orders/${n.entityId}`;
  if ((n.entityType === 'PRODUCT' || n.entityType === 'INVENTORY') && n.entityId) return '/inventory';
  return null;
}
