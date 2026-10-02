import type { Customer, Order, PageMeta, PaymentMethod, Product, RazorpayCheckout, ShippingAddress, Store } from './types';

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
  products: (params: { search?: string; category?: string; page?: number; ids?: string[] } = {}) => {
    const q = new URLSearchParams();
    if (params.search) q.set('search', params.search);
    if (params.category) q.set('category', params.category);
    if (params.page) q.set('page', String(params.page));
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

  // online payments — the backend computes the amount and verifies every payment
  startRazorpayPayment: (orderId: string) =>
    request<{ data: RazorpayCheckout }>('/payments/razorpay/order', { method: 'POST', body: json({ orderId }) }).then((r) => r.data),
  verifyRazorpayPayment: (input: { orderId: string; razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) =>
    request<{ data: Order }>('/payments/razorpay/verify', { method: 'POST', body: json(input) }).then((r) => r.data),
  reconcilePayment: (orderId: string) =>
    request<{ data: Order }>('/payments/razorpay/reconcile', { method: 'POST', body: json({ orderId }) }).then((r) => r.data),
};
