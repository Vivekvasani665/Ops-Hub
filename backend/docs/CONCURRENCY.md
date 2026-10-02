# Concurrency & distributed-systems design

Every guarantee below is covered by an automated test in `tests/` that runs against a real MongoDB
replica set (`mongodb-memory-server`), not mocks.

## 1. Inventory: no overselling

**The problem.** The naive version is read → check → write:

```ts
const inv = await Inventory.findOne({ productId });
if (inv.available >= qty) await Inventory.updateOne({ productId }, { available: inv.available - qty });
```

Two requests both read `available = 1`, both pass the check, both write, and stock is oversold.

**The fix: make the check part of the write.**

```ts
Inventory.findOneAndUpdate(
  { organizationId, productId, available: { $gte: qty } },   // check
  { $inc: { available: -qty, reserved: +qty } },             // write
  { session, new: true },
);
```

MongoDB applies a single-document update atomically. If the filter no longer matches (someone else took the
stock), nothing is modified and we return `409 INSUFFICIENT_STOCK`. No locks are held across round trips, so
throughput stays high.

**Multi-item orders** run inside a transaction: if line 2 has no stock, the reservation of line 1 is rolled back
(test: *multi-item orders are all-or-nothing*). Lines are processed in a deterministic order (sorted by product id)
to keep conflict patterns predictable.

**Write conflicts.** When two transactions touch the same inventory document, MongoDB aborts one with a
`WriteConflict` (a `TransientTransactionError`). `session.withTransaction` retries the whole callback, which
re-evaluates the conditional update against fresh data, so a retried request either succeeds legitimately or
gets `INSUFFICIENT_STOCK`. It never goes negative.

**Proof:** `concurrency.test.ts`

| Scenario | Result |
|---|---|
| 100 concurrent orders × 1 unit, stock 10 | exactly 10 × `201`, 90 × `409 INSUFFICIENT_STOCK`, `available=0`, `reserved=10`, 10 orders in DB, order numbers unique and gapless |
| 40 concurrent orders, quantities 1–3, stock 25 | `sold ≤ 25`, `available = 25 − sold`, `reserved = sold` |
| 10 concurrent cancels of one order | 1 succeeds, 9 get `409`, stock released exactly once |
| confirm + cancel racing on one order | never a torn state: stock matches the final status |

The same check runs against the live dev server: `npm run load-test -- --oversell` (result: 10 created, 90 rejected, available 0).

**Order numbers** are allocated with `$inc` on a per-tenant counter *inside* the transaction and *after* the
reservation succeeds. Rejected orders never touch the counter, and a rolled-back transaction rolls back its
increment, so numbers are gapless.

## 2. Order status changes: no lost updates

`updateOrderStatus` reads the order, validates the transition against the shared state machine, then updates
**conditionally on the status it read**:

```ts
Order.findOneAndUpdate({ _id, organizationId, status: from }, { $set: { status: to }, $push: { statusHistory } })
```

Inside the snapshot transaction a concurrent writer causes a WriteConflict → retry → the re-read sees the new status
→ the transition is re-validated (e.g. a second `CANCELLED` becomes `INVALID_STATUS_TRANSITION` from `CANCELLED`).
The conditional filter is a second safety net (`409 CONCURRENT_MODIFICATION`). Stock release/consumption and the
audit entry are in the same transaction as the status change.

## 3. Idempotency: no duplicate orders

`POST /orders` requires `Idempotency-Key`. Middleware (`idempotency.middleware.ts`):

1. `INSERT {organizationId, key, requestHash, status: IN_PROGRESS, lockedUntil}`. The **unique index on
   `{organizationId, key}` is the lock**: exactly one concurrent request can insert it.
2. On duplicate key:
   - different body hash → `422 IDEMPOTENCY_KEY_MISMATCH`
   - `COMPLETED` → replay the stored status + body with `Idempotent-Replayed: true`
   - `IN_PROGRESS` → `409 IDEMPOTENCY_IN_PROGRESS`, unless the holder's lock expired (crashed mid-request),
     in which case this request takes over.
3. The response is persisted **before** it is sent, so an immediate retry always finds it.
4. `5xx` and `409` (e.g. `INSUFFICIENT_STOCK`, which can change after a restock) delete the key, so the client
   can retry the same key safely. Deterministic results (2xx, 4xx validation) are stored and replayed.

Validation runs before the middleware, so the hash is over the normalised body. Keys are scoped per tenant and
expire after 24 h (TTL index).

**Proof:** `idempotency.test.ts` — retry returns the same order and reserves once; 15 concurrent requests with one
key create exactly one order; body mismatch → 422; missing key → 400; failed attempt not cached; keys are per tenant.

The client generates one key per submission attempt in the Create Order dialog and reuses it on retries, so a
double click or a retry after a timeout cannot create a second order.

## 4. Background jobs: at-least-once, effectively-once

**Transactional outbox.** Jobs are inserted in the same transaction as the order. A job exists if and only if the
business change committed — no "order created but notification lost", no "notification for a rolled-back order".

**Claiming.** One atomic `findOneAndUpdate`:

```ts
filter: { $or: [ { status: 'PENDING', availableAt: { $lte: now } },
                 { status: 'PROCESSING', lockedUntil: { $lt: now } } ] }   // runnable or abandoned
update: { $set: { status: 'PROCESSING', lockedBy: workerId, lockedUntil: now + lease }, $inc: { attempts: 1 } }
```

Selecting and locking are one operation, so two workers can never claim the same job.

**Leases and crash recovery.** A worker holds a job for `WORKER_LEASE_MS` (30 s) and extends it with a heartbeat
while running. If the worker dies, the lease expires and any other worker reclaims the job. A job whose worker
crashed on its *final* attempt is marked `FAILED` rather than run beyond `maxAttempts`.

**Fencing.** Every terminal write (`COMPLETED`, retry, `FAILED`) is conditional on `lockedBy = me`. A worker that
was paused (GC, network partition) past its lease and then wakes up cannot overwrite the result of the worker that
took over.

**Retries with exponential backoff.** On failure: `attempts < maxAttempts` → back to `PENDING` with
`availableAt = now + 1s · 2^(attempt−1)` (1 s, 2 s, 4 s…); otherwise `FAILED`. Failed jobs can be retried from the UI
(`POST /jobs/:id/retry`, ORG_ADMIN).

**Idempotent handlers.** At-least-once delivery means a handler may run twice (crash after the side effect, before
`COMPLETED`). Every side effect carries a dedupe key backed by a unique index: `order-created:<orderId>` for the audit
entry, `job:<jobId>:order` for notifications, `low-stock:<org>:<product>:<day>` for stock alerts,
`daily-report:<org>:<date>` for reports (also used to dedupe *scheduling* across many workers).

**Proof:** `jobs.test.ts` — backoff timing (1×, 2× base) then success; `FAILED` after max attempts; crash recovery
after lease expiry plus fencing of the stale worker; final-attempt crash → `FAILED`; 6 concurrent workers × 30 jobs →
each processed exactly once; duplicate execution of a handler writes one audit row; daily-report scheduling from 3
workers enqueues once per org.

## 5. Refresh-token rotation races

Two tabs refreshing at once: the token is claimed with `findOneAndUpdate({_id, revokedAt: null}, {revokedAt: now})`, so
only one refresh succeeds per token. Presenting an already-revoked token is treated as theft and revokes the whole
token family (`auth.test.ts`). The SPA funnels concurrent `TOKEN_EXPIRED` responses into a single in-flight refresh.

## 6. Realtime consistency

Socket events are hints, not state: the client reacts by invalidating TanStack Query keys and refetching from the
API, so a missed or reordered event can't leave the UI permanently wrong. Events are emitted only **after** the
transaction commits (never for rolled-back work), and only to the `org:<id>` room derived from the verified cookie.

## Known limits / trade-offs

- Hot-SKU contention is resolved by transaction retries. Under extreme contention on one SKU (hundreds of
  concurrent buyers) latency grows (`--oversell` p50 ≈ 2.5 s for 100 simultaneous orders on one SKU). The next step
  would be per-SKU request queuing or splitting stock into buckets.
- The idempotency key protects one endpoint (`POST /orders`); status changes are naturally idempotent through the
  state machine (repeating a transition is rejected, not applied twice).
- Notification delivery to an external provider is simulated; a real integration should pass the job id as the
  provider's idempotency key.
