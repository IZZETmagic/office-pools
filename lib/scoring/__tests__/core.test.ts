// =============================================================
// Core scoring primitives — unit tests
// =============================================================
// T-0018 / D-014 (2026-04-24), Priya.
//
// Covers every code path in `scoreMatch` and `checkKnockoutTeamsMatch`.
// Baseline coverage so future edits to `core.ts` cannot regress silently.
// No DB, no network, pure functions only.

import { describe, it, expect } from 'vitest'
import { scoreMatch, checkKnockoutTeamsMatch, getStageMultiplier } from '../core'
import { DEFAULT_POOL_SETTINGS } from '@/app/pools/[pool_id]/results/points'
import type { PoolSettings } from '../types'

// Baseline settings — mirrors DEFAULT_POOL_SETTINGS with PSO enabled for
// the PSO branch tests. Individual tests can override.
const baseSettings: PoolSettings = {
  ...DEFAULT_POOL_SETTINGS,
  pso_enabled: true,
  pso_exact_score: 10,
  pso_correct_difference: 5,
  pso_correct_result: 2,
}

describe('scoreMatch — group stage', () => {
  it('awards group_exact_score on exact match', () => {
    const r = scoreMatch(2, 1, 2, 1, 'group', baseSettings, true)
    expect(r.scoreType).toBe('exact')
    expect(r.basePoints).toBe(baseSettings.group_exact_score)
    expect(r.multiplier).toBe(1)
    expect(r.totalPoints).toBe(baseSettings.group_exact_score)
  })

  it('awards group_correct_difference on correct winner + GD', () => {
    const r = scoreMatch(2, 1, 3, 2, 'group', baseSettings, true)
    expect(r.scoreType).toBe('winner_gd')
    expect(r.basePoints).toBe(baseSettings.group_correct_difference)
    expect(r.totalPoints).toBe(baseSettings.group_correct_difference)
  })

  it('awards group_correct_result on correct winner only (different GD)', () => {
    // Predicted GD +3, actual GD +1 → same winner, wrong GD → winner-only
    const r = scoreMatch(3, 0, 2, 1, 'group', baseSettings, true)
    expect(r.scoreType).toBe('winner')
    expect(r.basePoints).toBe(baseSettings.group_correct_result)
    expect(r.totalPoints).toBe(baseSettings.group_correct_result)
  })

  it('awards 0 on miss (wrong winner)', () => {
    const r = scoreMatch(2, 1, 0, 1, 'group', baseSettings, true)
    expect(r.scoreType).toBe('miss')
    expect(r.basePoints).toBe(0)
    expect(r.totalPoints).toBe(0)
  })

  it('treats draw correctly as exact', () => {
    const r = scoreMatch(1, 1, 1, 1, 'group', baseSettings, true)
    expect(r.scoreType).toBe('exact')
  })

  it('treats draw-as-winner correctly (both drew, different score)', () => {
    const r = scoreMatch(0, 0, 2, 2, 'group', baseSettings, true)
    // Both are draws → same winner, GD matches (0=0), so winner_gd
    expect(r.scoreType).toBe('winner_gd')
    expect(r.basePoints).toBe(baseSettings.group_correct_difference)
  })

  it('group stage never applies multiplier even if stage-multiplier setting is high', () => {
    const settings: PoolSettings = { ...baseSettings, round_16_multiplier: 999 }
    const r = scoreMatch(2, 1, 2, 1, 'group', settings, true)
    expect(r.multiplier).toBe(1)
    expect(r.totalPoints).toBe(baseSettings.group_exact_score)
  })
})

describe('scoreMatch — knockout stage multipliers', () => {
  it('applies round_16 multiplier to exact score', () => {
    const r = scoreMatch(2, 1, 2, 1, 'round_16', baseSettings, true)
    expect(r.scoreType).toBe('exact')
    expect(r.multiplier).toBe(baseSettings.round_16_multiplier)
    expect(r.totalPoints).toBe(
      Math.floor(baseSettings.knockout_exact_score * baseSettings.round_16_multiplier)
    )
  })

  it('applies quarter_final multiplier to winner_gd', () => {
    const r = scoreMatch(2, 1, 3, 2, 'quarter_final', baseSettings, true)
    expect(r.scoreType).toBe('winner_gd')
    expect(r.multiplier).toBe(baseSettings.quarter_final_multiplier)
    expect(r.totalPoints).toBe(
      Math.floor(baseSettings.knockout_correct_difference * baseSettings.quarter_final_multiplier)
    )
  })

  it('applies semi_final multiplier to winner-only', () => {
    // Predicted GD +3, actual GD +1 → same winner, wrong GD → winner-only
    const r = scoreMatch(3, 0, 2, 1, 'semi_final', baseSettings, true)
    expect(r.scoreType).toBe('winner')
    expect(r.multiplier).toBe(baseSettings.semi_final_multiplier)
  })

  it('applies final multiplier to exact', () => {
    const r = scoreMatch(2, 1, 2, 1, 'final', baseSettings, true)
    expect(r.multiplier).toBe(baseSettings.final_multiplier)
  })

  it('falls back to 1x multiplier for unknown stage', () => {
    const r = scoreMatch(2, 1, 2, 1, 'mystery_round', baseSettings, true)
    expect(r.multiplier).toBe(1)
  })

  it('awards 0 in knockout when predicted teams do not match actual teams', () => {
    const r = scoreMatch(2, 1, 2, 1, 'round_16', baseSettings, false)
    // Even with an "exact" score, knockoutTeamsMatch=false → zero
    expect(r.scoreType).toBe('miss')
    expect(r.totalPoints).toBe(0)
  })
})

describe('scoreMatch — PSO bonus', () => {
  it('adds pso_exact_score on exact PSO prediction', () => {
    const r = scoreMatch(1, 1, 1, 1, 'round_16', baseSettings, true, {
      predictedHomePso: 4,
      predictedAwayPso: 3,
      actualHomePso: 4,
      actualAwayPso: 3,
    })
    // Exact FT (1-1) × round_16 multiplier, plus PSO exact bonus (NOT multiplied)
    const expected =
      Math.floor(baseSettings.knockout_exact_score * baseSettings.round_16_multiplier) +
      baseSettings.pso_exact_score
    expect(r.totalPoints).toBe(expected)
    expect(r.psoPoints).toBe(baseSettings.pso_exact_score)
  })

  it('adds pso_correct_difference when PSO winner + GD match', () => {
    const r = scoreMatch(1, 1, 1, 1, 'final', baseSettings, true, {
      predictedHomePso: 5,
      predictedAwayPso: 3,
      actualHomePso: 4,
      actualAwayPso: 2,
    })
    expect(r.psoPoints).toBe(baseSettings.pso_correct_difference)
  })

  it('adds pso_correct_result when only PSO winner matches', () => {
    const r = scoreMatch(1, 1, 1, 1, 'final', baseSettings, true, {
      predictedHomePso: 5,
      predictedAwayPso: 2,
      actualHomePso: 4,
      actualAwayPso: 2,
    })
    expect(r.psoPoints).toBe(baseSettings.pso_correct_result)
  })

  it('adds 0 PSO bonus when PSO winner wrong', () => {
    const r = scoreMatch(1, 1, 1, 1, 'round_16', baseSettings, true, {
      predictedHomePso: 3,
      predictedAwayPso: 4,
      actualHomePso: 4,
      actualAwayPso: 3,
    })
    expect(r.psoPoints).toBe(0)
  })

  it('awards PSO bonus even when FT is a miss', () => {
    const r = scoreMatch(2, 0, 1, 1, 'round_16', baseSettings, true, {
      predictedHomePso: 4,
      predictedAwayPso: 3,
      actualHomePso: 4,
      actualAwayPso: 3,
    })
    expect(r.scoreType).toBe('miss')
    expect(r.basePoints).toBe(0)
    expect(r.psoPoints).toBe(baseSettings.pso_exact_score)
    expect(r.totalPoints).toBe(baseSettings.pso_exact_score)
  })

  it('does not add PSO bonus when pso_enabled is false', () => {
    const settings: PoolSettings = { ...baseSettings, pso_enabled: false }
    const r = scoreMatch(1, 1, 1, 1, 'final', settings, true, {
      predictedHomePso: 4,
      predictedAwayPso: 3,
      actualHomePso: 4,
      actualAwayPso: 3,
    })
    expect(r.psoPoints).toBe(0)
  })

  it('does not add PSO bonus when predicted PSO values are null', () => {
    const r = scoreMatch(1, 1, 1, 1, 'final', baseSettings, true, {
      predictedHomePso: null,
      predictedAwayPso: null,
      actualHomePso: 4,
      actualAwayPso: 3,
    })
    expect(r.psoPoints).toBe(0)
  })
})

describe('scoreMatch — retraction math (audit §3.2)', () => {
  // This is the exact scenario from the audit. Three entries, match state
  // 0-0 → 1-0 → 0-0. After retraction, every entry's score must return
  // to the pre-goal state.

  const matchStatePreGoal = { home: 0, away: 0 }
  const matchStatePostGoal = { home: 1, away: 0 }
  const matchStateRetraction = { home: 0, away: 0 }

  const predictionA = { home: 2, away: 1 } // predicted home winner
  const predictionB = { home: 0, away: 0 } // predicted 0-0 draw
  const predictionC = { home: 1, away: 0 } // predicted 1-0 home

  const score = (pred: { home: number; away: number }, actual: { home: number; away: number }) =>
    scoreMatch(pred.home, pred.away, actual.home, actual.away, 'group', baseSettings, true)

  it('Entry A: winner_gd at 1-0, miss on retraction', () => {
    // A predicted 2-1 (GD +1). Match at 1-0 has GD +1 → same winner + same GD → winner_gd.
    // (Corrects the audit §2.3 walkthrough which labeled this 'winner' — the audit
    // narrative was imprecise; the math here is correct per the scoreMatch spec.)
    const stateGoal = score(predictionA, matchStatePostGoal)
    const stateRetracted = score(predictionA, matchStateRetraction)
    expect(stateGoal.scoreType).toBe('winner_gd')
    expect(stateRetracted.scoreType).toBe('miss')
    // Delta from goal state to retraction equals -group_correct_difference
    expect(stateGoal.totalPoints - stateRetracted.totalPoints).toBe(
      baseSettings.group_correct_difference
    )
  })

  it('Entry B: miss at 0-0, exact on retraction back to 0-0', () => {
    const statePre = score(predictionB, matchStatePreGoal)
    const stateGoal = score(predictionB, matchStatePostGoal)
    const stateRetracted = score(predictionB, matchStateRetraction)
    // Pre-goal: B predicted 0-0, match is 0-0 → exact
    expect(statePre.scoreType).toBe('exact')
    // Goal state: B predicted 0-0, match is 1-0 → miss
    expect(stateGoal.scoreType).toBe('miss')
    // Retraction: back to 0-0 → exact, byte-identical to pre-goal
    expect(stateRetracted.totalPoints).toBe(statePre.totalPoints)
    expect(stateRetracted.scoreType).toBe(statePre.scoreType)
  })

  it('Entry C: exact at 1-0, miss on retraction', () => {
    const stateGoal = score(predictionC, matchStatePostGoal)
    const stateRetracted = score(predictionC, matchStateRetraction)
    expect(stateGoal.scoreType).toBe('exact')
    expect(stateRetracted.scoreType).toBe('miss')
    // Delta equals -group_exact_score
    expect(stateGoal.totalPoints - stateRetracted.totalPoints).toBe(
      baseSettings.group_exact_score
    )
  })

  it('determinism: two calls against identical input produce identical output', () => {
    const r1 = score(predictionA, matchStatePostGoal)
    const r2 = score(predictionA, matchStatePostGoal)
    expect(r1).toEqual(r2)
  })
})

describe('checkKnockoutTeamsMatch', () => {
  it('returns true for group stage regardless of teams', () => {
    expect(checkKnockoutTeamsMatch('group', null, null, null, null)).toBe(true)
  })

  it('returns true when actual teams are not yet set (bracket not resolved)', () => {
    expect(checkKnockoutTeamsMatch('round_16', null, 'team-b', 'team-x', 'team-y')).toBe(true)
  })

  it('returns false when predicted teams are null but actual teams are set', () => {
    expect(checkKnockoutTeamsMatch('round_16', 'team-a', 'team-b', null, null)).toBe(false)
  })

  it('returns true when predicted teams match actual teams (same order)', () => {
    expect(checkKnockoutTeamsMatch('round_16', 'team-a', 'team-b', 'team-a', 'team-b')).toBe(true)
  })

  it('returns true when predicted teams match actual teams (reversed order)', () => {
    expect(checkKnockoutTeamsMatch('round_16', 'team-a', 'team-b', 'team-b', 'team-a')).toBe(true)
  })

  it('returns false when one predicted team is wrong', () => {
    expect(checkKnockoutTeamsMatch('round_16', 'team-a', 'team-b', 'team-a', 'team-c')).toBe(false)
  })
})

describe('getStageMultiplier', () => {
  it.each([
    ['round_32', 'round_32_multiplier'],
    ['round_16', 'round_16_multiplier'],
    ['quarter_final', 'quarter_final_multiplier'],
    ['semi_final', 'semi_final_multiplier'],
    ['third_place', 'third_place_multiplier'],
    ['final', 'final_multiplier'],
  ])('reads %s from settings.%s', (stage, settingsKey) => {
    expect(getStageMultiplier(stage, baseSettings)).toBe(
      (baseSettings as unknown as Record<string, number>)[settingsKey]
    )
  })

  it('returns 1 for unknown stage', () => {
    expect(getStageMultiplier('unknown_round', baseSettings)).toBe(1)
  })
})
