import type { Customer, Order, PageMeta, PaymentMethod, PayuCheckout, Product, ShippingAddress, Store } from './types';

const BASE = '/api/storefront';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }

  /** Field errors from the backend's zod validation (`details.fieldErrors`). */
  get fieldErrors(): Record<string, string[]> {
    const d = this.details as { fieldErrors?: Record<string, string[]> } | undefined;
    return d?.fieldErrors ?? {};
  }
}

let refreshing: Promise<boolean> | null = null;

/** One refresh at a time; concurrent 401s wait for the same attempt. */
function refreshSession(): Promise<boolean> {
  refreshing ??= fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'same-origin' })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
  });

  // Access tokens are short-lived; transparently rotate and retry once.
  if (res.status === 401 && retry && !path.startsWith('/auth/')) {
    if (await refreshSession()) return request<T>(path, init, false);
  }

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const err = body?.error;
    throw new ApiError(res.status, err?.code ?? 'HTTP_ERROR', err?.message ?? `Request failed (${res.status})`, err?.details);
  }
  return body as T;
}

const json = (data: unknown) => JSON.stringify(data);

export type ProductSort = 'name' | 'price_asc' | 'price_desc' | 'newest';

export interface ProductQuery {
  search?: string;
  categories?: string[];
  /** rupees */
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  sort?: ProductSort;
  page?: number;
  limit?: number;
  ids?: string[];
}

export const api = {
  store: () => request<{ data: Store }>('/store').then((r) => r.data),

  // auth
  me: () => request<{ data: { customer: Customer } }>('/auth/me').then((r) => r.data.customer),
  refresh: () => refreshSession(),
  login: (email: string, password: string) =>
    request<{ data: { customer: Customer } }>('/auth/login', { method: 'POST', body: json({ email, password }) }).then(
      (r) => r.data.customer,
    ),
  register: (input: { name: string; email: string; password: string; phone?: string }) =>
    request<{ data: { customer: Customer } }>('/auth/register', { method: 'POST', body: json(input) }).then(
      (r) => r.data.customer,
    ),
  logout: () => request<unknown>('/auth/logout', { method: 'POST' }),

  // catalog
  products: (params: ProductQuery = {}) => {
    const q = new URLSearchParams();
    if (params.search) q.set('search', params.search);
    if (params.categories?.length) q.set('category', params.categories.join(','));
    if (params.minPrice !== undefined) q.set('minPrice', String(params.minPrice));
    if (params.maxPrice !== undefined) q.set('maxPrice', String(params.maxPrice));
    if (params.inStock) q.set('inStock', 'true');
    if (params.sort) q.set('sort', params.sort);
    if (params.page) q.set('page', String(params.page));
    if (params.limit) q.set('limit', String(params.limit));
    if (params.ids) {
      q.set('ids', params.ids.join(','));
      q.set('limit', '60');
    }
    return request<{ data: Product[]; meta: PageMeta }>(`/products?${q}`);
  },
  product: (id: string) => request<{ data: Product }>(`/products/${encodeURIComponent(id)}`).then((r) => r.data),
  categories: () => request<{ data: string[] }>('/categories').then((r) => r.data),

  // orders
  orders: (page = 1) => request<{ data: Order[]; meta: PageMeta }>(`/orders?page=${page}`),
  order: (id: string) => request<{ data: Order }>(`/orders/${encodeURIComponent(id)}`).then((r) => r.data),
  placeOrder: (
    input: {
      items: { productId: string; quantity: number }[];
      shipping: ShippingAddress;
      notes?: string;
      paymentMethod: PaymentMethod;
    },
    idempotencyKey: string,
  ) =>
    request<{ data: Order }>('/orders', {
      method: 'POST',
      body: json(input),
      headers: { 'Idempotency-Key': idempotencyKey },
    }).then((r) => r.data),

  // online payments — the backend computes the amount, signs the PayU form and verifies every payment
  startPayuPayment: (orderId: string) =>
    request<{ data: PayuCheckout }>('/payments/payu/create', { method: 'POST', body: json({ orderId }) }).then((r) => r.data),
  reconcilePayment: (orderId: string) =>
    request<{ data: Order }>('/payments/payu/reconcile', { method: 'POST', body: json({ orderId }) }).then((r) => r.data),
};
