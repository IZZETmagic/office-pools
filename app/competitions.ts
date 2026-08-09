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
 * Premier League says "coming soon" rather than taking pools. Ingestion is live
 * (migration 024 + importLeagueSeason.ts), but the scoring engine decides stage
 * by `stage === 'group'` (lib/scoring/core.ts) while the importer writes
 * REGULAR_SEASON_STAGE — so every league match takes the knockout path, fails
 * the bracket-team check that path requires, and scores zero. Silently. Update
 * the status when league scoring lands.
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
