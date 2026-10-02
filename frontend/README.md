# OpsHub Frontend

React web app for OpsHub: dashboard, orders, inventory, products, audit logs, background jobs, analytics and admin
pages.

**Stack:** React 19 · TypeScript · Vite · Tailwind CSS v4 · React Router 7 · TanStack Query · Zustand ·
React Hook Form + Zod · Recharts · Axios · Socket.IO client · lucide icons · sonner toasts.

## Run

Start the backend first (see `../backend`), then:

```bash
npm install
npm run dev        # http://localhost:5173
```

Sign in with `john@acme.com` / `Password123!`.

The app always calls same-origin `/api` and `/socket.io`; Vite proxies them to the backend. If the backend is not on
`http://localhost:4000`, set `API_URL` (in `.env` or inline: `API_URL=http://localhost:4100 npm run dev`).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with HMR |
| `npm run build` | Typecheck + production build into `dist/` |
| `npm run preview` | Serve the build locally |
| `npm run typecheck` | TypeScript only |

## Deploy

Serve `dist/` and proxy `/api` + `/socket.io` to the backend on the **same origin**, so the httpOnly auth cookies stay
first-party. The included Docker image does exactly that with nginx:

```bash
docker build -t opshub-frontend .
docker run -p 8080:80 -e API_UPSTREAM=http://host.docker.internal:4000 opshub-frontend
```

Set the backend's `WEB_ORIGIN` to the frontend's URL (here `http://localhost:8080`). Alternatively, the backend can
serve the build itself: `WEB_DIST=../frontend/dist`.

## Structure

```
src/
  router.tsx              lazy routes, auth + permission guards
  pages/                  one file per route
  components/             layout (sidebar, header), ui kit, orders, dashboard, inventory
  features/<domain>/      TanStack Query hooks (server state + cache invalidation)
  services/               typed API clients (axios)
  hooks/                  realtime socket, debounce
  stores/                 Zustand UI state
  lib/                    api client (refresh-on-401), socket, formatting
  shared/                 schemas, DTO types, state machine, RBAC — same files as backend/src/shared
```

State is split deliberately: server data lives in TanStack Query, UI state in Zustand, auth user in context, and
form state in React Hook Form. Realtime events invalidate queries instead of patching state by hand. The UI hides
actions the role can't perform, but the backend enforces every rule.
