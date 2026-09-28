// =============================================================
// Where the design harnesses are allowed to exist
// =============================================================
// ⭐ ONE OWNER FOR THE RULE, read from two places that cannot share code any
// other way: `proxy.ts` (the cheap early 404 — `middleware.ts` until the Next 16
// rename, and no longer at the edge: a proxy always runs on Node.js) and
// `app/dev-harness/layout.tsx` (the server-component gate that a request cannot
// route around). Both layers are wanted — see the note in the layout about
// CVE-2025-29927 — but the CONDITION must be single-sourced, or the day someone
// relaxes one for local debugging the other silently keeps a harness reachable.
// =============================================================

/** The `/dev-harness` tree, as the proxy matcher sees it. */
export const DEV_HARNESS_PREFIX = '/dev-harness'

/**
 * True only on the public production deployment.
 *
 * ⚠⚠ VERCEL_ENV, NOT NODE_ENV. This is the whole subtlety. `dev.sportpool.io` is
 * a Vercel PREVIEW deployment serving a production build, so `NODE_ENV` is
 * 'production' there as well — gating on it would delete the harnesses from the
 * single environment they are used in. VERCEL_ENV separates the three cases:
 * 'production' on sportpool.io, 'preview' on dev.sportpool.io and every branch
 * deploy, and unset under `next dev`.
 *
 * ⚠ The default is PERMISSIVE, and that is the correct direction here: an unset
 * variable means a developer's own machine, and a gate that fired there would
 * make the harnesses useless everywhere. The production string is the only value
 * that closes the door, and Vercel sets it on every production request.
 */
export function isPublicProduction(): boolean {
  return process.env.VERCEL_ENV === 'production'
}

/**
 * True when this request must be refused: a harness path, on the public site.
 *
 * ⚠ Matches the tree, not an exact path — `/dev-harness` itself, anything under
 * it, and any harness added later are all covered without a list to maintain.
 */
export function isBlockedHarnessPath(pathname: string): boolean {
  return isPublicProduction() && pathname.startsWith(DEV_HARNESS_PREFIX)
}
