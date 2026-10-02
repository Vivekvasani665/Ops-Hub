import {
  Boxes,
  FileText,
  LogIn,
  LogOut,
  Package,
  PackageMinus,
  PackagePlus,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShoppingCart,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import type { AuditAction, AuditLogDto, OrderStatus } from '@/shared';
import { ORDER_STATUS_META } from './status';
import { titleCase } from './utils';

export const AUDIT_ACTION_META: Record<AuditAction, { label: string; icon: LucideIcon; tone: string }> = {
  USER_LOGGED_IN: { label: 'User logged in', icon: LogIn, tone: 'bg-indigo-50 text-indigo-600 ring-indigo-100' },
  USER_LOGGED_OUT: { label: 'User logged out', icon: LogOut, tone: 'bg-slate-100 text-slate-600 ring-slate-200' },
  USER_LOGIN_FAILED: { label: 'Failed login', icon: ShieldAlert, tone: 'bg-red-50 text-red-600 ring-red-100' },
  ORDER_CREATED: { label: 'New order created', icon: ShoppingCart, tone: 'bg-orange-50 text-orange-600 ring-orange-100' },
  ORDER_STATUS_CHANGED: { label: 'Order status changed', icon: RefreshCw, tone: 'bg-blue-50 text-blue-600 ring-blue-100' },
  ORDER_CANCELLED: { label: 'Order cancelled', icon: XCircle, tone: 'bg-red-50 text-red-600 ring-red-100' },
  INVENTORY_RESERVED: { label: 'Inventory reserved', icon: PackageMinus, tone: 'bg-emerald-50 text-emerald-600 ring-emerald-100' },
  INVENTORY_RELEASED: { label: 'Inventory released', icon: PackagePlus, tone: 'bg-teal-50 text-teal-600 ring-teal-100' },
  INVENTORY_ADJUSTED: { label: 'Inventory adjusted', icon: Boxes, tone: 'bg-amber-50 text-amber-600 ring-amber-100' },
  PRODUCT_CREATED: { label: 'Product created', icon: Package, tone: 'bg-violet-50 text-violet-600 ring-violet-100' },
  JOB_RETRIED: { label: 'Job retried', icon: RotateCcw, tone: 'bg-slate-100 text-slate-600 ring-slate-200' },
};

export function auditMeta(action: string) {
  return AUDIT_ACTION_META[action as AuditAction] ?? { label: titleCase(action), icon: FileText, tone: 'bg-slate-100 text-slate-600 ring-slate-200' };
}

const str = (v: unknown): string | undefined => (typeof v === 'string' || typeof v === 'number' ? String(v) : undefined);

function statusLabel(v: unknown): string | undefined {
  const s = str(v);
  return s ? (ORDER_STATUS_META[s as OrderStatus]?.label ?? titleCase(s)) : undefined;
}

function itemsSummary(v: unknown): string | undefined {
  if (!Array.isArray(v) || v.length === 0) return undefined;
  const parts = v
    .map((i) => {
      const it = (i ?? {}) as Record<string, unknown>;
      const name = str(it.name) ?? str(it.sku);
      const qty = str(it.quantity);
      return name ? `${qty ?? 1} × ${name}` : undefined;
    })
    .filter(Boolean) as string[];
  if (parts.length === 0) return undefined;
  return parts.length > 2 ? `${parts.slice(0, 2).join(', ')} +${parts.length - 2} more` : parts.join(', ');
}

/** Human title + detail line for an audit entry. Reads metadata defensively. */
export function describeAudit(log: AuditLogDto): { title: string; detail?: string } {
  const m = log.metadata ?? {};
  const orderNo = str(m.orderNumber);
  const order = orderNo ? `Order #${orderNo}` : 'Order';
  switch (log.action) {
    case 'ORDER_CREATED':
      return {
        title: 'New order created',
        detail: [orderNo && `#${orderNo}`, str(m.customerName)].filter(Boolean).join(' - ') || undefined,
      };
    case 'ORDER_STATUS_CHANGED': {
      const from = statusLabel(m.from);
      const to = statusLabel(m.to);
      return { title: `${order} status changed`, detail: from && to ? `${from} → ${to}` : to };
    }
    case 'ORDER_CANCELLED':
      return { title: `${order} cancelled`, detail: str(m.reason) };
    case 'INVENTORY_RESERVED':
    case 'INVENTORY_RELEASED':
      return {
        title: auditMeta(log.action).label,
        detail: itemsSummary(m.items) ?? ([str(m.quantity), str(m.name) ?? str(m.sku)].filter(Boolean).join(' × ') || undefined),
      };
    case 'INVENTORY_ADJUSTED': {
      const delta = Number(m.delta);
      const sign = Number.isFinite(delta) && delta > 0 ? '+' : '';
      return {
        title: 'Inventory adjusted',
        detail: [str(m.name) ?? str(m.sku), Number.isFinite(delta) ? `${sign}${delta}` : undefined].filter(Boolean).join(' ') || undefined,
      };
    }
    case 'PRODUCT_CREATED':
      return { title: 'Product created', detail: [str(m.name), str(m.sku) && `(${str(m.sku)})`].filter(Boolean).join(' ') || undefined };
    case 'USER_LOGGED_IN':
    case 'USER_LOGGED_OUT':
    case 'USER_LOGIN_FAILED':
      return { title: auditMeta(log.action).label, detail: str(m.email) ?? log.actor?.name };
    case 'JOB_RETRIED':
      return { title: 'Job retried', detail: str(m.type) ? titleCase(str(m.type)!) : undefined };
    default:
      return { title: auditMeta(log.action).label };
  }
}

/** Compact "key: value" list for the audit table. */
export function metadataSummary(metadata: Record<string, unknown>): string {
  return Object.entries(metadata ?? {})
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => {
      if (Array.isArray(v)) return `${k}: ${itemsSummary(v) ?? `${v.length} items`}`;
      if (typeof v === 'object') return `${k}: {…}`;
      return `${k}: ${String(v)}`;
    })
    .join(' · ');
}
