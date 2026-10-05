import {
  allowedTransitions,
  type OrderDto,
  type OrderListItemDto,
  type OrderPaymentDto,
  type OrderStatus,
  type PaymentGateway,
  type PaymentMethod,
  type PaymentStatus,
} from '@shared';

interface PaymentLike {
  paymentMethod?: string | null;
  paymentStatus?: string | null;
  payment?: {
    gateway?: string | null;
    gatewayOrderId?: string | null;
    gatewayTransactionId?: string | null;
    instrument?: string | null;
    instrumentDetail?: string | null;
    paidAt?: Date | null;
    refundedAt?: Date | null;
  } | null;
}

export function toPaymentDto(o: PaymentLike): OrderPaymentDto | null {
  if (!o.paymentMethod) return null;
  const p = o.payment ?? {};
  return {
    method: o.paymentMethod as PaymentMethod,
    status: (o.paymentStatus ?? 'PENDING') as PaymentStatus,
    gateway: (p.gateway ?? null) as PaymentGateway | null,
    instrument: p.instrument ?? null,
    instrumentDetail: p.instrumentDetail ?? null,
    gatewayOrderId: p.gatewayOrderId ?? null,
    gatewayTransactionId: p.gatewayTransactionId ?? null,
    paidAt: p.paidAt ? new Date(p.paidAt).toISOString() : null,
    refundedAt: p.refundedAt ? new Date(p.refundedAt).toISOString() : null,
  };
}

interface OrderLike extends PaymentLike {
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
  const payment = toPaymentDto(o);
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
    payment,
    ...(o.notes ? { notes: o.notes } : {}),
    statusHistory: (o.statusHistory ?? []).map((h) => ({
      from: (h.from ?? null) as OrderStatus | null,
      to: h.to as OrderStatus,
      changedBy: { id: String(h.changedBy?.id ?? ''), name: h.changedBy?.name ?? 'System' },
      ...(h.reason ? { reason: h.reason } : {}),
      at: new Date(h.at).toISOString(),
    })),
    allowedTransitions: [...allowedTransitions(status, payment)],
    createdBy: { id: String(o.createdBy?.id ?? ''), name: o.createdBy?.name ?? 'Unknown' },
    createdAt: new Date(o.createdAt).toISOString(),
    updatedAt: new Date(o.updatedAt).toISOString(),
  };
}

export function toOrderListItemDto(o: PaymentLike & {
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
    payment: o.paymentMethod
      ? {
          method: o.paymentMethod as PaymentMethod,
          status: (o.paymentStatus ?? 'PENDING') as PaymentStatus,
          gateway: (o.payment?.gateway ?? null) as PaymentGateway | null,
          instrument: o.payment?.instrument ?? null,
        }
      : null,
    createdAt: new Date(o.createdAt).toISOString(),
  };
}
