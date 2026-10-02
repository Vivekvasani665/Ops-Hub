// Response shapes of the backend's /api/storefront endpoints (backend/src/modules/storefront).

export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';

export type PaymentMethod = 'RAZORPAY' | 'COD';
export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';

export interface Store {
  name: string;
  currency: string;
  /** `online` is false until the backend has Razorpay keys configured. */
  payments: { cod: boolean; online: boolean };
}

export interface OrderPayment {
  method: PaymentMethod;
  status: PaymentStatus;
  /** Instrument used at Razorpay: upi, card, wallet, netbanking, … */
  instrument: string | null;
  instrumentDetail: string | null;
  paidAt: string | null;
  lastError: string | null;
  /** Seconds left to complete an online payment; 0 when the order no longer accepts one. */
  payableForSeconds: number;
}

/** What the backend returns to open Razorpay Checkout. Amount is the order total from the database. */
export interface RazorpayCheckout {
  keyId: string;
  razorpayOrderId: string;
  amount: number;
  currency: string;
  orderNumber: number;
  expiresInSeconds: number;
  storeName: string;
  prefill: { name: string; email: string; contact?: string };
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string | null;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  /** minor units (paise) */
  price: number;
  imageUrl: string | null;
  description: string | null;
  available: number;
  inStock: boolean;
}

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface OrderItem {
  productId: string;
  name: string;
  sku: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface Order {
  id: string;
  orderNumber: number;
  status: OrderStatus;
  items: OrderItem[];
  itemCount: number;
  totalAmount: number;
  /** null only for orders created by staff. */
  payment: OrderPayment | null;
  notes: string | null;
  timeline: { status: OrderStatus; at: string }[];
  createdAt: string;
  updatedAt: string;
}

export interface ShippingAddress {
  fullName: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
}
