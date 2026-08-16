/**
 * The competitions strip on the landing page.
 *
 * A list, not prose, because the old hero hard-coded a single tournament into
 * its headline and FAQ — so when the World Cup finished on 16 Jul 2026 the page
 * carried on inviting people to predict it, in the present tense, for weeks. A
 * season ending should change a `status` here, not require somebody to notice
 * stale copy and rewrite it.
 *
 * Nothing in this strip is a link, deliberately. It sits below the hero and
 * answers "will you cover the thing I care about" — a question people ask once
 * they know what the product is. Routing a stranger from a marketing page into
 * a real pool would also expose members who never agreed to that; the
 * /play/[slug] pages show real boards only because those pools opted in.
 *
 * Premier League is back to "coming soon" as of 2026-08-16, and this is the
 * second time this line has moved — worth saying why rather than just flipping
 * it.
 *
 * The 2026/27 season IS imported (380 fixtures, 38 matchweeks) and migration
 * 046 did fix the scoring gate. But the league was built on World Cup
 * furniture: fixtures in `matches`, clubs in `teams.country_name`, league arms
 * inside the shared shadow scoring functions. That is being replaced by a
 * purpose-built league backend (Ryan's decision, 2026-08-15) — see
 * drafts/2026-08-16_premier_league_backend_design_v2.md.
 *
 * Until then a league pool still cannot score: `getScoringSource` returns
 * 'shadow' for `league_pickem` and the shadow tables hold nothing for it, so
 * every fixture scores zero with no error. Flip this to 'open' only when a real
 * matchweek has been scored and checked against a hand computation.
 */
export type CompetitionState = 'open' | 'upcoming' | 'complete'

export type Competition = {
  key: string
  name: string
  state: CompetitionState
  /** Short status line. This is all a visitor gets — the strip has no links. */
  status: string
  /** Two-stop gradient for the card's mode stripe, mirroring PoolListItem. */
  stripe: [string, string]
}

export const COMPETITIONS: Competition[] = [
  { key: 'premier-league', name: 'Premier League', state: 'upcoming',
    status: 'Coming soon', stripe: ['#667EEA', '#3B6EFF'] },
  { key: 'world-cup-2026', name: 'FIFA World Cup', state: 'complete',
    status: '2026 · complete', stripe: ['#F5C518', '#CD7F32'] },
  { key: 'champions-league', name: 'Champions League', state: 'upcoming',
    status: 'Coming soon', stripe: ['#34D399', '#059669'] },
  { key: 'six-nations', name: 'Six Nations', state: 'upcoming',
    status: 'Coming soon', stripe: ['#F97362', '#EF4444'] },
  { key: 'nfl', name: 'NFL', state: 'upcoming',
    status: 'Coming soon', stripe: ['#A78BFA', '#7C3AED'] },
]
