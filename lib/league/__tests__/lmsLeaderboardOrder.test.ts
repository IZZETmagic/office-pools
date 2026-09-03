// =============================================================
// The Last Man Standing leaderboard's ordering
// =============================================================
// `scripts/verify-lms-leaderboard.ts` proves this against production, but the
// only LMS pool that exists is in ROUND ONE — every `rounds_won` is 0, so the
// rung that Ryan actually had to decide (2026-09-03: does a past round winner
// lead in a week they are out?) is never exercised by real data. These are the
// rounds the season has not reached yet.
//
// ⚠ The failure this guards is not cosmetic. `league_finalize_ranks` falls all
// the way through to `entry_id ASC` in this mode — every rung of its cascade is
// zero and LMS picks are not in `league_predictions` — so the stored rank puts
// eliminated members above survivors. Verified on production: all ten ranks in
// the live pool matched entry_id order exactly. If this ordering regresses, the
// screen goes back to saying somebody knocked out in matchweek 2 is doing
// better than somebody still in it.
// =============================================================

import { describe, it, expect } from 'vitest'
import { compareLms, type LeagueLeaderboardRow, type LmsRowState } from '../leaderboard'

function row(name: string, lms: Partial<LmsRowState>): LeagueLeaderboardRow {
  return {
    entry_id: `entry-${name}`,
    entry_name: name,
    entry_number: 1,
    member_id: `member-${name}`,
    user_id: `user-${name}`,
    full_name: name,
    username: name.toLowerCase(),
    total_points: 0,
    current_rank: null,
    previous_rank: null,
    has_filed: true,
    champion: null,
    // Absent in this mode, like `champion` above — an LMS pool has no fixture
    // form to plot. That this line is REQUIRED is the type discipline working:
    // adding the block to the row broke every fixture that had not considered it.
    pickem: null,
    lms: {
      eliminated_matchweek: null,
      is_round_winner: false,
      in_round: true,
      rounds_won: 0,
      // The club chip plays no part in the ORDER — deliberately. Who you are
      // backing is not a ranking fact, and if it ever starts affecting position
      // the last test in this file fails.
      pick: null,
      pick_sealed: false,
      ...lms,
    },
  }
}

const order = (rows: LeagueLeaderboardRow[]) => [...rows].sort(compareLms).map((r) => r.entry_name)

describe('the LMS leaderboard order', () => {
  it('puts survivors above the eliminated when nobody has won a round', () => {
    expect(
      order([
        row('Sarah', { eliminated_matchweek: 2 }),
        row('Elena', {}),
        row('Marcus', { eliminated_matchweek: 2 }),
        row('Aisha', {}),
      ]),
    ).toEqual(['Aisha', 'Elena', 'Marcus', 'Sarah'])
  })

  it('ranks the eliminated by who lasted longer', () => {
    expect(
      order([
        row('WentEarly', { eliminated_matchweek: 3 }),
        row('WentLate', { eliminated_matchweek: 9 }),
        row('WentMiddle', { eliminated_matchweek: 6 }),
      ]),
    ).toEqual(['WentLate', 'WentMiddle', 'WentEarly'])
  })

  // ⭐ Ryan's decision, 2026-09-03: the season leads. A two-time winner who is
  // out this week still tops the pool — the row's OUT chip is what keeps that
  // from reading as a claim to be alive.
  it('puts a past round winner above a survivor who has won none', () => {
    expect(
      order([
        row('NeverWon', {}),
        row('WonTwice', { eliminated_matchweek: 6, rounds_won: 2 }),
        row('WonOnce', { rounds_won: 1 }),
      ]),
    ).toEqual(['WonTwice', 'WonOnce', 'NeverWon'])
  })

  // ⚠ Not eliminated. They joined after the round opened and enter the next one,
  // because everybody in it has already spent clubs. Sorting them among the out
  // would be as wrong as painting them red.
  it('puts someone who is not in the round below those who played it', () => {
    expect(
      order([
        row('JoinedLate', { in_round: false }),
        row('Out', { eliminated_matchweek: 2 }),
        row('Standing', {}),
      ]),
    ).toEqual(['Standing', 'Out', 'JoinedLate'])
  })

  it('still ranks a late joiner on rounds won — they are in the season', () => {
    expect(
      order([
        row('Standing', {}),
        row('LateButDecorated', { in_round: false, rounds_won: 1 }),
      ]),
    ).toEqual(['LateButDecorated', 'Standing'])
  })

  // A total order: an unrelated re-score must never reshuffle the list. Falling
  // back to entry_id is what the stored rank does with EVERY row, which is the
  // bug — here it is only ever reached by two rows that tie on everything else.
  it('is stable and total when every fact ties', () => {
    const rows = [row('Bella', {}), row('adam', {}), row('Carl', {})]
    expect(order(rows)).toEqual(['adam', 'Bella', 'Carl'])
    expect(order([...rows].reverse())).toEqual(['adam', 'Bella', 'Carl'])
  })

  it('never reads total_points — there are no points in this mode', () => {
    const loser = row('Loser', { eliminated_matchweek: 2 })
    loser.total_points = 9999
    expect(order([loser, row('Winner', {})])).toEqual(['Winner', 'Loser'])
  })
})
