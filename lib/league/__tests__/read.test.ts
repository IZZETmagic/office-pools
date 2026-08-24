// =============================================================
// League read adapters (vertical slice, S2).
// =============================================================
// The round-state derivation is the part worth pinning. A league pool holds
// ZERO `pool_round_states` rows, so these values are computed on every read —
// and a wrong one either hides a matchweek a member can still predict, or
// invites picks on one that has locked.
// =============================================================

import { describe, it, expect } from 'vitest'
import { deriveRoundSubmissions } from '@/lib/league/read'
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
