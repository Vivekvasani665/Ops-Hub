<<<<<<< HEAD

=======
# OpsHub — Multi-Tenant Order & Operations Platform

Two independent projects:

| Folder | What | Run |
|---|---|---|
| [`backend/`](backend/README.md) | Node.js + Express + MongoDB API and background worker | `cd backend && npm install && npm run dev` |
| [`frontend/`](frontend/README.md) | React + Vite web app | `cd frontend && npm install && npm run dev` |

Start the backend first, then open http://localhost:5173 and sign in with `john@acme.com` / `Password123!`.

Each project has its own `package.json`, `node_modules`, config, Dockerfile and README. They share an API contract
(schemas, types, order state machine, permissions) kept as identical copies in `backend/src/shared` and
`frontend/src/shared`.

Design docs are in [`backend/docs/`](backend/docs/ARCHITECTURE.md).
>>>>>>> 393539f (feat: initialize Ops Hub application with full-stack backend and frontend architecture)
