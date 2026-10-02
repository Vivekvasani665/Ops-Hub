# Security

## Authentication

- **Passwords:** bcrypt (cost 10). Login compares against a dummy hash when the email doesn't exist, so timing and
  the error message (`Invalid email or password`) are identical for unknown users and wrong passwords.
- **Access token:** JWT (HS256, 15 min, `iss`/`aud` checked) carrying `sub`, `org`, `role`, `name`.
- **Refresh token:** 48 random bytes, opaque; only its SHA-256 is stored. 7-day expiry, TTL-cleaned.
- **Rotation with reuse detection:** every refresh atomically revokes the presented token and issues a new one in
  the same family. Presenting a revoked token (a stolen copy being replayed) revokes the entire family and forces a
  new login.
- **Logout** revokes the token family and clears both cookies.
- **Brute force:** per-account lockout (5 failures → 15 min, counted with atomic `$inc` so parallel guesses all
  count) plus per-IP rate limit on `/auth/login` and `/auth/refresh`. Failed logins are audited.
- Disabled users and suspended organizations cannot log in or refresh.

## Token storage — no secrets in JavaScript

Both tokens live in **httpOnly** cookies, so an XSS bug cannot read or exfiltrate them. Nothing auth-related is
in `localStorage` (the only localStorage use is a "notifications seen at" timestamp and the sidebar preference).

| Cookie | Flags |
|---|---|
| `opshub_at` (access) | `HttpOnly; SameSite=Lax; Path=/; Secure` in production |
| `opshub_rt` (refresh) | `HttpOnly; SameSite=Strict; Path=/api/auth; Secure` in production — sent only to auth endpoints |

## CSRF

- `SameSite` cookies: cross-site POST/PATCH requests don't carry the access cookie.
- **Origin guard:** any state-changing `/api` request with an `Origin` header other than `WEB_ORIGIN` is rejected (403).
- CORS allows only `WEB_ORIGIN` with credentials. No state changes on GET.

## Authorization

- **Tenant isolation:** `req.tenantId` is derived only from the verified token. No route reads an organization id
  from the URL or body. Every query and every conditional update includes `organizationId`, including lookups by
  `_id`. Another tenant's resource responds `404`, exactly like a non-existent one, so ids can't be probed.
  `SUPER_ADMIN` may target a tenant explicitly via `X-Organization-Id`; the header is ignored for everyone else.
- **RBAC:** a single permission table (`src/shared/permissions.ts`) is enforced server-side by
  `requirePermission` on each route, plus fine-grained checks in services (cancelling needs `orders:cancel`). The UI
  hides what you can't do, but the API is the authority.

| Role | Can |
|---|---|
| SUPER_ADMIN | everything, any tenant (explicit header) |
| ORG_ADMIN | everything in own tenant, incl. job retry |
| MANAGER | orders (create/progress/cancel), products, stock adjustments, audit, jobs (read), users (read) |
| OPERATOR | create orders and progress status; read catalogue/inventory |
| VIEWER | read-only orders, products, inventory, dashboard |

- **Socket.IO** authenticates the handshake with the same access cookie and joins only `org:<id>` from the token.
  Clients can't subscribe to other rooms (there are no client → server events).

## Input handling

- All bodies are validated with zod schemas shared with the client; unknown fields are stripped, so clients can't
  set `status`, `totalAmount`, prices or `organizationId` (test: *ignores client-supplied prices and statuses*).
- Prices and totals are computed server-side from the tenant's own products.
- Search input is regex-escaped and anchored; length-limited. Malformed ObjectIds → 404.
- JSON body limit 100 kb; `strictQuery` on; Mongoose casts query values (no operator injection via query strings
  into filters — values from `req.query` are only used after explicit type checks).
- Errors return stable codes; stack traces are never sent to clients.

## Transport & headers

`helmet` (CSP, HSTS, no-sniff, frameguard…), `x-powered-by` disabled, `trust proxy` for correct client IPs behind a
load balancer. In production the API serves the SPA from the same origin, so cookies stay first-party.

## Audit trail

Security-relevant events (login success/failure, logout, order changes, stock adjustments, job retries) are
written to `audit_logs`, which are append-only at the model layer and scoped per tenant.

## Secrets

`.env` is git-ignored; `.env.example` documents variables. The API refuses to start in production with the default
development JWT secrets.

## Not done (would be next)

MFA, password reset flow, per-user session list/revocation UI, field-level encryption of customer PII,
CSP nonces for inline scripts, and centralised secret management.
