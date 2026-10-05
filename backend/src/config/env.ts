import { z } from 'zod';

/** Optional URL where a blank value (`PAYU_SUCCESS_URL=`) means unset. */
const optionalUrl = z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), z.string().trim().url().optional());

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
  /** organization whose catalog the customer web storefront sells */
  STOREFRONT_ORG_SLUG: z.string().default('acme'),
  /**
   * PayU India Hosted Checkout. Online payments are disabled (COD only) until key, salt and both callback
   * URLs are set. PAYU_SALT is server-only: it signs requests and verifies PayU's responses, never sent anywhere.
   */
  PAYU_MERCHANT_KEY: z.string().trim().optional(),
  PAYU_SALT: z.string().trim().optional(),
  PAYU_ENV: z.enum(['test', 'production']).default('test'),
  /** Hosted checkout endpoint; defaults from PAYU_ENV (test.payu.in / secure.payu.in). */
  PAYU_PAYMENT_URL: optionalUrl,
  /** Verify / refund API; defaults from PAYU_ENV. */
  PAYU_API_URL: optionalUrl,
  /** Public HTTPS URLs PayU posts the result to (the storefront's /payment/success and /payment/failure). */
  PAYU_SUCCESS_URL: optionalUrl,
  PAYU_FAILURE_URL: optionalUrl,
  /** Unpaid online orders are cancelled (stock released) after this many minutes. */
  PAYMENT_TIMEOUT_MINUTES: z.coerce.number().int().min(5).default(30),
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

export const payuEnabled = Boolean(env.PAYU_MERCHANT_KEY && env.PAYU_SALT && env.PAYU_SUCCESS_URL && env.PAYU_FAILURE_URL);

export const payuUrls = {
  payment: env.PAYU_PAYMENT_URL ?? (env.PAYU_ENV === 'production' ? 'https://secure.payu.in/_payment' : 'https://test.payu.in/_payment'),
  api:
    env.PAYU_API_URL ??
    (env.PAYU_ENV === 'production'
      ? 'https://info.payu.in/merchant/postservice.php?form=2'
      : 'https://test.payu.in/merchant/postservice.php?form=2'),
};

if (
  env.NODE_ENV === 'production' &&
  (env.JWT_ACCESS_SECRET.startsWith('dev-') || env.JWT_REFRESH_SECRET.startsWith('dev-'))
) {
  console.error('Refusing to start in production with default JWT secrets');
  process.exit(1);
}
