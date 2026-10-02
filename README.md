# OpsHub — Multi-Tenant Order & Operations Platform

Three independent projects in one repository, all talking to the same backend and database:

| Folder | What | Run |
|---|---|---|
| [`backend/`](backend/README.md) | Node.js + Express + MongoDB API and background worker | `cd backend && npm install && npm run dev` |
| [`frontend/`](frontend/README.md) | Admin panel — React + Vite | `cd frontend && npm install && npm run dev` |
| [`customer-web/`](customer-web/README.md) | Customer storefront — Next.js | `cd customer-web && npm install && npm run dev` |

Start the backend first. Admin: sign in with `john@acme.com` / `Password123!`. Storefront: http://localhost:4003,
register a customer account and place an order — it appears instantly in the admin Orders page.

```text
customer-web ──/api/storefront──┐
                                ▼
                     backend (one API, one MongoDB)
                                ▲
frontend (admin) ─────/api──────┘
```

Each project has its own `package.json`, `node_modules`, config and README. The admin app and backend share an API
contract (schemas, types, order state machine, permissions) kept as identical copies in `backend/src/shared` and
`frontend/src/shared`.

Design docs are in [`backend/docs/`](backend/docs/ARCHITECTURE.md).
