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
      // Fake credentials: PayU's Verify / Refund API calls are mocked in tests, only the hashing is real.
      PAYU_MERCHANT_KEY: 'testkey',
      PAYU_SALT: 'test_salt',
      PAYU_SUCCESS_URL: 'https://shop.example.com/payment/success',
      PAYU_FAILURE_URL: 'https://shop.example.com/payment/failure',
    },
    globalSetup: ['./tests/global-setup.ts'],
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
