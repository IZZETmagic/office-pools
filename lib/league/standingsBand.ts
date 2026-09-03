// =============================================================
// WHICH QUALIFICATION BAND A TABLE ROW IS IN
// =============================================================
// Lifted out of `LeagueTableTab` when React Native needed the same answer.
// Mobile is a separate npm project and cannot import from `app/`, so the choice
// was a second copy or a shared owner — and the phrases here match migration
// 113's SQL exactly, which makes a divergent copy a table shaded one way and
// scored another.
//
// The rows the phone renders are shaped by `/api/users/:id/fixtures`, so this
// runs on the server for both surfaces and neither client classifies anything.
// =============================================================

export type StandingsBand = 'champions' | 'europa' | 'conference' | 'relegation'

/**
 * The feed's `description` is free text and varies by competition — "Promotion -
 * Champions League (League phase)", "Relegation", and so on. Matching on a
 * couple of keywords is deliberately loose: an unrecognised band simply gets no
 * stripe, which is a missing decoration rather than a wrong one.
 *
 * ⚠ This describes the REAL table, so it can disagree with a pool's SCORING
 * band on purpose. A cup winner sitting 15th carries a Europa tag from the feed
 * and gets the stripe here, because they did qualify.
 */
export function bandOf(description: string | null): StandingsBand | null {
  if (!description) return null
  const d = description.toLowerCase()
  if (d.includes('relegation')) return 'relegation'
  if (d.includes('champions league')) return 'champions'
  // ⚠ CONFERENCE BEFORE EUROPA. The 2023/24 vintage of this feed reads
  // "Promotion - Europa Conference League (Qualification: )", which contains
  // both words; testing Conference first is what keeps it out of the Europa
  // band. The phrases match migration 113's SQL exactly, so a row shaded as
  // Europa here is a row the engine counts as Europa.
  if (d.includes('conference league')) return 'conference'
  if (d.includes('europa league')) return 'europa'
  return null
}
