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
`GET /dashboard/summary?days=7|30` returns `{ data: DashboardSummaryDto }`. `trend` holds the last `days` days (default 7), oldest first.
It also carries all-time `totalRevenue` (non-cancelled orders), `totalProducts`, `totalCustomers`, and `newCustomers` (sign-ups inside the window).

## Orders
- `GET /orders?page=1&limit=10&status=PENDING&search=rahul&from=2026-09-01&to=2026-10-02` returns `{ data: OrderListItemDto[], meta: PageMeta }`.
  `search` matches the order number (`1024` / `#1024`), or a prefix of the customer name or email.
- `GET /orders/:id` returns `{ data: OrderDto }` (includes `allowedTransitions` for the current status).
- `POST /orders` with the header **`Idempotency-Key: <uuid>`** (required) and body `CreateOrderInput` returns `201 { data: OrderDto }`.
  A retry with the same key and body replays the original response (`Idempotent-Replayed: true` header).
- `PATCH /orders/:id/status` with body `{ status, reason? }` returns `{ data: OrderDto }`.
  An online (`ONLINE`, PayU) order that is not yet `PAID` can only be cancelled (`409 PAYMENT_NOT_COMPLETED` otherwise).
  Delivering a COD order marks its payment `PAID`.
- `OrderDto.payment` / `OrderListItemDto.payment` hold `{ method: ONLINE|COD, gateway: PAYU|null, status: PENDING|PAID|FAILED|REFUNDED, instrument, … }`.
  The value is `null` for orders created by staff.

## Storefront payments (PayU Hosted Checkout)
Customer session required (except the callback). Amounts always come from the order in the database; `PAYU_SALT` never leaves the server.
1. `POST /storefront/orders` with `paymentMethod: "ONLINE"` creates the order as `PENDING` with payment `PENDING` and reserves stock.
   It returns `503 PAYMENTS_UNAVAILABLE` when PayU is not configured. COD (`"COD"`, the default) works the same way, without the steps below.
2. `POST /storefront/payments/payu/create` with body `{ orderId }` returns `{ action, fields }`: the PayU URL and the signed form
   (`key, txnid, amount, productinfo, firstname, email, phone, surl, furl, udf1, udf2, hash`). Each call is a new attempt with a new `txnid`.
   The browser posts the form to `action`. Errors: `404` (not the customer's order), `409 ALREADY_PAID | PAYMENT_CLOSED | PAYMENT_WINDOW_EXPIRED | NOT_AN_ONLINE_ORDER`.
3. PayU posts the result to `PAYU_SUCCESS_URL` / `PAYU_FAILURE_URL` (the storefront's `/payment/success|failure`), which forwards the form to
   `POST /payments/payu/callback` (form-encoded, no session) → `{ data: { outcome: paid|failed|cancelled|pending|invalid, orderId } }`.
   The reverse hash is checked; a `success` is re-read from PayU's Verify API and its amount compared with the order total before the order
   becomes `PROCESSING` with payment `PAID`. A failure or cancellation marks the payment `FAILED`; the order stays payable until the window ends.
4. `POST /storefront/payments/payu/reconcile` with body `{ orderId }` asks PayU about every attempt of the order, for when the redirect back was lost.
- Each path that marks an order paid uses a conditional update, so a payment is applied only once (duplicate callbacks are no-ops).
  A payment for an order that was cancelled or already paid in the meantime, or for a different amount, is refunded automatically.
- The worker cancels unpaid online orders after `PAYMENT_TIMEOUT_MINUTES` (default 30) and releases their stock. It checks with PayU one last time first.

## Products & Inventory
- `GET /products?search=&category=&status=active|inactive&sort=name|newest|oldest|price_asc|price_desc&page=&limit=` returns `{ data: ProductWithInventoryDto[], meta: PageMeta }`
- `GET /products/:id` returns `{ data: ProductWithInventoryDto }`
- `POST /products` with body `CreateProductInput` (optional `imageUrl`, `description`, `isActive`) returns `201 { data: ProductDto }`
- `PATCH /products/:id` with body `UpdateProductInput` (any of name, sku, category, price, imageUrl, description, isActive, reorderLevel) returns `{ data: ProductWithInventoryDto }`.
  Stock is not edited here: use `POST /inventory/:productId/adjust`, so every change stays an audited delta.
- `DELETE /products/:id` removes the product and its inventory row. It returns `409 PRODUCT_HAS_RESERVATIONS` while open orders hold reserved units. Order lines keep their own snapshot.

## Images
- `POST /media` (`products:write`) takes the raw image bytes as the body (JPG, PNG, WebP or GIF, up to 2 MB, type sniffed from the bytes). It returns `201 { data: { id, url } }`.
- `GET /storefront/media/:id` is public and cacheable forever. It lives under `/storefront` so the customer web's proxy serves catalog images too.
  An upload is deleted once no product or category refers to it any more.

## Categories (`products:read` / `products:write`)
Products still store their category as a string. The `categories` collection adds empty categories, an image, and renaming.
- `GET /categories` returns `{ data: CategoryDto[] }` with product counts. Category names that only exist on products get a row on first listing.
- `POST /categories` with body `{ name, imageUrl? }` returns `201`, or `409 DUPLICATE_CATEGORY` (names are case-insensitive).
- `PATCH /categories/:id` with body `{ name, imageUrl? }` returns `{ data, meta: { productsMoved } }`. A rename moves every product of the category in the same transaction.
- `DELETE /categories/:id` returns `409 CATEGORY_IN_USE` while products use it.

## Customers (`customers:read`)
`GET /customers?search=&status=ACTIVE|DISABLED&page=&limit=` returns `{ data: CustomerDto[], meta: PageMeta }`. These are storefront accounts with `orderCount`, `totalSpent` (non-cancelled) and `lastOrderAt`.

## Coupons (`coupons:read` / `coupons:write`)
- `GET /coupons?search=&status=active|inactive|expired&page=&limit=` returns `{ data: CouponDto[], meta: PageMeta }`.
- `POST /coupons` / `PATCH /coupons/:id` take body `CouponInput`: `{ code, type: PERCENT|FIXED, value, minOrderAmount, maxDiscount?, startsAt?, expiresAt?, usageLimit?, isActive, description? }`.
  PERCENT `value` is 1–100; FIXED `value` and all amounts are paise. A duplicate code returns `409 DUPLICATE_COUPON`.
- `DELETE /coupons/:id`.
- Checkout does not redeem coupons yet, so `usedCount` stays 0.
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
