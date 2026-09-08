/**
 * Contact form categories.
 *
 * ONE list, imported by both the form and the API route, because the two have to
 * agree on which categories demand a pool code. If each side kept its own copy a
 * category could drift into being required on the server and optional in the UI,
 * and that mismatch surfaces only as a rejected submission the user has no way to
 * fix — the field they are missing wouldn't be on screen.
 *
 * `requiresPoolCode` is the entire point of categorising: a message about one
 * specific pool is close to unactionable without knowing which pool, so those
 * categories make the code mandatory rather than politely asking for it. The
 * categories that don't concern a single pool must NOT ask for one — a required
 * field a user can't fill is how you lose the report instead of triaging it.
 *
 * Ordered pool-first: the ones that need a code are the ones support most often
 * can't resolve without it, so they sit at the top of the menu. `other` is last
 * and deliberately catches everything, so there is always a way to send the
 * message — a taxonomy that can't express your problem just gets you a
 * mis-filed ticket.
 */
export type ContactCategory = {
  /** Stable key. Travels as a Resend tag value, so keep it `[A-Za-z0-9_-]`. */
  id: string
  label: string
  requiresPoolCode: boolean
}

export const CONTACT_CATEGORIES: readonly ContactCategory[] = [
  { id: 'scoring', label: 'Scoring or points', requiresPoolCode: true },
  { id: 'predictions', label: 'Predictions or deadlines', requiresPoolCode: true },
  { id: 'members', label: 'Pool members or admin', requiresPoolCode: true },
  { id: 'pool_other', label: 'Something else about a specific pool', requiresPoolCode: true },
  { id: 'account', label: 'Account or login', requiresPoolCode: false },
  { id: 'email', label: 'Emails or notifications', requiresPoolCode: false },
  { id: 'fees', label: 'Entry fees or branded pools', requiresPoolCode: false },
  { id: 'feedback', label: 'Feedback or feature request', requiresPoolCode: false },
  { id: 'other', label: 'Other', requiresPoolCode: false },
] as const

export function findContactCategory(id: unknown): ContactCategory | undefined {
  if (typeof id !== 'string') return undefined
  return CONTACT_CATEGORIES.find((c) => c.id === id)
}

/**
 * Pool codes are stored uppercase alphanumeric (all 640 live codes are 6–8 of
 * `[A-Z0-9]`), but people paste them out of chat with spaces, dashes or in
 * lower case. Normalise rather than reject: the format is a typo check, not a
 * security boundary, and the submission is worth more than the tidiness.
 */
export function normalizePoolCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/**
 * Deliberately wider than the 6–8 codes in the table. We are not verifying the
 * pool exists — that would mean an unauthenticated lookup that lets anyone probe
 * which codes are real. Support resolves the code; this only catches fat fingers.
 */
export const POOL_CODE_MIN = 4
export const POOL_CODE_MAX = 12

export function isValidPoolCode(normalized: string): boolean {
  return normalized.length >= POOL_CODE_MIN && normalized.length <= POOL_CODE_MAX
}
