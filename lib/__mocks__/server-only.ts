// A no-op stand-in for the real `server-only` package under Vitest.
//
// The real one throws on import outside a React Server Component — which is the
// whole point of it, and which makes it unusable in a test runner that is
// neither client nor server. See the alias in `vitest.config.ts` for why the
// marker stays in the source rather than being removed to keep tests green.
export {}
