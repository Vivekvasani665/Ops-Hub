# Architecture

OpsHub is a multi-tenant order & operations platform: React SPA → Express REST API → MongoDB (replica set),
with a separate worker process for background jobs and Socket.IO for realtime updates.

```
 Browser (React + TanStack Query + Socket.IO client)
     │  HTTPS, httpOnly cookies                     ▲ org-scoped events
     ▼                                              │
 ┌──────────────────────── API process ──────────────────────────┐
 │ helmet → cors → json → cookies → origin guard                 │
 │ /api/auth  (login, refresh rotation, logout)                  │
 │ /api/*     authenticate → resolveTenant → rate limit          │
 │            → requirePermission → validate → [idempotency]     │
 │            → controller → service → repository (Mongoose)     │
 │ Socket.IO: cookie auth, room = org:<id>; tails change streams │
 └───────────────┬───────────────────────────────▲───────────────┘
                 │ transactions                  │ change streams
                 ▼                               │ (notifications, jobs, audit)
          ┌─────────────── MongoDB replica set ──────────────────┐
          │ orders · inventory · products · users · orgs ·       │
          │ jobs (outbox/queue) · audit_logs · idempotency_keys  │
          └───────────────▲──────────────────────────────────────┘
                          │ atomic claim + lease
                 ┌────────┴────────┐
                 │ Worker × N      │  SEND_ORDER_NOTIFICATION · CREATE_ORDER_AUDIT · GENERATE_DAILY_REPORT
                 └─────────────────┘
```

## Repository layout

```
backend/      Express API + worker (TypeScript, Mongoose) — standalone project
  src/modules/<domain>/   model · routes · controller · service · mapper per domain
  src/middlewares/        auth, tenant, validation, idempotency, rate limit, errors
  src/workers/            worker.ts (process), job-lock.ts (claim/lease/fencing), job-processor.ts (handlers)
  src/realtime/           Socket.IO server + org-scoped emitter
  src/seed/               deterministic seed (800 orders by default, 100k for perf)
  src/shared/             enums, zod schemas, DTO types, state machine, RBAC table (import '@shared')
  tests/                  vitest + supertest against a real in-memory replica set
  scripts/                dev-db, seed, explain, load-test
frontend/     React 19 + Vite + Tailwind v4 SPA — standalone project
  src/pages/              one file per route
  src/features/<domain>/  TanStack Query hooks (server state)
  src/services/           typed API clients
  src/stores/             Zustand (UI state only)
  src/shared/             same contract files as backend/src/shared (import '@/shared')
```

`src/shared` exists in both projects as identical copies. When you change a schema, DTO, status
transition or permission, update both copies (`diff -r backend/src/shared frontend/src/shared` should be empty).

## Key decisions

| Decision | Why |
|---|---|
| **Same `shared` contract files in both projects** | One definition of "valid order", "allowed transition" and "who can do what". The UI uses them to render; the API uses the same code to enforce. |
| **Tenant comes only from the verified JWT** (`req.tenantId`) | No endpoint accepts an org id from the URL/body. Every query includes `organizationId`; cross-tenant ids look exactly like non-existent ids (404). |
| **MongoDB transactions for every multi-document business change** | Order + stock reservation + audit + outbox jobs commit or roll back together. |
| **Conditional atomic updates for stock** (`available: {$gte: qty}` + `$inc`) | The check and the decrement are one server-side operation — no read-modify-write race. Transactions add all-or-nothing across lines. See [CONCURRENCY.md](CONCURRENCY.md). |
| **Jobs collection as transactional outbox + queue** | A job exists iff the business change committed. Workers claim with an atomic `findOneAndUpdate` and a lease; no Redis needed. |
| **Separate worker process** | Slow/unreliable work (notifications, reports) never blocks requests; scale workers independently. |
| **Change streams for worker → browser events** | The worker has no socket server; the API tails `notifications`, `jobs`, `audit_logs` and fans out to the org room. |
| **httpOnly cookies, not localStorage** | Tokens are unreachable from JS (XSS can't exfiltrate them). See [SECURITY.md](SECURITY.md). |
| **TanStack Query for server state, Zustand for UI state** | Server data has caching/invalidation semantics; UI flags don't. Realtime events invalidate queries instead of hand-patching state. |
| **Money as integer paise** | No floating point in totals. |

## Request lifecycle — `POST /api/orders`

1. `authenticate` verifies the access cookie → `req.auth {userId, organizationId, role}`.
2. `resolveTenant` sets `req.tenantId` (SUPER_ADMIN may override via `X-Organization-Id`).
3. `requirePermission('orders:create')`, then `validateBody(createOrderSchema)` normalises the body.
4. `idempotency()` inserts `{org, key}` (unique index = lock) or replays the stored response.
5. `orderService.createOrder` runs one transaction: load tenant's products → reserve stock per line →
   allocate order number → insert order → audit `INVENTORY_RESERVED` → enqueue `CREATE_ORDER_AUDIT` and
   `SEND_ORDER_NOTIFICATION`.
6. After commit: emit `order:created`, `inventory:updated`, `audit:created` to `org:<id>`.
7. Response `201` is stored against the idempotency key before it is sent.
8. Worker picks up the jobs → writes `ORDER_CREATED` audit + notifications (dedupe keys) → change streams push
   them to browsers.

## Order lifecycle

```
PENDING → CONFIRMED → PROCESSING → SHIPPED → DELIVERED
   └──────────┴────────────┴──→ CANCELLED
```

Inventory effects: create = reserve (`available−q, reserved+q`), cancel = release (`available+q, reserved−q`),
ship = consume (`reserved−q`). Transitions are validated in `order.state-machine.ts`; cancelling needs the
stronger `orders:cancel` permission (OPERATOR can progress orders but not cancel).

## Frontend

- Routes are lazy-loaded; every protected route sits under `RequireAuth` (uses `/auth/me`) and a permission guard.
- The axios client retries once after a single-flight `/auth/refresh` when the API returns `TOKEN_EXPIRED`.
- `useRealtime` connects the socket once per session and invalidates the relevant query keys per event.
- Buttons for status changes come from `order.allowedTransitions` (computed by the API) filtered by permission;
  the API re-validates everything.
- Create Order generates one `Idempotency-Key` per submission attempt and reuses it on retries, so double clicks
  and network retries never create duplicate orders.
