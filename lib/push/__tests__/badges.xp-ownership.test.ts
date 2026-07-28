// =============================================================
// badges.ts — XP ownership regression lock
// =============================================================
// 2026-07-26. See drafts/2026-07-26_analytics_parity_result.md.
//
// THE BUG THIS LOCKS OUT:
//   lib/push/badges.ts used to compute its own "XP" as
//       Σ match_scores.total_points + badgeXP
//   and write it to entry_xp_state.total_xp / .current_level — the same two
//   columns lib/analytics/entryAnalytics.ts writes from computeFullXPBreakdown
//   (BASE_XP[tier] × STAGE_MULTIPLIERS + crowd/streak bonus events + badge XP).
//
//   Two different QUANTITIES, one pair of columns, last-writer-wins. Both were
//   then compared against the same LEVELS.xpRequired thresholds, so the level
//   shown on /pools and /dashboard depended on which path last ran. A parity
//   pass found 187/331 sampled entries disagreeing.
//
// THE CONTRACT:
//   entry_xp_state.total_xp / .current_level must come from
//   computePoolEntryAnalytics — never from a figure derived inside badges.ts.
//
// This is a CONTRACT test against a mocked Supabase client, matching the style
// of lib/scoring/__tests__/recalculate.integration.test.ts. It asserts on the
// upsert payload, which is exactly where the old bug expressed itself. The
// match_scores fixture below sums to a total_points figure deliberately far
// from the analytics value, so the old code cannot accidentally pass.

import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- the values under test -------------------------------------------------
// vi.hoisted: vi.mock factories are lifted above normal top-level consts, so
// anything the factories close over has to be hoisted with them.
const { ANALYTICS_TOTAL_XP, ANALYTICS_LEVEL, SCORE_POINTS_SUM, upserts } = vi.hoisted(() => ({
  ANALYTICS_TOTAL_XP: 4242, // what computeFullXPBreakdown says
  ANALYTICS_LEVEL: 8,
  // Fixture scores sum to 1000 points. The OLD code would have written
  // 1000 + badgeXP here — nowhere near 4242.
  SCORE_POINTS_SUM: 1000,
  upserts: [] as Array<{ table: string; payload: any }>,
}))

vi.mock('@/lib/scoring/prodScoringFlag', () => ({
  isProdScoringEnabled: vi.fn().mockResolvedValue(true),
}))

vi.mock('../apns', () => ({
  sendPushToUser: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/analytics/entryAnalytics', () => ({
  computePoolEntryAnalytics: vi.fn().mockResolvedValue([
    {
      entry_id: 'entry-1',
      total_xp: ANALYTICS_TOTAL_XP,
      current_level: ANALYTICS_LEVEL,
      last_five: ['exact', 'winner', 'miss', 'winner', 'exact'],
      current_streak: { type: 'hot', length: 2 },
      hit_rate: 60.0,
      total_completed: 5,
      exact_count: 2,
      contrarian_wins: 1,
      crowd_agreement_pct: 80.0,
      analytics_updated_at: '2026-07-26T00:00:00.000Z',
    },
  ]),
}))

vi.mock('@/lib/supabase/server', () => {
  const rowsFor = (table: string) => {
    switch (table) {
      case 'pools':
        return { pool_id: 'pool-1', pool_name: 'Test Pool', tournament_id: 'tour-1' }
      case 'pool_members':
        return [{ member_id: 'member-1', user_id: 'user-1' }]
      case 'pool_entries':
        return [{ entry_id: 'entry-1', entry_name: 'Entry One', member_id: 'member-1', current_rank: 3 }]
      case 'matches':
        return [
          { match_id: 'm1', match_number: 1, stage: 'group', group_letter: 'A' },
          { match_id: 'm2', match_number: 2, stage: 'final', group_letter: null },
        ]
      case 'match_scores':
        return [
          { match_id: 'm1', match_number: 1, stage: 'group', score_type: 'exact', total_points: 400 },
          { match_id: 'm2', match_number: 2, stage: 'final', score_type: 'exact', total_points: 600 },
        ]
      case 'entry_xp_state':
        // Existing snapshot: already seeded and already AT the analytics level,
        // so a correct implementation fires no level-up push.
        return { current_level: ANALYTICS_LEVEL, earned_badge_ids: [], seeded: true }
      default:
        return []
    }
  }

  const makeChain = (table: string) => {
    const result = { data: rowsFor(table), error: null, count: 0 }
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      order: () => chain,
      single: () => Promise.resolve({ data: rowsFor(table), error: null }),
      maybeSingle: () => Promise.resolve({ data: rowsFor(table), error: null }),
      insert: () => Promise.resolve({ data: null, error: null }),
      upsert: (payload: any) => {
        upserts.push({ table, payload })
        return Promise.resolve({ data: null, error: null })
      },
      then: (resolve: any) => Promise.resolve(result).then(resolve),
    }
    return chain
  }

  return {
    createAdminClient: () => ({ from: (table: string) => makeChain(table) }),
  }
})

import { detectAndPushBadgesForPool } from '../badges'

describe('badges.ts — entry_xp_state XP ownership', () => {
  beforeEach(() => {
    upserts.length = 0
  })

  it('writes the XP supplied by computePoolEntryAnalytics, not a locally-derived figure', async () => {
    await detectAndPushBadgesForPool('pool-1')

    const snapshot = upserts.find((u) => u.table === 'entry_xp_state')
    expect(snapshot, 'expected an entry_xp_state upsert').toBeDefined()

    expect(snapshot!.payload.total_xp).toBe(ANALYTICS_TOTAL_XP)
    expect(snapshot!.payload.current_level).toBe(ANALYTICS_LEVEL)
  })

  it('never writes the old Σ match_points + badgeXP figure', async () => {
    await detectAndPushBadgesForPool('pool-1')

    const snapshot = upserts.find((u) => u.table === 'entry_xp_state')
    const written = snapshot!.payload.total_xp as number

    // The old formula could only ever land within badge-XP distance of the
    // points sum. Anything in that band means badges.ts is inventing XP again.
    expect(Math.abs(written - SCORE_POINTS_SUM)).toBeGreaterThan(500)
  })

  it('persists the analytics columns too, so the precompute stays fresh', async () => {
    await detectAndPushBadgesForPool('pool-1')

    const snapshot = upserts.find((u) => u.table === 'entry_xp_state')
    expect(snapshot!.payload.hit_rate).toBe(60.0)
    expect(snapshot!.payload.exact_count).toBe(2)
    expect(snapshot!.payload.contrarian_wins).toBe(1)
    expect(snapshot!.payload.analytics_updated_at).toBe('2026-07-26T00:00:00.000Z')
  })
})
