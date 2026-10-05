export const ORDER_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'PROCESSING',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** ONLINE covers every method the gateway offers (UPI, cards, net banking, wallets). Staff-created orders have none. */
export const PAYMENT_METHODS = ['ONLINE', 'COD'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Gateway that processed an ONLINE payment; COD orders have none. */
export const PAYMENT_GATEWAYS = ['PAYU'] as const;
export type PaymentGateway = (typeof PAYMENT_GATEWAYS)[number];

export const PAYMENT_STATUSES = ['PENDING', 'PAID', 'FAILED', 'REFUNDED'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const ROLES = ['SUPER_ADMIN', 'ORG_ADMIN', 'MANAGER', 'OPERATOR', 'VIEWER'] as const;
export type Role = (typeof ROLES)[number];

export const JOB_TYPES = [
  'SEND_ORDER_NOTIFICATION',
  'CREATE_ORDER_AUDIT',
  'GENERATE_DAILY_REPORT',
] as const;
export type JobType = (typeof JOB_TYPES)[number];

export const JOB_STATUSES = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const AUDIT_ACTIONS = [
  'USER_LOGGED_IN',
  'USER_LOGGED_OUT',
  'USER_LOGIN_FAILED',
  'ORDER_CREATED',
  'ORDER_STATUS_CHANGED',
  'ORDER_CANCELLED',
  'INVENTORY_RESERVED',
  'INVENTORY_RELEASED',
  'INVENTORY_ADJUSTED',
  'PRODUCT_CREATED',
  'PRODUCT_UPDATED',
  'PRODUCT_DELETED',
  'CATEGORY_CREATED',
  'CATEGORY_UPDATED',
  'CATEGORY_DELETED',
  'COUPON_CREATED',
  'COUPON_UPDATED',
  'COUPON_DELETED',
  'JOB_RETRIED',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const ENTITY_TYPES = ['ORDER', 'PRODUCT', 'INVENTORY', 'USER', 'JOB', 'ORGANIZATION', 'CATEGORY', 'COUPON'] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const STOCK_STATUSES = ['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK'] as const;
export type StockStatus = (typeof STOCK_STATUSES)[number];

export const NOTIFICATION_TYPES = [
  'ORDER_CREATED',
  'ORDER_STATUS_CHANGED',
  'LOW_STOCK',
  'DAILY_REPORT',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** PERCENT: `value` is a whole percentage (1–100). FIXED: `value` is an amount in paise. */
export const COUPON_TYPES = ['PERCENT', 'FIXED'] as const;
export type CouponType = (typeof COUPON_TYPES)[number];
