# OpsHub Backend

REST API + background worker for OpsHub, a multi-tenant order & operations platform.

**Stack:** Node.js · TypeScript · Express 5 · MongoDB 7 (replica set) · Mongoose · Zod · JWT in httpOnly cookies ·
Socket.IO · Vitest + Supertest.

## Run

Requires Node.js ≥ 20. No MongoDB install needed: `npm run db` starts a local replica set.

```bash
npm install
npm run dev        # MongoDB (:27027) + API (:4000) + worker, with reload
```

The database seeds itself on first start. Logins (password `Password123!`): `john@acme.com` (ORG_ADMIN),
`maya@acme.com` (MANAGER), `ravi@acme.com` (OPERATOR), `vera@acme.com` (VIEWER), `admin@globex.com` (other tenant),
`root@opshub.dev` (SUPER_ADMIN).

Port 4000 busy? `API_PORT=4100 npm run dev`, then start the frontend with `API_URL=http://localhost:4100`.

Copy `.env.example` to `.env` to change settings. `WEB_ORIGIN` must be the frontend's URL (CORS + CSRF check).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | DB + API + worker |
| `npm run db` / `dev:api` / `dev:worker` | Each part on its own |
| `npm test` | 57 tests against a real in-memory MongoDB replica set |
| `npm run typecheck` | TypeScript |
| `npm run seed -- --reset` | Wipe and reseed (800 orders) |
| `npm run seed:100k` | Wipe and seed 100,000 orders. Stop the API first, or its auto-seed can race this. |
| `npm run explain` | Query plans for the hot queries |
| `npm run load-test -- --oversell` | HTTP load test against a running API (`API_URL=...`) |
| `npm start` / `npm run worker` | Production API / worker |

## Docker

```bash
docker compose up --build                 # mongo + api (:4000) + worker
docker compose up --build --scale worker=3
```

Not executed in the original build environment (Docker wasn't installed there).

## Structure

```
src/
  app.ts, server.ts       Express app + HTTP/Socket.IO server
  config/                 env (zod-validated), database
  middlewares/            auth, tenant, validation, idempotency, rate limit, errors
  modules/<domain>/       auth, orders, inventory, products, audit, jobs, dashboard, notifications, users, organizations
  workers/                worker process, job claiming/leases, job handlers
  realtime/               Socket.IO, org-scoped emitter
  seed/                   deterministic seed data
  shared/                 schemas, DTO types, state machine, RBAC — same files as frontend/src/shared
tests/                    vitest suites
scripts/                  dev-db, seed, explain, load-test
docs/                     design docs (below)
```

## Docs

[ARCHITECTURE](docs/ARCHITECTURE.md) · [DATABASE_DESIGN](docs/DATABASE_DESIGN.md) · [CONCURRENCY](docs/CONCURRENCY.md) ·
[SECURITY](docs/SECURITY.md) · [PERFORMANCE](docs/PERFORMANCE.md) · [API](docs/API.md) · [AI_USAGE](docs/AI_USAGE.md)
