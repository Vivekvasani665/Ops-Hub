import { nextStatuses, type OrderDto, type OrderListItemDto, type OrderStatus } from '@shared';

interface OrderLike {
  _id: unknown;
  orderNumber: number;
  customer: { name: string; email: string };
  items: { productId: unknown; name: string; sku: string; unitPrice: number; quantity: number; lineTotal: number }[];
  totalAmount: number;
  status: string;
  notes?: string | null;
  statusHistory?: {
    from?: string | null;
    to: string;
    changedBy?: { id?: unknown; name?: string | null } | null;
    reason?: string | null;
    at: Date;
  }[];
  createdBy?: { id?: unknown; name?: string | null } | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toOrderDto(o: OrderLike): OrderDto {
  const status = o.status as OrderStatus;
  return {
    id: String(o._id),
    orderNumber: o.orderNumber,
    customer: { name: o.customer.name, email: o.customer.email },
    items: o.items.map((i) => ({
      productId: String(i.productId),
      name: i.name,
      sku: i.sku,
      unitPrice: i.unitPrice,
      quantity: i.quantity,
      lineTotal: i.lineTotal,
    })),
    totalAmount: o.totalAmount,
    status,
    ...(o.notes ? { notes: o.notes } : {}),
    statusHistory: (o.statusHistory ?? []).map((h) => ({
      from: (h.from ?? null) as OrderStatus | null,
      to: h.to as OrderStatus,
      changedBy: { id: String(h.changedBy?.id ?? ''), name: h.changedBy?.name ?? 'System' },
      ...(h.reason ? { reason: h.reason } : {}),
      at: new Date(h.at).toISOString(),
    })),
    allowedTransitions: [...nextStatuses(status)],
    createdBy: { id: String(o.createdBy?.id ?? ''), name: o.createdBy?.name ?? 'Unknown' },
    createdAt: new Date(o.createdAt).toISOString(),
    updatedAt: new Date(o.updatedAt).toISOString(),
  };
}

export function toOrderListItemDto(o: {
  _id: unknown;
  orderNumber: number;
  customer: { name: string; email: string };
  items?: { quantity: number }[];
  itemCount?: number;
  totalAmount: number;
  status: string;
  createdAt: Date;
}): OrderListItemDto {
  return {
    id: String(o._id),
    orderNumber: o.orderNumber,
    customer: { name: o.customer.name, email: o.customer.email },
    itemCount: o.itemCount ?? (o.items ?? []).reduce((n, i) => n + i.quantity, 0),
    totalAmount: o.totalAmount,
    status: o.status as OrderStatus,
    createdAt: new Date(o.createdAt).toISOString(),
  };
}
