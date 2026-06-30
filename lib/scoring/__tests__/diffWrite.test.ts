// =============================================================
// B1 diff-write helper — parity + efficiency contract tests
// =============================================================
// These prove the two properties B1's safety rests on:
//   (A) PARITY: applying {inserts, updates, deletes} to the stored set
//       yields EXACTLY the computed set (same rows, same values).
//   (B) EFFICIENCY: rows whose meaningful value is unchanged produce
//       NO write — including the two trap cases (calculated_at churn,
//       numeric "1.00" vs 1).
// =============================================================

import { describe, it, expect } from 'vitest'
import {
  diffRows,
  matchScoreKey,
  matchScoreValue,
  bonusScoreKey,
  bonusScoreValue,
} from '../diffWrite'

// A minimal computed match_scores row.
function ms(over: Record<string, any> = {}): any {
  return {
    entry_id: 'e1', match_id: 'm1', pool_id: 'p1', match_number: 1, stage: 'group',
    score_type: 'exact', base_points: 10, multiplier: 1, pso_points: 0, total_points: 10,
    teams_match: true, predicted_home_score: 2, predicted_away_score: 1,
    actual_home_score: 2, actual_away_score: 1,
    predicted_home_pso: null, predicted_away_pso: null, actual_home_pso: null, actual_away_pso: null,
    predicted_home_team_id: null, predicted_away_team_id: null,
    calculated_at: '2026-06-29T00:00:00Z',
    ...over,
  }
}
// A stored row = computed shape + DB id + (possibly) different calculated_at.
function stored(over: Record<string, any> = {}): any {
  return { id: 'row-' + (over.match_id ?? 'm1') + '-' + (over.entry_id ?? 'e1'), ...ms(over) }
}

const matchDiff = (computed: any[], existing: any[]) =>
  diffRows(computed, existing, matchScoreKey, matchScoreValue, (r: any) => r.id)

describe('diffRows — match_scores', () => {
  it('all unchanged → no writes', () => {
    const computed = [ms(), ms({ entry_id: 'e2', match_id: 'm1' })]
    const existing = [stored(), stored({ entry_id: 'e2', match_id: 'm1' })]
    const d = matchDiff(computed, existing)
    expect(d.toInsert).toHaveLength(0)
    expect(d.toUpdate).toHaveLength(0)
    expect(d.toDeleteIds).toHaveLength(0)
    expect(d.unchanged).toBe(2)
  })

  it('TRAP: calculated_at differing alone is NOT a change', () => {
    const computed = [ms({ calculated_at: '2026-06-29T12:00:00Z' })]
    const existing = [stored({ calculated_at: '2026-06-01T00:00:00Z' })]
    const d = matchDiff(computed, existing)
    expect(d.toUpdate).toHaveLength(0)
    expect(d.unchanged).toBe(1)
  })

  it('TRAP: stored multiplier "1.00" vs computed 1 is NOT a change', () => {
    const computed = [ms({ multiplier: 1 })]
    const existing = [stored({ multiplier: '1.00' })]
    const d = matchDiff(computed, existing)
    expect(d.toUpdate).toHaveLength(0)
    expect(d.unchanged).toBe(1)
  })

  it('a real points change → exactly one UPDATE against the right id', () => {
    const computed = [ms({ total_points: 20, base_points: 20, score_type: 'exact' })]
    const existing = [stored({ total_points: 10, base_points: 10 })]
    const d = matchDiff(computed, existing)
    expect(d.toInsert).toHaveLength(0)
    expect(d.toDeleteIds).toHaveLength(0)
    expect(d.toUpdate).toHaveLength(1)
    expect(d.toUpdate[0].id).toBe('row-m1-e1')
    expect(d.toUpdate[0].row.total_points).toBe(20)
  })

  it('a new computed row (no stored match) → INSERT', () => {
    const computed = [ms(), ms({ match_id: 'm2', match_number: 2 })]
    const existing = [stored()]
    const d = matchDiff(computed, existing)
    expect(d.toInsert).toHaveLength(1)
    expect(d.toInsert[0].match_id).toBe('m2')
    expect(d.toUpdate).toHaveLength(0)
    expect(d.toDeleteIds).toHaveLength(0)
  })

  it('a stored row no longer computed (e.g. match reset) → DELETE by id', () => {
    const computed = [ms()]
    const existing = [stored(), stored({ match_id: 'm2', match_number: 2 })]
    const d = matchDiff(computed, existing)
    expect(d.toDeleteIds).toEqual(['row-m2-e1'])
    expect(d.toInsert).toHaveLength(0)
    expect(d.toUpdate).toHaveLength(0)
    expect(d.unchanged).toBe(1)
  })

  it('combined insert + update + delete + unchanged in one pass', () => {
    const computed = [
      ms(),                                            // unchanged
      ms({ entry_id: 'e2', total_points: 99 }),        // update (e2/m1 changed)
      ms({ entry_id: 'e3' }),                          // insert (e3/m1 new)
    ]
    const existing = [
      stored(),                                        // matches unchanged
      stored({ entry_id: 'e2', total_points: 10 }),    // will update
      stored({ entry_id: 'e9' }),                      // stale → delete
    ]
    const d = matchDiff(computed, existing)
    expect(d.unchanged).toBe(1)
    expect(d.toUpdate.map(u => u.row.entry_id)).toEqual(['e2'])
    expect(d.toInsert.map(r => r.entry_id)).toEqual(['e3'])
    expect(d.toDeleteIds).toEqual(['row-m1-e9'])
  })

  it('PARITY: applying the diff reproduces the computed set exactly', () => {
    const computed = [
      ms({ entry_id: 'e1', total_points: 10 }),
      ms({ entry_id: 'e2', total_points: 25, match_id: 'm2', match_number: 2 }),
      ms({ entry_id: 'e3', total_points: 0, score_type: 'miss' }),
    ]
    const existing = [
      stored({ entry_id: 'e1', total_points: 10 }),                       // unchanged
      stored({ entry_id: 'e2', total_points: 5, match_id: 'm2', match_number: 2 }), // update
      stored({ entry_id: 'e7', total_points: 3 }),                        // delete
      // e3 missing → insert
    ]
    const d = matchDiff(computed, existing)

    // Simulate applying the diff to the stored set:
    const final = new Map<string, any>()
    for (const e of existing) final.set(matchScoreKey(e), e)
    for (const id of d.toDeleteIds) {
      for (const [k, v] of final) if (v.id === id) final.delete(k)
    }
    for (const u of d.toUpdate) final.set(matchScoreKey(u.row), u.row)
    for (const i of d.toInsert) final.set(matchScoreKey(i), i)

    // The resulting value-set must equal the computed value-set.
    const finalSig = [...final.values()].map(matchScoreValue).sort()
    const computedSig = computed.map(matchScoreValue).sort()
    expect(finalSig).toEqual(computedSig)
    expect(final.size).toBe(computed.length)
  })
})

// ----- bonus_scores: keys with nullable columns -----

function bs(over: Record<string, any> = {}): any {
  return {
    entry_id: 'e1', bonus_type: 'group_winner_only', bonus_category: 'group_standings',
    related_group_letter: 'A', related_match_id: null, points_earned: 100,
    description: 'Group A winner', ...over,
  }
}
const bStored = (over: Record<string, any> = {}) => ({ bonus_id: 'b-' + (over.bonus_type ?? 'group_winner_only') + '-' + (over.related_group_letter ?? 'A'), ...bs(over) })
const bonusDiff = (c: any[], e: any[]) => diffRows(c, e, bonusScoreKey, bonusScoreValue, (r: any) => r.bonus_id)

describe('diffRows — bonus_scores', () => {
  it('unchanged bonus → no write (null match_id handled in key)', () => {
    const d = bonusDiff([bs()], [bStored()])
    expect(d.toUpdate).toHaveLength(0)
    expect(d.toInsert).toHaveLength(0)
    expect(d.toDeleteIds).toHaveLength(0)
    expect(d.unchanged).toBe(1)
  })

  it('points change → update by bonus_id', () => {
    const d = bonusDiff([bs({ points_earned: 150, description: 'now winner+runnerup' })], [bStored()])
    expect(d.toUpdate).toHaveLength(1)
    expect(d.toUpdate[0].id).toBe('b-group_winner_only-A')
  })

  it('bonus no longer earned → delete', () => {
    const d = bonusDiff([], [bStored()])
    expect(d.toDeleteIds).toEqual(['b-group_winner_only-A'])
  })

  it('different groups are distinct keys (no false collision)', () => {
    const computed = [bs({ related_group_letter: 'A' }), bs({ related_group_letter: 'B' })]
    const existing = [bStored({ related_group_letter: 'A' })]
    const d = bonusDiff(computed, existing)
    expect(d.toInsert.map((r: any) => r.related_group_letter)).toEqual(['B'])
    expect(d.unchanged).toBe(1)
  })
})
