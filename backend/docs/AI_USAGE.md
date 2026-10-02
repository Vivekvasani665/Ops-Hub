# AI usage

This project was built with an AI coding assistant (Claude, via Claude Code) working in the repository under
the author's direction. This file records how it was used and how the output was verified.

## What the assistant did

- Scaffolded the monorepo, shared package (schemas, state machine, RBAC table), Mongoose models and middlewares.
- Implemented the orders module (transactional create, state machine, inventory side effects), dashboard
  aggregation, worker (claim/lease/fencing, backoff, handlers), seed and scripts.
- Built the React UI against the reference dashboard design. The frontend pages were written by a parallel
  agent against the fixed API contract in `src/shared` (copied into both projects) and `docs/API.md`.
- Wrote the test suite and the documentation in `docs/`.

## How the output was verified (not trusted blindly)

- **Tests against a real database.** All 57 tests run against a MongoDB replica set (`mongodb-memory-server`),
  so transactions, unique indexes and write conflicts behave as in production. The concurrency, idempotency and
  job tests were run repeatedly to check for flakiness.
- **Live checks.** The full stack was run locally: API smoke test (login → dashboard → create order → worker
  processes jobs → notification and audit entry appear), the oversell load test against the live server, and
  production mode serving the built SPA.
- **`explain()` before claiming performance.** Running the plans on 100k orders found three real problems that
  looked fine in code review: a list index that couldn't serve the sort, an audit cursor query that scanned
  50k documents, and pagination counts dominating latency. All three were fixed and re-measured
  (see [PERFORMANCE.md](PERFORMANCE.md)).
- **Bugs caught during verification**, e.g. the seed left "yesterday" empty (found from dashboard numbers), a
  missing ESM flag broke the root scripts, and the audit cursor bound needed to respect a user-supplied `to` date.

## Where human judgment is required

- Trade-offs recorded in the docs (offset vs cursor pagination for orders, gapless order numbers inside the
  transaction, cached pagination totals, simulated notification delivery) are design choices to review, not
  facts.
- The Docker setup is written but was not run in the build environment (Docker wasn't installed there).
- The UI was type-checked and built, and its API calls were exercised over HTTP, but it was not reviewed
  visually in a browser during the session.
