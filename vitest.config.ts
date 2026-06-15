import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/workflow/**/*.test.ts'],
    setupFiles: ['src/test/setup.ts'],
    environment: 'node',
    globals: false,
    // Run each test file in isolation — most Autonomy modules export a
    // singleton and we don't want cross-file state leaks.
    isolate: true,
    pool: 'forks',
    poolOptions: { forks: { singleFork: false } },
  },
});

