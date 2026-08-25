// =============================================================
// League read adapters (vertical slice, S2).
// =============================================================
// The round-state derivation is the part worth pinning. A league pool holds
// ZERO `pool_round_states` rows, so these values are computed on every read —
// and a wrong one either hides a matchweek a member can still predict, or
// invites picks on one that has locked.
// =============================================================

import { describe, it, expect } from 'vitest'
import { deriveRoundSubmissions, openMatchweekId } from '@/lib/league/read'
import type { MatchweekRow } from '@/lib/league/read'
import { matchesInRound } from '@/lib/competitionRounds'
import type { Prediction } from '@/lib/tournament'
import type { MatchData } from '@/app/pools/[pool_id]/types'

/** A fixture in the shape the adapter produces. */
function fx(id: string, matchweek: number): MatchData {
  return {
    match_id: id,
    match_number: 1,
    // The contract `lib/competitionRounds.matchInRound` was built to. Putting
    // the matchweek key in `stage` instead makes matchesInRound return zero for
    // every round, silently — which is exactly what the first version did.
    stage: 'regular_season',
    group_letter: null,
    round_number: matchweek,
    match_date: '2026-08-22T14:00:00+00:00',
    venue: null,
    status: 'scheduled',
    home_team_id: 'h',
    away_team_id: 'a',
    home_team_placeholder: null,
    away_team_placeholder: null,
    home_score_ft: null,
    away_score_ft: null,
    home_score_pso: null,
    away_score_pso: null,
    winner_team_id: null,
    is_completed: false,
    completed_at: null,
    status_detail: null,
    original_match_date: null,
    live_minute: null,
    live_period: null,
    home_team: null,
    away_team: null,
    tournament_id: 't1',
  }
}

function pick(matchId: string): Prediction {
  return {
    match_id: matchId,
    predicted_home_score: 1,
    predicted_away_score: 0,
    predicted_home_pso: null,
    predicted_away_pso: null,
    predicted_winner_team_id: null,
  }
}

describe('the adapter output groups by the round selector', () => {
  it('puts each fixture in its own matchweek', () => {
    const matches = [fx('a', 1), fx('b', 1), fx('c', 2)]
    expect(matchesInRound(matches, 'mw_1').map((m) => m.match_id)).toEqual(['a', 'b'])
    expect(matchesInRound(matches, 'mw_2').map((m) => m.match_id)).toEqual(['c'])
  })

  it('REGRESSION: a matchweek key in `stage` groups nothing', () => {
    // The adapter's first version set stage = 'mw_1'. matchInRound requires
    // stage === 'regular_season', so every round came back empty — with no
    // error anywhere. This asserts the failure mode rather than trusting a
    // comment not to drift.
    const wrong = [{ ...fx('a', 1), stage: 'mw_1' } as MatchData]
    expect(matchesInRound(wrong, 'mw_1')).toHaveLength(0)
  })
})

describe('deriveRoundSubmissions — submitted means every fixture picked', () => {
  const matches = [fx('a', 1), fx('b', 1), fx('c', 2)]

  it('marks a matchweek submitted only when it is complete', () => {
    const out = deriveRoundSubmissions('e1', matches, [pick('a'), pick('b')])
    expect(out.map((r) => r.round_key)).toEqual(['mw_1'])
    expect(out[0].has_submitted).toBe(true)
    expect(out[0].prediction_count).toBe(2)
  })

  it('does not mark a partially picked matchweek', () => {
    const out = deriveRoundSubmissions('e1', matches, [pick('a')])
    expect(out).toHaveLength(0)
  })

  it('marks several independently', () => {
    const out = deriveRoundSubmissions('e1', matches, [pick('a'), pick('b'), pick('c')])
    expect(out.map((r) => r.round_key).sort()).toEqual(['mw_1', 'mw_2'])
  })

  it('is derived from the picks, never from a flag', () => {
    // The slice's load-bearing constraint: nothing on the league path may write
    // pool_entries.has_submitted_predictions, because that column is one of only
    // two doors by which a league entry can enter the World Cup scoring
    // selectors. Submission state is therefore a FACT ABOUT THE PICKS — it
    // cannot drift from them, and it needs no column to store it.
    const none = deriveRoundSubmissions('e1', matches, [])
    expect(none).toEqual([])
  })
})

// =============================================================
// The matchweek rhythm — decision 16, strictly one open at a time
// =============================================================
// This REPLACED a deliberate behaviour, so it is worth pinning hard. The
// adapter used to open every matchweek whose lock was in the future, reasoning
// that "week 30 is predictable in August". Ryan overruled that: one at a time,
// opening automatically as the previous one locks, with no admin lever — 38
// matchweeks over ten months cannot depend on somebody pressing a button.
//
// The whole rule is "the earliest matchweek that is neither locked nor
// finished", which is what makes it self-driving: no cron opens anything, the
// open matchweek simply moves when the clock passes a lock.

const NOW = Date.parse('2026-11-01T12:00:00+00:00')
const HOUR = 3600_000

/** A matchweek. Defaults to wide open: nothing played, lock far in the future. */
function mw(n: number, over: Partial<MatchweekRow> = {}): MatchweekRow {
  return {
    matchweek_id: `mw${n}`,
    matchweek_number: n,
    fixture_count: 10,
    completed_fixture_count: 0,
    lock_at: new Date(NOW + 24 * HOUR * n).toISOString(),
    first_kickoff_at: null,
    ...over,
  }
}

const played = (n: number) => mw(n, { completed_fixture_count: 10, lock_at: new Date(NOW - 24 * HOUR * n).toISOString() })
const locked = (n: number) => mw(n, { lock_at: new Date(NOW - HOUR).toISOString() })

describe('openMatchweekId — exactly one matchweek is open', () => {
  it('opens the first matchweek at the start of a season', () => {
    expect(openMatchweekId([mw(1), mw(2), mw(3)], NOW)).toBe('mw1')
  })

  it('opens the one after the last played matchweek', () => {
    expect(openMatchweekId([played(1), played(2), mw(3), mw(4)], NOW)).toBe('mw3')
  })

  it('moves on the instant the previous matchweek locks — no cron, no button', () => {
    // The ONLY thing that changes between these two calls is the clock.
    const season = [mw(1, { lock_at: new Date(NOW + HOUR).toISOString() }), mw(2), mw(3)]
    expect(openMatchweekId(season, NOW)).toBe('mw1')
    expect(openMatchweekId(season, NOW + 2 * HOUR)).toBe('mw2')
  })

  it('does not let a member work ahead', () => {
    const open = openMatchweekId([played(1), mw(2), mw(3), mw(4)], NOW)
    expect(open).toBe('mw2')
    // mw3 and mw4 are unlocked and unplayed, and still must not be open.
    expect(open).not.toBe('mw3')
    expect(open).not.toBe('mw4')
  })

  it('skips a locked-but-unfinished matchweek instead of stalling behind it', () => {
    // Postponements are normal: a matchweek can sit locked with fixtures still
    // to play for weeks. If that held the season shut, the pool would die.
    expect(openMatchweekId([locked(1), mw(2), mw(3)], NOW)).toBe('mw2')
  })

  it('treats an empty matchweek as finished, never as open', () => {
    // An empty matchweek has nothing to predict and must not invite picks.
    expect(openMatchweekId([mw(1, { fixture_count: 0 }), mw(2)], NOW)).toBe('mw2')
  })

  it('returns null once the season is over', () => {
    expect(openMatchweekId([played(1), played(2)], NOW)).toBeNull()
  })

  it('is ordered by matchweek number, not by array order', () => {
    // The read orders by matchweek_number, but the rule must not depend on the
    // caller having done that.
    expect(openMatchweekId([mw(3), mw(1), mw(2)], NOW)).toBe('mw1')
  })
})

// =============================================================
// Results depth — a matchweek is submitted when every fixture is TAPPED
// =============================================================
// `deriveRoundSubmissions` derives submission from the picks, never from a
// flag. A Results pool has no scorelines at all, so passing only the scoreline
// array would leave every matchweek reading 0 of 10 forever.

describe('deriveRoundSubmissions — Results depth counts taps', () => {
  const mw1 = [fx('a', 1), fx('b', 1)]

  it('counts an outcome pick as a pick', () => {
    const outcomes = new Map([['a', 'home'], ['b', 'draw']])
    const subs = deriveRoundSubmissions('e1', mw1, [], outcomes)
    expect(subs.map((s) => s.round_key)).toEqual(['mw_1'])
    expect(subs[0].prediction_count).toBe(2)
  })

  it('does not mark a partially tapped matchweek', () => {
    const outcomes = new Map([['a', 'home']])
    expect(deriveRoundSubmissions('e1', mw1, [], outcomes)).toEqual([])
  })

  it('REGRESSION: without the outcomes map a Results pool never submits', () => {
    // The whole bug: scorelines are legitimately empty at this depth.
    expect(deriveRoundSubmissions('e1', mw1, [])).toEqual([])
  })

  it('counts both shapes together, for a pool that has changed nothing', () => {
    // Not a real state today — depth is immutable — but the function should not
    // silently drop one kind if it ever sees both.
    const subs = deriveRoundSubmissions('e1', mw1, [pick('a')], new Map([['b', 'away']]))
    expect(subs.map((s) => s.round_key)).toEqual(['mw_1'])
  })
})
