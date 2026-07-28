import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Vitest harness for the office-pools repo.
// Introduced: T-0018 (2026-04-24), Priya.
//
// Scope: pure-function tests over the scoring engine + a small number of
// contract tests against a mocked Supabase client. No real DB, no network.
// Runs in CI in under a few seconds.
export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    // app/** was added 2026-07-28 for pure logic that lives next to a component
    // rather than in lib/ — the /live delta merge, whose paths no production
    // data can reach (every match is completed, so the live half is empty).
    include: [
      'lib/**/*.test.ts',
      'lib/**/__tests__/**/*.test.ts',
      'app/**/__tests__/**/*.test.ts',
    ],
    reporters: ['default'],
  },
  resolve: {
    alias: {
      // Mirrors tsconfig.json paths: "@/*" → repo root.
      '@': path.resolve(__dirname, '.'),
    },
  },
})
