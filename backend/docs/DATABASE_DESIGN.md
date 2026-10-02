# Database design

MongoDB 7, single-node **replica set** (required for transactions and change streams). All tenant data carries
`organizationId`, and **every index on tenant data starts with `organizationId`**, so a query's cost depends on
that tenant's data size, never on the whole platform, and an index can never be used to read across tenants.

## Collections

| Collection | Purpose | Notes |
|---|---|---|
| `organizations` | Tenants | `slug` unique, `timezone` drives "today" on the dashboard |
| `users` | Accounts | `passwordHash` (bcrypt, `select:false`), `role`, lockout counters |
| `refresh_tokens` | Refresh-token rotation | Only `sha256(token)` stored; `familyId` for reuse detection; TTL index |
| `products` | Catalogue | `price` in paise; `nameLower` for case-insensitive prefix search |
| `inventory` | One row per product | `available`, `reserved`, `reorderLevel`; invariant `available ≥ 0` |
| `orders` | Orders with embedded items & status history | Items snapshot name/sku/price at order time |
| `counters` | Per-tenant order-number sequence | Incremented inside the order transaction (gapless) |
| `idempotency_keys` | Stored responses for `Idempotency-Key` | Unique `{org, key}` acts as the lock; 24h TTL |
| `jobs` | Outbox + work queue | status, attempts, `availableAt` (backoff), lease (`lockedBy`, `lockedUntil`) |
| `audit_logs` | Append-only audit trail | Update/delete blocked at the model layer; `dedupeKey` for job-written entries |
| `notifications` | In-app notifications | `dedupeKey` unique; 30-day TTL |

### Embedding vs referencing

- **Order items and status history are embedded.** They are always read with the order, are bounded in size
  (≤ 50 items, ≤ ~7 status changes) and must be immutable snapshots — a later price change must not alter a past order.
- **Inventory is a separate collection**, not a field on products: it is the hot, contended document. Keeping it
  small keeps write conflicts cheap and lets product edits never contend with stock updates.
- **Audit logs are separate and append-only**; they grow fastest and are queried by time.

## Indexes and why each exists

### orders
| Index | Serves |
|---|---|
| `{organizationId, createdAt:-1, _id:-1}` | Default list (newest first). `_id` is the sort tie-breaker, so the index returns rows already in order — no in-memory SORT, and skip pagination is stable. Also the 7-day dashboard trend (covered). |
| `{organizationId, status, createdAt:-1, _id:-1}` | Status filter on the list; dashboard status distribution as a **covered** index scan (no documents fetched). |
| `{organizationId, orderNumber}` **unique** | `#1024` search; guarantees order numbers are unique per tenant. |
| `{organizationId, customer.nameLower, createdAt:-1}` | Anchored, lower-cased customer-name prefix search. |
| `{organizationId, customer.email, createdAt:-1}` | Customer email prefix search. |

### inventory
| Index | Serves |
|---|---|
| `{organizationId, productId}` **unique** | Reservation updates (the hot path) and one-row-per-product invariant. |
| `{organizationId, available}` | Low-stock / out-of-stock counts and alerts. |

### products
`{organizationId, sku}` unique (no duplicate SKUs in a tenant), `{organizationId, nameLower}` (prefix search, sorted list).

### audit_logs
| Index | Serves |
|---|---|
| `{organizationId, createdAt:-1, _id:-1}` | Keyset (cursor) pagination, newest first. |
| `{organizationId, action, createdAt:-1}` | Action filter. |
| `{organizationId, entityType, entityId, createdAt:-1}` | "History of this order". |
| `{organizationId, actor.id, createdAt:-1}` | Actor filter. |
| `{dedupeKey}` unique, partial | A retried job never writes the same audit entry twice. |

### jobs
| Index | Serves |
|---|---|
| `{status, availableAt}` | Worker claim query (`PENDING` and due), ordered by `availableAt`. |
| `{status, lockedUntil}` | Crash recovery: `PROCESSING` jobs whose lease expired. |
| `{organizationId, createdAt:-1}`, `{organizationId, status, createdAt:-1}` | Jobs page per tenant. |
| `{dedupeKey}` unique, partial | e.g. one daily report per org per day, even with many workers scheduling. |

### others
`users {email}` unique (login is by email), `users {organizationId, createdAt}`; `idempotency_keys {organizationId, key}` unique +
TTL on `expiresAt`; `refresh_tokens {tokenHash}` unique, `{familyId}`, TTL on `expiresAt`; `notifications {organizationId, createdAt:-1}`,
`{dedupeKey}` unique partial, TTL on `createdAt`; `counters {organizationId, name}` unique.

## Pagination strategy

- **Orders:** page/limit (the UI needs numbered pages and "Showing 1–10 of N"). Page fetch is an O(limit + skip)
  index walk; totals are an index COUNT_SCAN, cached per (tenant, filter) for 5 s. Very deep pages cost O(skip);
  see [PERFORMANCE.md](PERFORMANCE.md).
- **Audit logs:** keyset cursor on `(createdAt, _id)` — constant cost at any depth and stable while new entries
  are inserted.

## Data integrity rules

- `available` and `reserved` have `min: 0` validators *and* every decrement is conditional (`$gte`), so the
  invariant holds even for raw updates.
- Order number allocation, stock reservation, the order insert, the audit entry and the outbox jobs share one
  transaction.
- Audit logs cannot be updated or deleted through the application (model hooks throw).
