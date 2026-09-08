/**
 * The one place the Terms of Service version lives.
 *
 * ⚠ WHY THIS FILE EXISTS. Until 2026-09-07 the version was stated in three
 * places and no two agreed:
 *
 *   - `app/terms/page.tsx` rendered "Last updated: April 18, 2026"
 *   - `app/signup/SignupForm.tsx` posted a hardcoded `terms_version: '2026-03-01'`
 *   - the file's own mtime said August, because a branding rename touched it
 *
 * So every row in `terms_agreements` written between April and September
 * recorded consent to a version that was already five months stale. That table
 * stores `ip_address` and `user_agent` for one reason — to be an audit trail —
 * and the single field that makes it meaningful was wrong.
 *
 * The failure mode is quiet and it repeats: someone edits the Terms, bumps the
 * date on the page, and the recorded version does not move. A constant both
 * sides read is the only shape that cannot drift.
 *
 * ## When you change the Terms
 *
 * Change BOTH values below, together, in the same commit as the copy edit.
 * `TERMS_VERSION` is what gets written to the database and must stay sortable;
 * `TERMS_LAST_UPDATED` is what a human reads on the page. They describe the
 * same event and must never disagree.
 *
 * Do not backdate. A version is the day the words changed, not the day the
 * change was planned.
 */

/** ISO date of the current Terms. Written to `terms_agreements.terms_version`. */
export const TERMS_VERSION = '2026-09-07'

/** The same date, as rendered to a reader at the top of the Terms page. */
export const TERMS_LAST_UPDATED = 'September 7, 2026'
