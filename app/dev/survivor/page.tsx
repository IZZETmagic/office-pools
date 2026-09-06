'use client'

// =============================================================
// LAST MAN STANDING HARNESS — dev only
// =============================================================
// The Survival tab's picks wall has four cell states and three member states,
// and a real pool three matchweeks into round one shows about two of them. The
// interesting ones — a sealed week, a member who joined late, somebody who went
// out in MW2 and whose later cells are therefore owed nothing — need a round
// that has actually run.
//
// ⚠ IT DRIVES THE REAL COMPONENT. `SurvivorTab` here is the shipped one, given
// hand-made props, so what you see is what the pool page renders. Only the data
// is faked.
//
// ⚠ AND IT NEVER WRITES. The picker POSTs to `/api/pools/harness/lms-pick`,
// which does not exist, so a click fails loudly instead of putting a pick into
// somebody's real pool. That is deliberate: verifying a picker against live data
// is how you write to a pool you did not mean to touch.
//
// ⚠ 404s IN PRODUCTION, the same guard `/dev/showdown` uses. `/dev/*` is not
// behind the tester allowlist and would otherwise be public on sportpool.io.
// =============================================================

import { notFound, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

import SurvivorTab from '../../pools/[pool_id]/SurvivorTab'
import LmsLeaderboard from '../../pools/[pool_id]/LmsLeaderboard'
import type { LeagueLeaderboard } from '@/lib/league/leaderboard'
import type { LmsPick, LmsRosterEntry } from '@/lib/league/lms'

const ROUND = { round_id: 'r1', round_number: 2, first_matchweek: 3, last_matchweek: null }

const crest = (bg: string, txt: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    // Transparent ground, like a real club crest — a solid disc would cover the
    // survived/eliminated tint behind it and make the wall look untinted.
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">`
    + `<path d="M20 2 L36 8 V22 Q36 33 20 38 Q4 33 4 22 V8 Z" fill="${bg}"/>`
    + `<text x="20" y="26" font-family="sans-serif" font-size="15" font-weight="bold"`
    + ` fill="#fff" text-anchor="middle">${txt}</text></svg>`,
  )}`

/** Six clubs is enough to fill a wall and a picker without inventing a season. */
const CLUBS = [
  { club_id: 'ars', club_name: 'Arsenal', crest_url: crest('%23EF0107', 'A'), short_name: 'ARS' },
  { club_id: 'che', club_name: 'Chelsea', crest_url: crest('%23034694', 'C'), short_name: 'CHE' },
  { club_id: 'liv', club_name: 'Liverpool', crest_url: crest('%23C8102E', 'L'), short_name: 'LIV' },
  { club_id: 'mci', club_name: 'Man City', crest_url: crest('%236CABDD', 'M'), short_name: 'MCI' },
  { club_id: 'new', club_name: 'Newcastle', crest_url: crest('%23241F20', 'N'), short_name: 'NEW' },
  { club_id: 'tot', club_name: 'Tottenham', crest_url: crest('%23132257', 'T'), short_name: 'TOT' },
] as unknown as React.ComponentProps<typeof SurvivorTab>['clubs']

/**
 * Every member state the wall can draw:
 *   e1  you, standing, one round already won
 *   e2  standing, two rounds won — the ×2 trophy
 *   e3  out in MW4; MW5 and MW6 are owed nothing
 *   e4  out in MW3, the earliest — sorts last of the eliminated
 *   e5  joined after the round opened — grey, NOT red
 *   e6  out in MW4 having never picked it — the ✗ cell. This is how you go
 *       out without ever being beaten, so it must not look like a blank.
 */
const ROSTER: LmsRosterEntry[] = [
  { entry_id: 'e1', name: 'You', inRound: true, eliminatedMatchweek: null, roundsWon: 1 },
  { entry_id: 'e2', name: 'Marcus Webb', inRound: true, eliminatedMatchweek: null, roundsWon: 2 },
  { entry_id: 'e3', name: 'Priya Raman', inRound: true, eliminatedMatchweek: 4, roundsWon: 0 },
  { entry_id: 'e4', name: 'Danny O’Shea', inRound: true, eliminatedMatchweek: 3, roundsWon: 0 },
  { entry_id: 'e5', name: 'Kwame Boateng', inRound: false, eliminatedMatchweek: null, roundsWon: 0 },
  { entry_id: 'e6', name: 'Sofia Marchetti', inRound: true, eliminatedMatchweek: 4, roundsWon: 0 },
]

const pick = (
  entry_id: string, matchweek_number: number, club_id: string,
  result: LmsPick['result'],
): LmsPick => ({ round_id: 'r1', entry_id, matchweek_number, club_id, result, fixture_id: 'f' })

/**
 * MW3 and MW4 have locked, MW5 is open.
 *
 * ⚠ MW5 CARRIES ONLY YOUR OWN PICK, which is the seal doing its job: RLS hands
 * back everyone else's only once their matchweek locks, so every other member's
 * MW5 cell must draw a padlock and not a blank.
 */
const PICKS: LmsPick[] = [
  pick('e1', 3, 'ars', 'survived'),
  pick('e1', 4, 'liv', 'survived'),
  pick('e1', 5, 'mci', null),
  pick('e2', 3, 'mci', 'survived'),
  pick('e2', 4, 'che', 'survived'),
  pick('e3', 3, 'liv', 'survived'),
  pick('e3', 4, 'tot', 'eliminated'),
  pick('e4', 3, 'new', 'eliminated'),
  pick('e6', 3, 'che', 'survived'),
  // e6 has NO MW4 pick and MW4 has locked — a ✗, not a padlock and not a blank.
  // e5 has no picks at all — they were never in this round.
  // e2 has no MW5 pick VISIBLE. Sealed, not missing.
]

const FIXTURES = new Map(
  ([
    ['ars', { opponentName: 'Everton', isHome: true }],
    ['che', { opponentName: 'Brentford', isHome: false }],
    ['liv', { opponentName: 'Wolves', isHome: true }],
    ['mci', { opponentName: 'Aston Villa', isHome: false }],
    ['new', { opponentName: 'Fulham', isHome: true }],
    // TOT deliberately absent — a club with no game cannot be backed to win, so
    // its tile must grey out and say why.
  ] as const).map(([id, f]) => [
    id,
    { ...f, opponentCrest: null, kickoffAt: '2026-09-12T14:00:00Z' },
  ]),
) as unknown as React.ComponentProps<typeof SurvivorTab>['fixtures']

const PICK_FIXTURES = new Map(
  ([
    ['e1:3', { opponentName: 'Everton', isHome: true, isCompleted: true, clubGoals: 2, opponentGoals: 1 }],
    ['e1:4', { opponentName: 'Wolves', isHome: false, isCompleted: true, clubGoals: 3, opponentGoals: 0 }],
    ['e1:5', { opponentName: 'Aston Villa', isHome: false, isCompleted: false, clubGoals: null, opponentGoals: null }],
  ] as const).map(([k, v]) => [k, v]),
) as unknown as React.ComponentProps<typeof SurvivorTab>['pickFixtures']

/**
 * ?long=1 stretches the round to twelve matchweeks — enough to overflow the
 * card, so the scroll and the open-on-newest position can be seen rather than
 * reasoned about. Three columns never overflow anything.
 */
function Harness() {
  if (process.env.NODE_ENV === 'production') notFound()
  // ⚠ `useSearchParams`, not `window.location` and not state-set-in-an-effect.
  // Reading `window` during render is a hydration mismatch (the server has no
  // query string); setting state in an effect to dodge that is what
  // `react-hooks/set-state-in-effect` exists to reject. This hook is the one
  // way to read a query string that is correct on both sides.
  const long = useSearchParams().get('long') !== null

  return (
    <div className="min-h-screen bg-neutral-50 py-6">
      <div className="max-w-3xl mx-auto px-4 space-y-4">
        <p className="text-xs text-neutral-500">
          Dev harness — round 2, MW3 and MW4 settled, MW5 open. Do not click a club: the picker
          posts to a pool that does not exist.
        </p>
        <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold">
          Leaderboard tab
        </p>
        <LmsLeaderboard board={BOARD} myEntryIds={new Set(['e1'])} />

        <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold pt-4">
          Survival tab
        </p>
        <SurvivorTab
          poolId="harness"
          round={ROUND}
          survivors={ROSTER.filter((r) => r.inRound).map((r) => ({
            entry_id: r.entry_id,
            eliminated_matchweek: r.eliminatedMatchweek,
            is_winner: false,
          }))}
          myPicks={PICKS.filter((p) => p.entry_id === 'e1')}
          allPicks={PICKS}
          roster={ROSTER}
          clubs={CLUBS}
          entryId="e1"
          currentMatchweek={5}
          inPlayMatchweek={4}
          matchweeks={long ? Array.from({ length: 12 }, (_, i) => i + 3) : [3, 4, 5]}
          lockedMatchweeks={long ? Array.from({ length: 11 }, (_, i) => i + 3) : [3, 4]}
          roundsWon={new Map(ROSTER.map((r) => [r.entry_id, r.roundsWon]))}
          fixtures={FIXTURES}
          pickFixtures={PICK_FIXTURES}
        />
      </div>
    </div>
  )
}

/** `useSearchParams` suspends, so it needs a boundary above it. */

function boardRow(
  entry_id: string, entry_name: string, username: string,
  lms: NonNullable<LeagueLeaderboard['rows'][number]['lms']>,
): LeagueLeaderboard['rows'][number] {
  return {
    entry_id, entry_name, entry_number: 1, member_id: entry_id, user_id: entry_id,
    full_name: entry_name, username,
    // ⚠ Zero and NULL on purpose. The mode has no points, and its stored rank is
    // entry_id order — which is exactly why this component ignores both.
    total_points: 0, current_rank: null, previous_rank: null,
    has_filed: false, champion: null, pickem: null, lms,
  }
}

/**
 * The leaderboard's own fixture, in `compareLms` order — season score first,
 * then survival, then who lasted longer.
 *
 * ⚠ ORDERED BY HAND HERE, and that is the point of the harness rather than a
 * shortcut: the real page gets this order from `readLeagueLeaderboard`, so this
 * list is what the sort is SUPPOSED to produce. Marcus leads on two rounds won
 * while sitting out of this one — the case the OUT chip exists to keep honest.
 */
const BOARD: LeagueLeaderboard = {
  mode: 'last_man_standing',
  depth: null,
  is_final: false,
  lms: {
    round_number: 2, first_matchweek: 3, last_matchweek: null,
    standing: 2, in_round: 5, pick_matchweek: 5, pick_in_play: false, pick_revealed: false,
  },
  rows: [
    // Two rounds won, but OUT of this one — season leads, round rides along.
    boardRow('e2', 'Marcus Webb', 'marcusw', { is_round_winner: false, in_round: true, eliminated_matchweek: 4, rounds_won: 2, pick: null, pick_sealed: false }),
    // You, still in, pick sealed because MW5 has not locked.
    boardRow('e1', 'You', 'izzetmagic', { is_round_winner: false, in_round: true, eliminated_matchweek: null, rounds_won: 1, pick: null, pick_sealed: true }),
    // Still in, and their club is public — the crest chip.
    boardRow('e7', 'Ana Lucia', 'analucia', { is_round_winner: false, in_round: true, eliminated_matchweek: null, rounds_won: 0, pick: { club_name: 'Chelsea', crest_url: crest('%23034694', 'C') }, pick_sealed: false }),
    // Out, later — sorts above the earlier exit.
    boardRow('e3', 'Priya Raman', 'priyar', { is_round_winner: false, in_round: true, eliminated_matchweek: 4, rounds_won: 0, pick: null, pick_sealed: false }),
    boardRow('e4', 'Danny O’Shea', 'dannyo', { is_round_winner: false, in_round: true, eliminated_matchweek: 3, rounds_won: 0, pick: null, pick_sealed: false }),
    // In the round, not out, nothing picked and nothing hiding it.
    boardRow('e8', 'Tom Ellis', 'tome', { is_round_winner: false, in_round: true, eliminated_matchweek: null, rounds_won: 0, pick: null, pick_sealed: false }),
    // ⚠ NOT eliminated — joined after the round opened. Grey, never red.
    boardRow('e5', 'Kwame Boateng', 'kwameb', { is_round_winner: false, in_round: false, eliminated_matchweek: null, rounds_won: 0, pick: null, pick_sealed: false }),
  ],
}

export default function SurvivorHarnessPage() {
  return (
    <Suspense fallback={null}>
      <Harness />
    </Suspense>
  )
}
