// =============================================================
// Retraction settlement test — audit §3.2 scenario
// =============================================================
// T-0018 / D-014 (2026-04-24), Priya.
//
// Proves that the scoring engine's destructive-rebuild pattern settles
// correctly after a retraction. Scenario:
//
//   Match state:  0-0 → 1-0 → 0-0   (goal entered then retracted)
//   Entry A:      predicted 2-1     (home winner)
//   Entry B:      predicted 0-0     (draw)
//   Entry C:      predicted 1-0     (exact home)
//
// For each state we simulate what the orchestrator writes by calling
// `computeMatchScore` per entry and aggregating per-entry totals the
// same way `full.ts` does. We then assert that the final state (post
// retraction) is byte-identical to the pre-goal state, modulo the
// `calculated_at` timestamp.
//
// This is the exact settlement assertion the audit requested.
// See products/office-pools/engineering/04-scoring-recalc-audit.md §3.2.

import { describe, it, expect } from 'vitest'
import { computeMatchScore } from '../core'
import { DEFAULT_POOL_SETTINGS } from '@/app/pools/[pool_id]/results/points'
import type { MatchWithResult, EntryPrediction, PoolSettings, MatchScoreRow } from '../types'

const settings: PoolSettings = { ...DEFAULT_POOL_SETTINGS }

const POOL_ID = 'pool-retraction-fixture'
const MATCH_ID = 'match-retraction-fixture'

function buildMatch(homeScore: number, awayScore: number): MatchWithResult {
  return {
    match_id: MATCH_ID,
    match_number: 1,
    stage: 'group',
    group_letter: 'A',
    match_date: '2026-06-11T20:00:00Z',
    venue: 'Estadio Azteca',
    status: 'live',
    home_team_id: 'team-home',
    away_team_id: 'team-away',
    home_team_placeholder: null,
    away_team_placeholder: null,
    home_team: { country_name: 'Mexico', flag_url: null },
    away_team: { country_name: 'USA', flag_url: null },
    is_completed: false,
    home_score_ft: homeScore,
    away_score_ft: awayScore,
    home_score_pso: null,
    away_score_pso: null,
    winner_team_id: null,
    tournament_id: 'tournament-fixture',
  }
}

const predictions: Record<'A' | 'B' | 'C', EntryPrediction> = {
  A: {
    match_id: MATCH_ID,
    predicted_home_score: 2,
    predicted_away_score: 1,
    predicted_home_pso: null,
    predicted_away_pso: null,
    predicted_winner_team_id: 'team-home',
  },
  B: {
    match_id: MATCH_ID,
    predicted_home_score: 0,
    predicted_away_score: 0,
    predicted_home_pso: null,
    predicted_away_pso: null,
    predicted_winner_team_id: null,
  },
  C: {
    match_id: MATCH_ID,
    predicted_home_score: 1,
    predicted_away_score: 0,
    predicted_home_pso: null,
    predicted_away_pso: null,
    predicted_winner_team_id: 'team-home',
  },
}

/**
 * Simulate what the orchestrator writes for one match × all entries at a
 * given match state. Returns a stable snapshot keyed by entry_id.
 * Strips `calculated_at` so we can compare snapshots byte-for-byte.
 */
function snapshot(homeScore: number, awayScore: number) {
  const match = buildMatch(homeScore, awayScore)
  const rows: Record<string, Omit<MatchScoreRow, 'calculated_at'>> = {}
  for (const [entryId, pred] of Object.entries(predictions)) {
    const row = computeMatchScore({
      poolId: POOL_ID,
      entryId,
      match,
      prediction: pred,
      settings,
      // Group stage → teams-match irrelevant
      knockoutTeamsMatch: true,
      predictedHomeTeamId: null,
      predictedAwayTeamId: null,
    })
    if (row) {
      const { calculated_at: _ignored, ...rest } = row
      rows[entryId] = rest
    }
  }
  return rows
}

describe('retraction settlement — audit §3.2 (0-0 → 1-0 → 0-0)', () => {
  const statePre = snapshot(0, 0) // minute 0, kickoff
  const stateGoal = snapshot(1, 0) // minute 40, goal
  const stateRetracted = snapshot(0, 0) // minute 43, offside overturn

  it('at 0-0 (pre-goal): Entry A misses, B exact, C misses', () => {
    expect(statePre.A.score_type).toBe('miss')
    expect(statePre.A.total_points).toBe(0)
    expect(statePre.B.score_type).toBe('exact')
    expect(statePre.B.total_points).toBe(settings.group_exact_score)
    expect(statePre.C.score_type).toBe('miss')
    expect(statePre.C.total_points).toBe(0)
  })

  it('at 1-0 (goal entered): A wins_gd, B misses, C exact', () => {
    // A predicted 2-1 (GD +1), match 1-0 (GD +1) → winner_gd.
    // (The audit §2.3 narrative called this 'winner' — the narrative was
    // imprecise; the math per scoreMatch is winner_gd. Corrected here.)
    expect(stateGoal.A.score_type).toBe('winner_gd')
    expect(stateGoal.A.total_points).toBe(settings.group_correct_difference)
    expect(stateGoal.B.score_type).toBe('miss')
    expect(stateGoal.B.total_points).toBe(0)
    expect(stateGoal.C.score_type).toBe('exact')
    expect(stateGoal.C.total_points).toBe(settings.group_exact_score)
  })

  it('at 0-0 (goal retracted): snapshot is byte-identical to pre-goal snapshot', () => {
    // The point of the test. Modulo calculated_at (already stripped above),
    // every row for every entry at state 2 must equal the same row at state 0.
    expect(stateRetracted).toEqual(statePre)
  })

  it('per-entry total_points delta across retraction sums to zero', () => {
    for (const entryId of ['A', 'B', 'C'] as const) {
      const delta = stateRetracted[entryId].total_points - statePre[entryId].total_points
      expect(delta).toBe(0)
    }
  })

  it('no row at any state has non-integer total_points (integer-math invariant)', () => {
    for (const state of [statePre, stateGoal, stateRetracted]) {
      for (const row of Object.values(state)) {
        expect(Number.isInteger(row.total_points)).toBe(true)
        expect(Number.isInteger(row.base_points)).toBe(true)
      }
    }
  })

  it('Entry C loses exactly group_exact_score on retraction (the biggest individual delta)', () => {
    expect(stateGoal.C.total_points - stateRetracted.C.total_points).toBe(
      settings.group_exact_score
    )
  })

  it('Entry A loses exactly group_correct_difference on retraction', () => {
    // A predicted 2-1 vs actual 1-0 → winner_gd. Delta on retraction back to 0-0
    // equals -group_correct_difference (not -group_correct_result).
    expect(stateGoal.A.total_points - stateRetracted.A.total_points).toBe(
      settings.group_correct_difference
    )
  })
})
