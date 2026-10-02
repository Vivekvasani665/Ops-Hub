// Response shapes of the backend's /api/storefront endpoints (backend/src/modules/storefront).

export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';

export interface Store {
  name: string;
  currency: string;
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
