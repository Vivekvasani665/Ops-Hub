/**
 * HTTP load test against a running API (npm run dev, ideally after npm run seed:100k).
 *
 *   npm run load-test                         # 200 requests per endpoint, 20 concurrent
 *   npm run load-test -- --requests 1000 --concurrency 50
 *   npm run load-test -- --oversell           # also: 100 concurrent orders for 10 units of stock
 *
 * Env: API_URL (default http://localhost:4000), LOGIN_EMAIL, LOGIN_PASSWORD.
 */
import crypto from 'node:crypto';

const API = process.env.API_URL ?? 'http://localhost:4000';
const args = process.argv.slice(2);
const arg = (name: string, def: number) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : def;
};
const REQUESTS = arg('requests', 200);
const CONCURRENCY = arg('concurrency', 20);

async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Login failed: ${res.status} ${await res.text()}`);
  const cookies = res.headers.getSetCookie().map((c) => c.split(';')[0]);
  return cookies.join('; ');
}

function percentile(sorted: number[], p: number) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
}

async function run(name: string, total: number, concurrency: number, fn: (i: number) => Promise<Response>) {
  const latencies: number[] = [];
  const statuses = new Map<number, number>();
  let next = 0;
  const started = performance.now();
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < total) {
        const i = next++;
        const t = performance.now();
        try {
          const res = await fn(i);
          await res.arrayBuffer();
          statuses.set(res.status, (statuses.get(res.status) ?? 0) + 1);
        } catch {
          statuses.set(0, (statuses.get(0) ?? 0) + 1);
        }
        latencies.push(performance.now() - t);
      }
    }),
  );
  const elapsed = (performance.now() - started) / 1000;
  latencies.sort((a, b) => a - b);
  const fmt = (n: number) => `${n.toFixed(1)}ms`;
  console.log(
    `${name.padEnd(36)} ${String(total).padStart(5)} req  ${(total / elapsed).toFixed(0).padStart(5)} rps  ` +
      `p50 ${fmt(percentile(latencies, 50)).padStart(8)}  p95 ${fmt(percentile(latencies, 95)).padStart(8)}  ` +
      `p99 ${fmt(percentile(latencies, 99)).padStart(8)}  status ${JSON.stringify(Object.fromEntries(statuses))}`,
  );
  return statuses;
}

const cookie = await login(process.env.LOGIN_EMAIL ?? 'john@acme.com', process.env.LOGIN_PASSWORD ?? 'Password123!');
const get = (path: string) => () => fetch(`${API}/api${path}`, { headers: { cookie } });

console.log(`Target ${API}, ${REQUESTS} requests/endpoint, concurrency ${CONCURRENCY}\n`);
await run('GET /orders', REQUESTS, CONCURRENCY, get('/orders?limit=10'));
await run('GET /orders?status=PENDING', REQUESTS, CONCURRENCY, get('/orders?status=PENDING&limit=10'));
await run('GET /orders?search=rahul', REQUESTS, CONCURRENCY, get('/orders?search=rahul&limit=10'));
await run('GET /orders?page=200', REQUESTS, CONCURRENCY, get('/orders?page=200&limit=10'));
await run('GET /dashboard/summary', REQUESTS, CONCURRENCY, get('/dashboard/summary'));
await run('GET /audit-logs', REQUESTS, CONCURRENCY, get('/audit-logs?limit=20'));

if (args.includes('--oversell')) {
  const sku = `LOAD-${Date.now()}`;
  const created = await fetch(`${API}/api/products`, {
    method: 'POST',
    headers: { cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: `Load test ${sku}`, sku, category: 'Test', price: 100, initialStock: 10, reorderLevel: 0 }),
  });
  const product = ((await created.json()) as { data: { id: string } }).data;
  console.log(`\nOversell test: 100 concurrent orders × 1 unit against stock 10 (${sku})`);
  const statuses = await run('POST /orders (oversell)', 100, 100, () =>
    fetch(`${API}/api/orders`, {
      method: 'POST',
      headers: { cookie, 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify({
        customer: { name: 'Load Test', email: 'load@example.com' },
        items: [{ productId: product.id, quantity: 1 }],
      }),
    }),
  );
  const inv = (await (await fetch(`${API}/api/inventory?search=${sku}`, { headers: { cookie } })).json()) as {
    data: { available: number; reserved: number }[];
  };
  const ok = statuses.get(201) ?? 0;
  console.log(`  created=${ok} rejected=${statuses.get(409) ?? 0} available=${inv.data[0]?.available} reserved=${inv.data[0]?.reserved}`);
  console.log(ok === 10 && inv.data[0]?.available === 0 ? '  ✔ no oversell' : '  ✘ INVARIANT VIOLATED');
}
