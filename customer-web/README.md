# OpsHub Customer Web

Customer-facing storefront: register / sign in, browse products, cart, checkout (cash on delivery) and order tracking.

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4. No database code — everything goes
through the existing backend.

## How it connects

The browser only calls same-origin `/api/storefront/*`; `next.config.ts` rewrites it to the backend (`API_URL`).
Only the storefront API is proxied — the staff/admin API is not reachable through this app.

Backend side lives in `backend/src/modules/storefront`:

| Endpoint | Purpose |
|---|---|
| `GET /store`, `/products`, `/products/:id`, `/categories` | public catalog with live stock |
| `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `GET /auth/me` | customer sessions (httpOnly cookies, separate from staff sessions) |
| `GET /orders`, `/orders/:id` | the signed-in customer's own orders |
| `POST /orders` (requires `Idempotency-Key`) | place an order |

Placing an order calls the **same `createOrder` service** the admin app uses: stock is reserved atomically, the order
gets the next order number, audit/notification jobs are queued, and the admin dashboard receives the live
`order:created` event. The shipping address is stored in the order notes, which the admin sees on the order page.
The store sold is the organization set by `STOREFRONT_ORG_SLUG` in the backend (default `acme`).

## Run

Start the backend first (`cd ../backend && npm run dev`), then:

```bash
cp .env.example .env   # API_URL defaults to http://localhost:4500
npm install
npm run dev            # http://localhost:4003
```

The backend's `WEB_ORIGIN` must include `http://localhost:4003` (CSRF origin check).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on port 4003 |
| `npm run build` | Production build |
| `npm run start` | Serve the production build on port 4003 |
| `npm run typecheck` | TypeScript only |

## Production notes

- Set `API_URL` to the backend's internal URL and add the storefront's public origin to the backend `WEB_ORIGIN`.
- Serve over HTTPS; the backend marks cookies `Secure` when `NODE_ENV=production`.
