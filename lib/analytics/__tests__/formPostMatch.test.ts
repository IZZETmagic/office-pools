import { describe, it, expect } from 'vitest'
import { matchScoresToPredictionResults } from '@/app/pools/[pool_id]/analytics/analyticsHelpers'
import type { MatchScoreData } from '@/app/pools/[pool_id]/types'

// FORM = post-match only. match_scores carries live/in-progress rows (the
// leaderboard scores them for live points — lib/scoring/core.ts scores
// `is_completed || live`), but the form layer must exclude them so the form tab
// freezes during a live game and only moves when a match ends.
function ms(match_id: string, match_number: number, score_type: MatchScoreData['score_type'], total_points: number): MatchScoreData {
  return {
    id: `s-${match_id}`,
    entry_id: 'e1',
    match_id,
    pool_id: 'p1',
    match_number,
    stage: 'group',
    score_type,
    total_points,
  } as unknown as MatchScoreData
}

describe('matchScoresToPredictionResults — FORM = post-match only', () => {
  const rows = [ms('m1', 1, 'exact', 5), ms('m2', 2, 'winner', 3), ms('m3', 3, 'miss', 0)]

  it('includes every match when no completed set is passed (leaderboard/points behavior)', () => {
    const res = matchScoresToPredictionResults(rows)
    expect(res.map(r => r.matchId)).toEqual(['m1', 'm2', 'm3'])
  })

  it('excludes in-progress matches when a completed set is passed (form freezes during live)', () => {
    // m3 is live/in-progress → absent from the completed set → dropped from form.
    const res = matchScoresToPredictionResults(rows, new Set(['m1', 'm2']))
    expect(res.map(r => r.matchId)).toEqual(['m1', 'm2'])
    expect(res.find(r => r.matchId === 'm3')).toBeUndefined()
  })

  it('returns nothing when no matches are completed yet', () => {
    expect(matchScoresToPredictionResults(rows, new Set())).toEqual([])
  })

  it('still sorts by match_number', () => {
    const shuffled = [ms('m3', 3, 'miss', 0), ms('m1', 1, 'exact', 5), ms('m2', 2, 'winner', 3)]
    const res = matchScoresToPredictionResults(shuffled, new Set(['m1', 'm2', 'm3']))
    expect(res.map(r => r.matchNumber)).toEqual([1, 2, 3])
  })
})
