# OpsHub REST API

Base URL: `/api` (the frontend dev server proxies `/api` and `/socket.io` to the backend, default `http://localhost:4000`).

Auth uses **httpOnly cookies** (`opshub_at` access token for 15 min, `opshub_rt` refresh token for 7 days, rotated on every refresh). The browser never sees the tokens. Clients send `withCredentials: true`.
When an access token expires, the API returns `401 { error: { code: "TOKEN_EXPIRED" } }`. The client calls `POST /api/auth/refresh` once and retries the request.

All money is an **integer in minor units (paise)**. ₹69,999 is `6999900`.

## Envelope

- Success: `{ "data": ..., "meta"?: ... }`
- Error: `{ "error": { "code": "SOME_CODE", "message": "Human readable", "details"?: any } }`

Common codes: `VALIDATION_ERROR` (400), `UNAUTHENTICATED` / `TOKEN_EXPIRED` (401), `FORBIDDEN` (403),
`NOT_FOUND` (404), `INVALID_STATUS_TRANSITION` / `INSUFFICIENT_STOCK` / `CONCURRENT_MODIFICATION` /
`IDEMPOTENCY_IN_PROGRESS` (409), `IDEMPOTENCY_KEY_MISMATCH` (422), `RATE_LIMITED` (429), `ACCOUNT_LOCKED` (423).

## Auth
| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/auth/login` | `{ email, password }` | `{ data: { user: AuthUser } }` + cookies |
| POST | `/auth/refresh` | – | `{ data: { user: AuthUser } }` + rotated cookies |
| POST | `/auth/logout` | – | `{ data: { ok: true } }` |
| GET | `/auth/me` | – | `{ data: { user: AuthUser } }` |

## Dashboard
`GET /dashboard/summary` returns `{ data: DashboardSummaryDto }`. `trend` holds the last 7 days, oldest first.

## Orders
- `GET /orders?page=1&limit=10&status=PENDING&search=rahul&from=2026-09-01&to=2026-10-02` returns `{ data: OrderListItemDto[], meta: PageMeta }`.
  `search` matches the order number (`1024` / `#1024`), or a prefix of the customer name or email.
- `GET /orders/:id` returns `{ data: OrderDto }` (includes `allowedTransitions` for the current status).
- `POST /orders` with the header **`Idempotency-Key: <uuid>`** (required) and body `CreateOrderInput` returns `201 { data: OrderDto }`.
  A retry with the same key and body replays the original response (`Idempotent-Replayed: true` header).
- `PATCH /orders/:id/status` with body `{ status, reason? }` returns `{ data: OrderDto }`.
  An online (Razorpay) order that is not yet `PAID` can only be cancelled (`409 PAYMENT_NOT_COMPLETED` otherwise).
  Delivering a COD order marks its payment `PAID`.
- `OrderDto.payment` / `OrderListItemDto.payment` hold `{ method: RAZORPAY|COD, status: PENDING|PAID|FAILED|REFUNDED, instrument, … }`.
  The value is `null` for orders created by staff.

## Storefront payments (Razorpay)
Customer session required. Amounts always come from the order in the database, and the key secret never leaves the server.
1. `POST /storefront/orders` with `paymentMethod: "RAZORPAY"` creates the order as `PENDING` with payment `PENDING` and reserves stock.
   It returns `503 PAYMENTS_UNAVAILABLE` when the Razorpay keys are not configured. COD (`"COD"`, the default) works the same way, without the steps below.
2. `POST /storefront/payments/razorpay/order` with body `{ orderId }` returns `{ keyId, razorpayOrderId, amount, currency, expiresInSeconds, … }`.
   Retries reuse the same Razorpay order.
3. `POST /storefront/payments/razorpay/verify` with body `{ orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature }` does two things:
   it checks the HMAC signature and re-fetches the payment from Razorpay. The order then becomes `CONFIRMED` with payment `PAID`.
   A bad signature returns `400 PAYMENT_VERIFICATION_FAILED`.
4. `POST /storefront/payments/razorpay/reconcile` with body `{ orderId }` asks Razorpay for the order's payments, for when the browser lost the result.
- `POST /payments/razorpay/webhook` is server-to-server. It is verified with `X-Razorpay-Signature` (`RAZORPAY_WEBHOOK_SECRET`) and deduplicated by `X-Razorpay-Event-Id`.
  It handles `payment.captured`, `payment.authorized`, `order.paid`, `payment.failed` and `refund.processed`.
- Each path that marks an order paid uses a conditional update, so a payment is applied only once.
  A payment that arrives for an order that was cancelled in the meantime is refunded automatically.
- The worker cancels unpaid online orders after `PAYMENT_TIMEOUT_MINUTES` (default 30) and releases their stock. It checks with Razorpay one last time first.

## Products & Inventory
- `GET /products?search=&page=&limit=` returns `{ data: (ProductDto & { inventory: { available, reserved, reorderLevel } | null })[], meta: PageMeta }`
- `POST /products` with body `CreateProductInput` returns `201 { data: ProductDto }`
- `GET /inventory?search=&stock=all|low|out&page=&limit=` returns `{ data: InventoryItemDto[], meta: PageMeta }`
- `POST /inventory/:productId/adjust` with body `{ delta, reason }` returns `{ data: InventoryItemDto }`

## Audit logs (cursor paginated, append-only)
`GET /audit-logs?limit=20&cursor=<opaque>&action=ORDER_CREATED&entityType=ORDER&entityId=&actorId=&from=&to=`
returns `{ data: AuditLogDto[], meta: { nextCursor, limit } }`.

## Jobs
- `GET /jobs?status=&type=&page=&limit=` returns `{ data: JobDto[], meta: PageMeta & { counts: Record<JobStatus, number> } }`
- `POST /jobs/:id/retry` (only FAILED jobs) returns `{ data: JobDto }`

## Misc
- `GET /notifications?limit=10` returns `{ data: NotificationDto[] }`
- `GET /users` returns `{ data: UserDto[] }`
- `GET /organizations/current` returns `{ data: { id, name, slug, timezone, currency, createdAt, stats: { users, products, orders } } }`
- `GET /health` returns `{ data: { status: "ok", db: "up" } }`

## Realtime (Socket.IO, path `/socket.io`)
Authenticated from the same access-token cookie, and joined to room `org:<organizationId>`.
Events are typed in `ServerToClientEvents` (`src/shared/types.ts` in both projects):
`order:created`, `order:updated`, `inventory:updated`, `notification:created`, `job:updated`, `audit:created`.

## Seed logins (password `Password123!`)
| Email | Role | Org |
|---|---|---|
| john@acme.com | ORG_ADMIN | Acme Merchant |
| maya@acme.com | MANAGER | Acme Merchant |
| ravi@acme.com | OPERATOR | Acme Merchant |
| vera@acme.com | VIEWER | Acme Merchant |
| admin@globex.com | ORG_ADMIN | Globex Retail |
| root@opshub.dev | SUPER_ADMIN | OpsHub Platform |
