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
