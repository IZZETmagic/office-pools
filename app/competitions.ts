/**
 * What the landing page's hero rail offers.
 *
 * This is a list, not prose, because the old hero hard-coded a single
 * tournament into its headline and FAQ — so when the World Cup finished on
 * 16 Jul 2026 the page carried on inviting people to predict it, in the present
 * tense, for weeks. A season ending should change a `state` here, not require
 * someone to notice and rewrite copy.
 *
 * `state` drives everything the card renders:
 *
 *   open      — taking pools now; the card is the primary call to action
 *   upcoming  — announced, but pools can't be created yet
 *   complete  — finished; kept as proof the thing works, not as an invitation
 *
 * Premier League is deliberately `upcoming` rather than `open`. Ingestion is
 * live (migration 024 + importLeagueSeason.ts), but the scoring engine still
 * decides stage by `stage === 'group'` (lib/scoring/core.ts), and the importer
 * writes REGULAR_SEASON_STAGE — so every league match takes the knockout path,
 * fails the bracket-team check that path requires, and scores zero. Silently.
 * Sending commissioners at that is worse than making them wait, so the card
 * collects interest instead. Flip this one field when league scoring lands.
 */
export type CompetitionState = 'open' | 'upcoming' | 'complete'

export type Competition = {
  key: string
  name: string
  /** Season or edition, e.g. "2026/27". Shown next to the name. */
  edition: string
  state: CompetitionState
  /** Short status line — what a commissioner needs to know right now. */
  status: string
  cta: string
  href: string
  /** Two-stop gradient for the card's mode stripe, mirroring PoolListItem. */
  stripe: [string, string]
}

export const COMPETITIONS: Competition[] = [
  {
    key: 'premier-league',
    name: 'Premier League',
    edition: '2026/27',
    state: 'upcoming',
    status: 'Season starts this month',
    cta: 'Tell me when it opens',
    href: '/contact?about=premier-league',
    stripe: ['#667EEA', '#3B6EFF'],
  },
  {
    key: 'world-cup-2026',
    name: 'FIFA World Cup',
    edition: '2026',
    state: 'complete',
    status: 'Complete · 104 matches played',
    cta: 'See how it played out',
    href: '/play/demo',
    stripe: ['#F5C518', '#CD7F32'],
  },
]

/** The one a visitor should act on, if any. */
export function primaryCompetition(): Competition | undefined {
  return COMPETITIONS.find((c) => c.state === 'open')
    ?? COMPETITIONS.find((c) => c.state === 'upcoming')
}
