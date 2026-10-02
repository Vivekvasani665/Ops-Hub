# Performance (100,000 orders)

Reproduce:

```bash
cd backend
npm run db                 # terminal 1
npm run seed:100k          # 100k Acme orders + 100k audit entries (~11 s)
npm run explain            # query plans for the hot queries
npm run dev:api            # + npm run dev:worker, then in another terminal:
npm run load-test -- --requests 300 --concurrency 30 --oversell
```

Measured on a developer iMac (Intel, MongoDB 7.0 single-node replica set, API and DB on the same machine).

## Query plans (`npm run explain`)

| Query | Plan | Index | Keys / docs examined → returned | Time |
|---|---|---|---|---|
| `GET /orders` page 1 | LIMIT ← FETCH ← IXSCAN | `org, createdAt, _id` | 10 / 10 → 10 | 0 ms |
| `GET /orders?status=PENDING` | LIMIT ← FETCH ← IXSCAN | `org, status, createdAt, _id` | 10 / 10 → 10 | 0 ms |
| `GET /orders?search=#1024` | FETCH ← IXSCAN | `org, orderNumber` | 1 / 1 → 1 | 0 ms |
| `GET /orders?search=rahul` | LIMIT ← FETCH ← IXSCAN | `org, createdAt, _id` | 264 / 264 → 10 | 6 ms |
| `GET /orders?page=500` (skip 4990) | SKIP ← IXSCAN | `org, createdAt, _id` | 5000 / 10 → 10 | 71 ms |
| Order total (pagination) | COUNT_SCAN | `org, createdAt, _id` | 100k / 0 | 50 ms |
| Dashboard status distribution | PROJECTION_COVERED ← IXSCAN | `org, status, …` | 100k / **0** | 187 ms |
| Dashboard 7-day trend | PROJECTION_COVERED ← IXSCAN | `org, createdAt, _id` | 26.8k / **0** | 63 ms |
| Dashboard low-stock count | FETCH ← IXSCAN | `org, available` | 11 / 11 → 3 | 0 ms |
| `GET /audit-logs` first page | LIMIT ← FETCH ← IXSCAN | `org, createdAt, _id` | 21 / 21 | 0 ms |
| `GET /audit-logs` cursor at row 50,000 | LIMIT ← FETCH ← IXSCAN | `org, createdAt, _id` | **22 / 22** | 3 ms |
| `GET /audit-logs?action=…` | LIMIT ← FETCH ← IXSCAN | `org, action, createdAt` | 21 / 21 | 0 ms |
| Worker claim | SUBPLAN / SORT_MERGE ← IXSCAN | `status, availableAt` | 0 / 0 | 0 ms |

No query does a COLLSCAN. No list query has a blocking in-memory SORT.

## Problems found with `explain()` and fixed

1. **List sort not covered by the index.** The list sorts by `{createdAt:-1, _id:-1}` (the `_id` tie-breaker keeps
   skip pagination stable), but the original index was `{organizationId, createdAt}`. MongoDB would have fetched and
   sorted the tenant's entire order set in memory for every page. Fix: append `_id:-1` to the index (and to the
   status index). Page 1 now examines exactly 10 keys.
2. **Audit cursor scanned from the top.** The keyset filter
   `$or: [{createdAt < c}, {createdAt = c, _id < id}]` gave the planner no bound on `createdAt`, so page N examined
   every newer entry: **50,022 keys/docs and 1,355 ms** at row 50,000. Fix: also add `createdAt: {$lte: c}`
   (logically redundant, but it becomes an index bound). Now **22 keys, 3 ms** at any depth.
3. **Pagination totals dominated list latency under load.** The page is 10 keys, but the exact total is a
   100k-key COUNT_SCAN. With 30 concurrent clients, `GET /orders` ran at **110 rps, p50 277 ms**. Fix: totals per
   (tenant, filter) are shared by concurrent requests and cached for 5 s (rows are never cached). Result: **632 rps,
   p50 40 ms**.
4. **Dashboard fan-out.** Every order event invalidates the dashboard in every open browser of the tenant, and the
   status distribution is a 100k-key covered scan. The summary is now computed at most once per tenant every 5 s;
   concurrent requests share the in-flight computation.

## Load test (`npm run load-test`, 300 requests per endpoint, concurrency 30, after fixes)

| Endpoint | rps | p50 | p95 | p99 |
|---|---|---|---|---|
| `GET /orders` | 632 | 39.6 ms | 89.6 ms | 95.3 ms |
| `GET /orders?status=PENDING` | 854 | 33.4 ms | 44.7 ms | 65.4 ms |
| `GET /orders?search=rahul` | 935 | 30.0 ms | 43.1 ms | 55.9 ms |
| `GET /orders?page=200` | 948 | 28.9 ms | 44.2 ms | 48.4 ms |
| `GET /dashboard/summary` | 827 | 10.1 ms | 257.9 ms | 260.2 ms |
| `GET /audit-logs` | 905 | 31.1 ms | 43.3 ms | 51.7 ms |

Oversell run (100 simultaneous `POST /orders`, one SKU, stock 10): 10 × `201`, 90 × `409`, available 0 ✔, p50 2.48 s.

Dashboard p95 is the one uncached recomputation per 5 s window; everything else hits the cache.

## Remaining trade-offs

- **Deep offset pages** cost O(skip) (71 ms at skip 4,990, linear beyond). Numbered pages were a UI requirement;
  for "infinite scroll" the orders API could switch to the same keyset cursor the audit log uses.
- **Customer search** is an anchored prefix match. Substring/fuzzy search would need Atlas Search or a text index.
- **Status distribution** scales with tenant size. Beyond ~1M orders per tenant, maintain counters
  incrementally (update a per-tenant counts document in the same transaction as each status change).
- **Hot-SKU contention**: 100 simultaneous orders for one SKU are serialised by transaction retries
  (p50 ≈ 2.5 s). Real traffic spreads across SKUs; flash sales would justify a per-SKU queue.
