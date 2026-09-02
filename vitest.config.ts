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
    //
    // components/** was added 2026-08-28 for the same reason and with the same
    // limit: pure functions and source-text guards only, no rendering. The
    // first one is the create-pool wizard's `withoutSeason`, which decides what
    // a member reads on the card they pick a competition from.
    // mobile/** was added 2026-09-02, and it is the first coverage the Expo app
    // has ever had — `mobile/` is a separate npm project with no test runner of
    // its own, so until now zero of its logic was asserted anywhere.
    //
    // ⚠ THE SAME LIMIT, AND IT IS LOAD-BEARING HERE: pure modules only. Nothing
    // under this glob may import `react-native`, `expo-router` or anything that
    // reaches them — those resolve out of `mobile/node_modules`, which this
    // config knows nothing about, and the failure is an unresolved import
    // rather than anything informative. The way to test screen logic is to move
    // the logic out of the screen, which is what `lib/resultsSections.ts` is.
    include: [
      'lib/**/*.test.ts',
      'lib/**/__tests__/**/*.test.ts',
      'app/**/__tests__/**/*.test.ts',
      'components/**/__tests__/**/*.test.ts',
      'mobile/**/__tests__/**/*.test.ts',
    ],
    reporters: ['default'],
  },
  resolve: {
    alias: {
      // Mirrors tsconfig.json paths: "@/*" → repo root.
      '@': path.resolve(__dirname, '.'),
      // `server-only` is a build-time boundary marker: it throws the moment it
      // is imported outside a Server Component, which is exactly what makes it
      // useful in the app and useless here. Vitest is neither a client nor a
      // server bundle, so it always throws.
      //
      // Aliased to a no-op rather than removed from the modules that use it —
      // `lib/league/season.ts` imports it BECAUSE a client component once
      // reached that file transitively and put `revalidateTag` in the browser
      // bundle, failing the build. Dropping the marker to make tests pass would
      // trade a real guard for a green tick.
      'server-only': path.resolve(__dirname, 'lib/__mocks__/server-only.ts'),
    },
  },
})
