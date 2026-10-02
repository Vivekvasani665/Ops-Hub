import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@shared': fileURLToPath(new URL('./src/shared/index.ts', import.meta.url)) },
  },
  test: {
    environment: 'node',
    env: {
      NODE_ENV: 'test',
      AUTO_SEED: 'false',
      // Fake credentials: the Razorpay HTTP client is mocked in tests, only the HMAC secrets are real.
      RAZORPAY_KEY_ID: 'rzp_test_dummykey',
      RAZORPAY_KEY_SECRET: 'test_key_secret',
      RAZORPAY_WEBHOOK_SECRET: 'test_webhook_secret',
    },
    globalSetup: ['./tests/global-setup.ts'],
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
