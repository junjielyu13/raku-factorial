import { defineConfig } from 'vitest/config';

// Unit tests live under src/. The e2e/ Playwright specs and the Deno tests in
// supabase/functions/ run under their own runners, so keep them out of vitest.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
