import { defineConfig } from 'vitest/config';

export default defineConfig({
  // 221 jsdom files in parallel load the CPU enough that a 1-2 s game test can pass 5 s.
  test: { environment: 'jsdom', include: ['src/**/*.test.ts'], passWithNoTests: true, testTimeout: 15000 },
});
