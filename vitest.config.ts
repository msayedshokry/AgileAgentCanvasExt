import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Phase 15: broadened from a hardcoded per-subfolder list to
    // `'src/**/*.test.ts'` so future test additions to ANY new
    // `src/<x>/` subfolder are picked up automatically. The prior
    // hardcoded list silently skipped tests whenever a new
    // `src/<x>/` was added — see Phase 15 commit message for the
    // src/state/ bug that motivated this change. If test discovery
    // becomes a perf issue later, re-tighten with an explicit list.
    include: ['src/**/*.test.ts'],
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
