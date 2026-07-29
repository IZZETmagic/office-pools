import { describe, it, expect } from 'vitest'
import {
  needsFullRefresh,
  mergeMatches,
  mergeMembers,
  mergeMatchScores,
  mergeEntryStats,
} from '../liveMerge'
import type { MatchData, MatchScoreData, MemberData, EntryStatsData } from '../types'
import type { PoolLiveResponse } from '@/app/api/pools/[pool_id]/live/route'

// Every match in production is `completed` (104/104, World Cup finished 2026-07-16),
// so the live-delta paths below are unreachable with real data until the next
// competition. These tests are the only coverage they have.

const match = (id: string, status: string, h: number | null = null, a: number | null = null) =>
  ({ match_id: id, status, home_score_ft: h, away_score_ft: a } as unknown as MatchData)

const score = (entryId: string, matchId: string, type: string, pts: number) =>
  ({
    id: `${entryId}:${matchId}`,
    entry_id: entryId,
    match_id: matchId,
    score_type: type,
    total_points: pts,
  } as unknown as MatchScoreData)

const member = (memberId: string, entries: Array<Record<string, unknown>>) =>
  ({ member_id: memberId, entries } as unknown as MemberData)

const entry = (entryId: string, over: Record<string, unknown> = {}) => ({
  entry_id: entryId,
  match_points: 10,
  bonus_points: 5,
  point_adjustment: 0,
  scored_total_points: 15,
  current_rank: 3,
  previous_rank: 4,
  ...over,
})

const live = (over: Partial<PoolLiveResponse> = {}): PoolLiveResponse => ({
  completed_matches: 0,
  entries: [],
  scores: [],
  stats: [],
  matches: [],
  ...over,
})

const stats = (entryId: string, over: Partial<EntryStatsData> = {}): EntryStatsData => ({
  entry_id: entryId,
  hit_rate: 50,
  exact_count: 1,
  total_completed: 4,
  contrarian_wins: 0,
  crowd_agreement_pct: 75,
  total_xp: 300,
  current_level: 3,
  highest_level_reached: 3,
  last_five: ['miss', 'winner', 'exact', 'miss'],
  current_streak: { type: 'none', length: 0 },
  ...over,
})

describe('needsFullRefresh', () => {
  it('is false while the completed count still agrees', () => {
    const local = [match('m1', 'completed'), match('m2', 'live')]
    expect(needsFullRefresh(local, live({ completed_matches: 1 }))).toBe(false)
  })

  it('is true once a match finishes — its scores left the live half', () => {
    const local = [match('m1', 'completed'), match('m2', 'live')]
    expect(needsFullRefresh(local, live({ completed_matches: 2 }))).toBe(true)
  })

  it('is true if the server reports FEWER completed than held', () => {
    // A match reopened (correction, re-scoring). The held immutable half is
    // wrong either way, so a rebuild is still the right answer.
    const local = [match('m1', 'completed'), match('m2', 'completed')]
    expect(needsFullRefresh(local, live({ completed_matches: 1 }))).toBe(true)
  })
})

describe('mergeMatches', () => {
  it('applies a kickoff transition', () => {
    const prev = [match('m1', 'scheduled')]
    const next = mergeMatches(prev, live({ matches: [{ match_id: 'm1', status: 'live', home_score_ft: 0, away_score_ft: 0 }] }))
    expect(next[0].status).toBe('live')
  })

  it('applies a score change during play', () => {
    const prev = [match('m1', 'live', 0, 0)]
    const next = mergeMatches(prev, live({ matches: [{ match_id: 'm1', status: 'live', home_score_ft: 1, away_score_ft: 0 }] }))
    expect(next[0].home_score_ft).toBe(1)
    expect(next[0].away_score_ft).toBe(0)
  })

  it('leaves matches the delta does not mention untouched', () => {
    const prev = [match('m1', 'completed', 2, 1), match('m2', 'live', 0, 0)]
    const next = mergeMatches(prev, live({ matches: [{ match_id: 'm2', status: 'live', home_score_ft: 1, away_score_ft: 0 }] }))
    expect(next[0]).toBe(prev[0])
    expect(next[1].home_score_ft).toBe(1)
  })

  it('returns the SAME array when nothing moved, so React can skip the render', () => {
    const prev = [match('m1', 'live', 1, 0)]
    const next = mergeMatches(prev, live({ matches: [{ match_id: 'm1', status: 'live', home_score_ft: 1, away_score_ft: 0 }] }))
    expect(next).toBe(prev)
  })

  it('returns the same array for an empty delta', () => {
    const prev = [match('m1', 'live')]
    expect(mergeMatches(prev, live())).toBe(prev)
  })
})

describe('mergeMembers', () => {
  it('applies new points and ranks to the right entry', () => {
    const prev = [member('mem1', [entry('e1'), entry('e2')])]
    const next = mergeMembers(prev, live({
      entries: [{
        entry_id: 'e2', match_points: 40, bonus_points: 10, point_adjustment: 0,
        scored_total_points: 50, current_rank: 1, previous_rank: 3,
      }],
    }))
    const entries = next[0].entries!
    expect(entries[0].match_points).toBe(10)
    expect(entries[1].match_points).toBe(40)
    expect(entries[1].current_rank).toBe(1)
    expect(entries[1].previous_rank).toBe(3)
  })

  it('does not invent entries the pool does not have', () => {
    const prev = [member('mem1', [entry('e1')])]
    const next = mergeMembers(prev, live({
      entries: [{
        entry_id: 'ghost', match_points: 99, bonus_points: 0, point_adjustment: 0,
        scored_total_points: 99, current_rank: 1, previous_rank: null,
      }],
    }))
    expect(next[0].entries).toHaveLength(1)
    expect(next[0].entries![0].entry_id).toBe('e1')
  })

  it('handles a member with no entries', () => {
    const prev = [member('mem1', [])]
    expect(() => mergeMembers(prev, live({
      entries: [{
        entry_id: 'e1', match_points: 1, bonus_points: 0, point_adjustment: 0,
        scored_total_points: 1, current_rank: 1, previous_rank: null,
      }],
    }))).not.toThrow()
  })

  it('carries a rank going to null (entry unranked again)', () => {
    const prev = [member('mem1', [entry('e1', { current_rank: 2 })])]
    const next = mergeMembers(prev, live({
      entries: [{
        entry_id: 'e1', match_points: 10, bonus_points: 5, point_adjustment: 0,
        scored_total_points: 15, current_rank: null, previous_rank: 2,
      }],
    }))
    expect(next[0].entries![0].current_rank).toBeNull()
  })

  it('returns the SAME array when nothing moved', () => {
    const prev = [member('mem1', [entry('e1')])]
    const next = mergeMembers(prev, live({
      entries: [{
        entry_id: 'e1', match_points: 10, bonus_points: 5, point_adjustment: 0,
        scored_total_points: 15, current_rank: 3, previous_rank: 4,
      }],
    }))
    expect(next).toBe(prev)
  })
})

describe('mergeMatchScores', () => {
  it('updates a row in place without changing the row count', () => {
    const prev = [score('e1', 'm1', 'miss', 0), score('e2', 'm1', 'miss', 0)]
    const next = mergeMatchScores(prev, live({ scores: [score('e1', 'm1', 'exact', 50)] }))
    expect(next).toHaveLength(2)
    expect(next[0].score_type).toBe('exact')
    expect(next[0].total_points).toBe(50)
    expect(next[1].total_points).toBe(0)
  })

  it('appends rows for a match scored for the first time since page load', () => {
    const prev = [score('e1', 'm1', 'exact', 50)]
    const next = mergeMatchScores(prev, live({ scores: [score('e1', 'm2', 'winner', 20)] }))
    expect(next).toHaveLength(2)
    expect(next.find((s) => s.match_id === 'm2')?.total_points).toBe(20)
  })

  it('keys on entry AND match, never on either alone', () => {
    // The bug this guards: keying on entry_id alone would let one entry's score
    // for m2 overwrite its own score for m1.
    const prev = [score('e1', 'm1', 'exact', 50), score('e1', 'm2', 'miss', 0)]
    const next = mergeMatchScores(prev, live({ scores: [score('e1', 'm2', 'winner', 20)] }))
    expect(next).toHaveLength(2)
    expect(next.find((s) => s.match_id === 'm1')?.total_points).toBe(50)
    expect(next.find((s) => s.match_id === 'm2')?.total_points).toBe(20)
  })

  it('is idempotent — applying the same delta twice changes nothing', () => {
    const prev = [score('e1', 'm1', 'miss', 0)]
    const delta = live({ scores: [score('e1', 'm1', 'exact', 50)] })
    const once = mergeMatchScores(prev, delta)
    const twice = mergeMatchScores(once, delta)
    expect(twice).toHaveLength(1)
    expect(twice[0].total_points).toBe(50)
  })

  it('returns the same array for an empty delta', () => {
    const prev = [score('e1', 'm1', 'exact', 50)]
    expect(mergeMatchScores(prev, live())).toBe(prev)
  })

  it('builds the full set from an empty start (first-ever scores)', () => {
    const next = mergeMatchScores([], live({ scores: [score('e1', 'm1', 'exact', 50)] }))
    expect(next).toHaveLength(1)
  })
})


describe('mergeEntryStats', () => {
  it('returns the same array when the delta carries no stats', () => {
    const prev = [stats('e1')]
    expect(mergeEntryStats(prev, live())).toBe(prev)
  })

  it('replaces an entry whose numbers moved', () => {
    const prev = [stats('e1'), stats('e2')]
    const next = mergeEntryStats(
      prev,
      live({ stats: [stats('e1', { hit_rate: 62.5, exact_count: 2, last_five: ['winner', 'exact'] })] }),
    )
    expect(next).not.toBe(prev)
    expect(next.find(s => s.entry_id === 'e1')?.hit_rate).toBe(62.5)
    expect(next.find(s => s.entry_id === 'e1')?.last_five).toEqual(['winner', 'exact'])
    // Untouched entries keep referential identity.
    expect(next.find(s => s.entry_id === 'e2')).toBe(prev[1])
  })

  it('preserves identity when the delta repeats identical numbers', () => {
    // The 30s poll re-sends the same row constantly between score changes; a new
    // array each tick would re-render every leaderboard row for nothing.
    const prev = [stats('e1'), stats('e2')]
    expect(mergeEntryStats(prev, live({ stats: [stats('e1'), stats('e2')] }))).toBe(prev)
  })

  it('detects a streak change even when the totals are unchanged', () => {
    const prev = [stats('e1', { current_streak: { type: 'none', length: 0 } })]
    const next = mergeEntryStats(
      prev,
      live({ stats: [stats('e1', { current_streak: { type: 'hot', length: 3 } })] }),
    )
    expect(next).not.toBe(prev)
    expect(next[0].current_streak).toEqual({ type: 'hot', length: 3 })
  })

  it('appends an entry whose first row was written while the page was open', () => {
    const prev = [stats('e1')]
    const next = mergeEntryStats(prev, live({ stats: [stats('e2')] }))
    expect(next).toHaveLength(2)
    expect(next.map(s => s.entry_id).sort()).toEqual(['e1', 'e2'])
  })

  it('leaves an entry absent from the delta untouched', () => {
    const prev = [stats('e1', { hit_rate: 11 }), stats('e2', { hit_rate: 22 })]
    const next = mergeEntryStats(prev, live({ stats: [stats('e1', { hit_rate: 99 })] }))
    expect(next.find(s => s.entry_id === 'e2')?.hit_rate).toBe(22)
  })
})

// ---------------------------------------------------------------------------
// The leaderboard broadcast (step 5) feeds mergeMembers directly: the message
// carries totals and ranks, so they apply without any HTTP fetch. It sends ONLY
// the rows that changed, so a partial payload must leave everyone else alone.
// ---------------------------------------------------------------------------
describe('mergeMembers via the leaderboard broadcast payload', () => {
  it('applies a partial payload without disturbing untouched entries', () => {
    const prev = [
      member('m1', [entry('e1', { scored_total_points: 15, current_rank: 3 })]),
      member('m2', [entry('e2', { scored_total_points: 40, current_rank: 1 })]),
    ]
    // One goal moved e1 only — the broadcast carries just that row.
    const next = mergeMembers(prev, {
      entries: [entry('e1', { scored_total_points: 45, current_rank: 1, match_points: 40 })],
    })

    expect(next[0].entries![0].scored_total_points).toBe(45)
    expect(next[0].entries![0].current_rank).toBe(1)
    // m2 was not in the payload — same object, so React skips that row.
    expect(next[1]).toBe(prev[1])
  })

  it('is a no-op when the payload repeats what is already held', () => {
    const prev = [member('m1', [entry('e1')])]
    expect(mergeMembers(prev, { entries: [entry('e1')] })).toBe(prev)
  })
})
