import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/*.test.mjs'],
    globalSetup: ['./tests/support/global-setup.mjs'],
    fileParallelism: false,
    testTimeout: 60000,
    forceRerunTriggers: ['**/src/**', '**/ui/style/**', '**/vitest.config.*'],
  },
  server: {
    watch: { ignored: ['**/.test-build/**', '**/ui/licenses/**'] },
  },
});
