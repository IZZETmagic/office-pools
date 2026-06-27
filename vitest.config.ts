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
    include: ['lib/**/*.test.ts', 'lib/**/__tests__/**/*.test.ts'],
    reporters: ['default'],
  },
  resolve: {
    alias: {
      // Mirrors tsconfig.json paths: "@/*" → repo root.
      '@': path.resolve(__dirname, '.'),
    },
  },
})
