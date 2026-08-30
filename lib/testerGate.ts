// =============================================================
// The tester gate — a private build, gated in the app not at the edge
// =============================================================
// dev.sportpool.io is a Vercel *preview* deployment carrying a stable
// alias, and it reads and writes the SAME Supabase project as production
// (`NEXT_PUBLIC_SUPABASE_URL` holds one value across all three
// environments). So "who can get in" is not a cosmetic question: an
// unrecognised signup on dev creates pools in the live database, and the
// production crons then score them and mail real people about them.
//
// The gate is deliberately here rather than at Vercel's edge. Every
// edge-level option — Vercel Authentication, Password Protection, a
// Shareable Link — works by putting a bypass cookie in ONE browser, which
// breaks the exact flows a tester has to exercise: the Supabase magic-link
// mail opened on a phone, an invite link shared with another tester, the
// Expo app calling the API directly. Comparing the signed-in email costs
// one lookup and survives every one of those hops.
//
// ⚠ PRODUCTION IS NEVER GATED. sportpool.io serves live pools. If
// TESTER_ALLOWLIST were ever set on the production environment by mistake,
// a dozen listed emails would lock out everybody else, so
// `isTesterGateEnabled` refuses to arm on production whatever the variable
// says. That refusal is the load-bearing line in this file.
//
// Known limit: the gate governs what a signed-in account can REACH, not
// whether an account can be created. Signup talks to Supabase directly and
// never crosses this middleware, so a stranger can still register — they
// just land on /not-a-tester and can do nothing. Closing that too would
// need a database-level check.
// =============================================================

/**
 * Paths that stay reachable to a signed-in non-tester. Without these the
 * gate would eat its own wall page, and would strand a blocked account
 * with no way to sign out or read the terms it agreed to.
 */
const EXEMPT_PATHS = [
  '/not-a-tester',
  '/auth', // Supabase callback + signout — the gate must never eat these
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/account-deleted',
  '/privacy',
  '/terms',
  '/refund-policy',
  '/contact',
  '/faq',
]

/** Split `TESTER_ALLOWLIST` into comparable entries. */
export function parseAllowlist(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
}

/**
 * Is the gate armed? Only when an allowlist is configured AND this is not
 * production. Both halves matter: an empty list must not lock out a
 * preview, and a populated list must not lock out sportpool.io.
 */
export function isTesterGateEnabled(
  vercelEnv: string | undefined,
  rawAllowlist: string | undefined
): boolean {
  if (vercelEnv === 'production') return false
  return parseAllowlist(rawAllowlist).length > 0
}

/**
 * Is this email invited? Entries match either exactly (`sam@example.com`)
 * or by domain when written with a leading `@` (`@sportpool.io`).
 */
export function isAllowedTester(
  email: string | undefined | null,
  rawAllowlist: string | undefined
): boolean {
  if (!email) return false
  const candidate = email.trim().toLowerCase()
  if (!candidate) return false

  return parseAllowlist(rawAllowlist).some((entry) =>
    entry.startsWith('@') ? candidate.endsWith(entry) : entry === candidate
  )
}

/** Paths the gate lets through regardless of who is signed in. */
export function isTesterGateExempt(pathname: string): boolean {
  return EXEMPT_PATHS.some(
    (exempt) => pathname === exempt || pathname.startsWith(`${exempt}/`)
  )
}
