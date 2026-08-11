import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/e2e/**/*.spec.ts'],
    exclude: ['node_modules/**', 'dist/**'],
    testTimeout: 300_000,
    hookTimeout: 300_000,
  },
});
