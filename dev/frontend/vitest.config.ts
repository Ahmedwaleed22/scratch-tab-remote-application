import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/*.test.ts'],
    globalSetup: ['./tests/support/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 60000,
    forceRerunTriggers: ['**/src/**', '**/ui/style/**', '**/vitest.config.*'],
  },
  server: {
    watch: { ignored: ['**/.test-build/**', '**/ui/licenses/**'] },
  },
});
