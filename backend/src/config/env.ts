import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().default(4000),
  MONGODB_URI: z.string().default('mongodb://127.0.0.1:27027/opshub?replicaSet=rs0'),
  JWT_ACCESS_SECRET: z.string().min(32).default('dev-access-secret-change-me-0123456789abcdef'),
  JWT_REFRESH_SECRET: z.string().min(32).default('dev-refresh-secret-change-me-0123456789abcdef'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().default(15 * 60),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().default(7),
  /** comma-separated list of allowed frontend origins */
  WEB_ORIGIN: z
    .string()
    .default('http://localhost:5173')
    .transform((v) => v.split(',').map((o) => o.trim()).filter(Boolean)),
  /** optional path to a built frontend to serve as static files */
  WEB_DIST: z.string().optional(),
  AUTO_SEED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  LOGIN_RATE_LIMIT: z.coerce.number().int().default(20),
  ORG_TIMEZONE: z.string().default('Asia/Kolkata'),
  WORKER_POLL_MS: z.coerce.number().int().default(1000),
  WORKER_LEASE_MS: z.coerce.number().int().default(30_000),
  WORKER_CONCURRENCY: z.coerce.number().int().default(4),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

if (
  env.NODE_ENV === 'production' &&
  (env.JWT_ACCESS_SECRET.startsWith('dev-') || env.JWT_REFRESH_SECRET.startsWith('dev-'))
) {
  console.error('Refusing to start in production with default JWT secrets');
  process.exit(1);
}
