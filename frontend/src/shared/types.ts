import type {
  AuditAction,
  CouponType,
  EntityType,
  JobStatus,
  JobType,
  NotificationType,
  OrderStatus,
  PaymentGateway,
  PaymentMethod,
  PaymentStatus,
  Role,
  StockStatus,
} from './enums';

export interface ApiError {
  error: { code: string; message: string; details?: unknown };
}

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface CursorMeta {
  nextCursor: string | null;
  limit: number;
}

export interface UserRef {
  id: string;
  name: string;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  organization: { id: string; name: string; slug: string };
}

export interface OrderItemDto {
  productId: string;
  name: string;
  sku: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface OrderStatusChangeDto {
  from: OrderStatus | null;
  to: OrderStatus;
  changedBy: UserRef;
  reason?: string;
  at: string;
}

/** Payment of a storefront order; null on staff-created orders. */
export interface OrderPaymentDto {
  method: PaymentMethod;
  status: PaymentStatus;
  /** PAYU for online orders; null for COD. */
  gateway: PaymentGateway | null;
  /** Instrument actually used at the gateway: upi, card, wallet, netbanking, … */
  instrument: string | null;
  /** e.g. "Card •••• 1111", "HDFC Bank" */
  instrumentDetail: string | null;
  /** Our PayU transaction id (txnid) of the latest attempt. */
  gatewayOrderId: string | null;
  /** PayU's id of the successful transaction (mihpayid). */
  gatewayTransactionId: string | null;
  paidAt: string | null;
  refundedAt: string | null;
}

export interface OrderDto {
  id: string;
  orderNumber: number;
  customer: { name: string; email: string };
  items: OrderItemDto[];
  totalAmount: number;
  status: OrderStatus;
  payment: OrderPaymentDto | null;
  notes?: string;
  statusHistory: OrderStatusChangeDto[];
  allowedTransitions: OrderStatus[];
  createdBy: UserRef;
  createdAt: string;
  updatedAt: string;
}

export interface OrderListItemDto {
  id: string;
  orderNumber: number;
  customer: { name: string; email: string };
  itemCount: number;
  totalAmount: number;
  status: OrderStatus;
  payment: Pick<OrderPaymentDto, 'method' | 'status' | 'gateway' | 'instrument'> | null;
  createdAt: string;
}

export interface ProductDto {
  id: string;
  name: string;
  sku: string;
  category: string;
  price: number;
  imageUrl: string | null;
  description: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface ProductInventoryDto {
  available: number;
  reserved: number;
  reorderLevel: number;
}

export type ProductWithInventoryDto = ProductDto & { inventory: ProductInventoryDto | null };

export interface CategoryDto {
  id: string;
  name: string;
  imageUrl: string | null;
  productCount: number;
  activeProductCount: number;
  createdAt: string;
}

/** A storefront shopper, with totals over their non-cancelled orders. */
export interface CustomerDto {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: 'ACTIVE' | 'DISABLED';
  orderCount: number;
  totalSpent: number;
  lastOrderAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface CouponDto {
  id: string;
  code: string;
  description: string | null;
  type: CouponType;
  value: number;
  minOrderAmount: number;
  maxDiscount: number | null;
  startsAt: string | null;
  expiresAt: string | null;
  usageLimit: number | null;
  usedCount: number;
  isActive: boolean;
  createdAt: string;
}

export interface MediaUploadDto {
  id: string;
  url: string;
}

export interface InventoryItemDto {
  id: string;
  product: Pick<ProductDto, 'id' | 'name' | 'sku' | 'category' | 'price'>;
  available: number;
  reserved: number;
  reorderLevel: number;
  stockStatus: StockStatus;
  updatedAt: string;
}

export interface AuditLogDto {
  id: string;
  actor: UserRef | null;
  action: AuditAction;
  entityType: EntityType;
  entityId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface JobDto {
  id: string;
  type: JobType;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  availableAt: string;
  lockedBy: string | null;
  lastError: string | null;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  createdAt: string;
  completedAt: string | null;
}

export interface NotificationDto {
  id: string;
  type: NotificationType;
  severity: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  entityType: EntityType | null;
  entityId: string | null;
  createdAt: string;
}

export interface UserDto {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: 'ACTIVE' | 'DISABLED';
  lastLoginAt: string | null;
  createdAt: string;
}

export interface DashboardTrendPoint {
  date: string; // YYYY-MM-DD
  label: string; // Mon, Tue...
  orders: number;
  revenue: number;
}

export const DASHBOARD_RANGES = [7, 30] as const;
export type DashboardRange = (typeof DASHBOARD_RANGES)[number];

export interface DashboardSummaryDto {
  ordersToday: number;
  ordersYesterday: number;
  pendingOrders: number;
  processingOrders: number;
  deliveredOrders: number;
  deliveredLast7Days: number;
  deliveredPrev7Days: number;
  cancelledOrders: number;
  totalOrders: number;
  revenueToday: number;
  revenueYesterday: number;
  lowStockProducts: number;
  outOfStockProducts: number;
  /** All-time revenue of non-cancelled orders (paise). */
  totalRevenue: number;
  totalProducts: number;
  totalCustomers: number;
  /** Storefront sign-ups inside the trend window. */
  newCustomers: number;
  statusDistribution: Record<OrderStatus, number>;
  /** One point per day for the last `rangeDays` days, oldest first. */
  trend: DashboardTrendPoint[];
  rangeDays: DashboardRange;
  generatedAt: string;
}

/** Socket.IO events (server → client), always scoped to the user's organization room. */
export interface ServerToClientEvents {
  'order:created': (payload: { order: OrderListItemDto }) => void;
  'order:updated': (payload: { order: OrderListItemDto; from: OrderStatus; to: OrderStatus }) => void;
  'inventory:updated': (payload: { productId: string; available: number; reserved: number }) => void;
  'notification:created': (payload: { notification: NotificationDto }) => void;
  'job:updated': (payload: { id: string; type: JobType; status: JobStatus }) => void;
  'audit:created': (payload: { log: AuditLogDto }) => void;
}
