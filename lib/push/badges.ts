// Badge unlock + level-up push fan-out.
//
// Per-entry diff against entry_xp_state snapshot — fires GAMIFICATION-category
// pushes only for badges that just landed AND levels that just crossed. First
// run for any entry seeds the snapshot silently (no spam push of badges
// previously earned).
//
// Slim re-implementation of the 10 simpler badges from BADGE_DEFINITIONS in
// xpSystem.ts — avoids the heavy crowdData dependency that the full
// computeEarnedBadges needs. Skips: dark_horse (needs crowd %).
//
// Triggered from recalculatePool after match-results fan-out so badge pushes
// arrive shortly after the match that earned them.

import { createAdminClient } from '@/lib/supabase/server'
import { BADGE_DEFINITIONS, LEVELS } from '@/app/pools/[pool_id]/analytics/xpSystem'
import { sendPushToUser } from './apns'

type Snapshot = {
  current_level: number
  earned_badge_ids: string[] | null
  seeded: boolean | null
}

type BadgeState = {
  totalXP: number
  currentLevel: number
  earnedBadgeIds: string[]
}

type ScoreRow = {
  match_id: string
  match_number: number
  stage: string
  score_type: 'exact' | 'winner_gd' | 'winner' | 'miss'
  total_points: number
}

type MatchRow = {
  match_id: string
  match_number: number
  stage: string
  group_letter: string | null
}

/**
 * Fan-out badge + level pushes for every entry in a pool. Called after
 * recalculatePool finishes writing match_scores. Fire-and-forget by caller.
 */
export async function detectAndPushBadgesForPool(poolId: string): Promise<void> {
  const adminClient = createAdminClient()

  // 1. Pool + tournament info.
  const { data: pool } = await adminClient
    .from('pools')
    .select('pool_id, pool_name, tournament_id')
    .eq('pool_id', poolId)
    .single()
  if (!pool) return
  const tournamentId = (pool as { tournament_id: string | null }).tournament_id
  const poolName = (pool as { pool_name: string }).pool_name
  if (!tournamentId) return

  // 2. All entries with their user_id. pool_entries has NO pool_id column —
  // entries link to pools through pool_members — so fetch members first, then
  // entries by member_id (the same shape recalculatePool uses). The original
  // version filtered pool_entries by pool_id directly: PostgREST rejected it
  // on every call, and the swallowed error made this whole pipeline a silent
  // no-op since it shipped (entry_xp_state never seeded, badge/level-up
  // pushes never fired). Errors are checked loudly now for the same reason.
  const { data: members, error: membersErr } = await adminClient
    .from('pool_members')
    .select('member_id, user_id')
    .eq('pool_id', poolId)
  if (membersErr) {
    console.error('[badges] failed to fetch pool_members for', poolId, membersErr.message)
    return
  }
  const userByMember = new Map<string, string>(
    ((members ?? []) as Array<{ member_id: string; user_id: string }>).map((m) => [m.member_id, m.user_id]),
  )
  if (userByMember.size === 0) return

  const { data: rawEntries, error: entriesErr } = await adminClient
    .from('pool_entries')
    .select('entry_id, entry_name, member_id')
    .in('member_id', [...userByMember.keys()])
  if (entriesErr) {
    console.error('[badges] failed to fetch pool_entries for', poolId, entriesErr.message)
    return
  }
  type EntryRow = {
    entry_id: string
    entry_name: string
    member_id: string
  }
  const entries = (rawEntries ?? []) as EntryRow[]

  // 3. Total entries in pool (used for top_dog gating).
  const totalEntries = entries.length

  // 4. Matches for the tournament (for stage/group_letter lookups).
  const { data: rawMatches, error: matchesErr } = await adminClient
    .from('matches')
    .select('match_id, match_number, stage, group_letter')
    .eq('tournament_id', tournamentId)
  if (matchesErr) {
    console.error('[badges] failed to fetch matches for', poolId, matchesErr.message)
    return
  }
  const matches = (rawMatches ?? []) as MatchRow[]

  // 5. Process each entry. Settle in parallel; ignore individual failures.
  await Promise.allSettled(
    entries.map((e) => {
      const userId = userByMember.get(e.member_id)
      if (!userId) return Promise.resolve()
      return detectAndPushBadgesForEntry({
        adminClient,
        entryId: e.entry_id,
        entryName: e.entry_name,
        poolId,
        poolName,
        userId,
        matches,
        totalEntries,
      }).catch((err) => console.error('[badges] entry fan-out failed', e.entry_id, err))
    }),
  )
}

async function detectAndPushBadgesForEntry(args: {
  adminClient: ReturnType<typeof createAdminClient>
  entryId: string
  entryName: string
  poolId: string
  poolName: string
  userId: string
  matches: MatchRow[]
  totalEntries: number
}): Promise<void> {
  const { adminClient, entryId, entryName, poolId, poolName, userId, matches, totalEntries } = args

  const state = await computeBadgeState(adminClient, entryId, matches, totalEntries)

  // Load existing snapshot.
  const { data: snapshot } = (await adminClient
    .from('entry_xp_state')
    .select('current_level, earned_badge_ids, seeded')
    .eq('entry_id', entryId)
    .maybeSingle()) as { data: Snapshot | null }

  // Upsert new snapshot (always done — keeps state in sync even on first run).
  await adminClient.from('entry_xp_state').upsert({
    entry_id: entryId,
    total_xp: state.totalXP,
    current_level: state.currentLevel,
    earned_badge_ids: state.earnedBadgeIds,
    seeded: true,
    updated_at: new Date().toISOString(),
  })

  // First-run guard: don't push for badges the user "earned" on the very
  // first snapshot — they may have had them for weeks.
  if (!snapshot?.seeded) return

  const previousBadgeIds = snapshot.earned_badge_ids ?? []
  const newBadgeIds = state.earnedBadgeIds.filter((id) => !previousBadgeIds.includes(id))
  const previousLevel = snapshot.current_level ?? 1
  const leveledUp = state.currentLevel > previousLevel

  // Fire badge pushes (one per newly earned badge).
  for (const badgeId of newBadgeIds) {
    const badge = BADGE_DEFINITIONS.find((b) => b.id === badgeId)
    if (!badge) continue
    // Record the pending action FIRST so the badge count in the APNs payload
    // (computed inside sendPushToUser) reflects this notification. The
    // partial unique index on (user_id, action_type, pool_id, reference_id)
    // where completed_at IS NULL makes duplicate inserts no-ops, so retries
    // and re-fires don't pile up extra dots. See migration 019.
    await adminClient
      .from('user_pending_actions')
      .insert({
        user_id: userId,
        action_type: 'badge_unlock',
        pool_id: poolId,
        reference_id: badgeId,
      })
      .then(({ error }) => {
        if (error && error.code !== '23505') {
          console.warn('[badges] failed to insert pending action', userId, badgeId, error)
        }
      })
    await sendPushToUser(
      userId,
      {
        title: `${badge.emoji} ${badge.name} unlocked!`,
        body: `${badge.condition} · +${badge.xpBonus} XP · ${entryName} · ${poolName}`,
        data: {
          type: 'gamification',
          sub: 'badge',
          badge_id: badgeId,
          pool_id: poolId,
        },
      },
      'GAMIFICATION',
    ).catch((err) => console.error('[badges] badge push failed', userId, badgeId, err))
  }

  // Fire level-up push (one per crossing — if you crossed two at once, only
  // the latest is announced).
  if (leveledUp) {
    const newLevelDef = LEVELS.find((l) => l.level === state.currentLevel)
    // Record pending action — same pattern as badge_unlock above. reference_id
    // is the level number so the per-cell dot in Form tab can target the
    // specific level on the runway. Duplicate-suppressed by partial unique
    // index in migration 019.
    await adminClient
      .from('user_pending_actions')
      .insert({
        user_id: userId,
        action_type: 'level_up',
        pool_id: poolId,
        reference_id: String(state.currentLevel),
      })
      .then(({ error }) => {
        if (error && error.code !== '23505') {
          console.warn('[badges] failed to insert pending level_up', userId, error)
        }
      })
    await sendPushToUser(
      userId,
      {
        title: `⭐ Level ${state.currentLevel} reached!`,
        body: `${newLevelDef?.name ?? 'New rank'} · ${entryName} · ${poolName}`,
        data: {
          type: 'gamification',
          sub: 'level_up',
          level: String(state.currentLevel),
          pool_id: poolId,
        },
      },
      'GAMIFICATION',
    ).catch((err) => console.error('[badges] level push failed', userId, err))
  }
}

/**
 * Compute the entry's current XP / level / earned-badge set from primary
 * data sources. Slim version — covers 10 of the 12 BADGE_DEFINITIONS using
 * cheap queries; skips dark_horse (needs pool-wide crowd %) for v1.
 */
async function computeBadgeState(
  adminClient: ReturnType<typeof createAdminClient>,
  entryId: string,
  matches: MatchRow[],
  totalEntries: number,
): Promise<BadgeState> {
  const [scoreRes, predCountRes, entryRes] = await Promise.all([
    adminClient
      .from('match_scores')
      .select('match_id, match_number, stage, score_type, total_points')
      .eq('entry_id', entryId)
      .order('match_number', { ascending: true }),
    adminClient
      .from('predictions')
      .select('prediction_id', { count: 'exact', head: true })
      .eq('entry_id', entryId),
    adminClient
      .from('pool_entries')
      .select('current_rank')
      .eq('entry_id', entryId)
      .maybeSingle(),
  ])

  const scores = (scoreRes.data ?? []) as ScoreRow[]
  const predictionCount = predCountRes.count ?? 0
  const currentRank = (entryRes.data as { current_rank: number | null } | null)?.current_rank ?? null

  const matchById = new Map(matches.map((m) => [m.match_id, m]))
  const earnedIds: string[] = []

  // 🎯 sharpshooter — 2+ exact predictions
  const exactCount = scores.filter((s) => s.score_type === 'exact').length
  if (exactCount >= 2) earnedIds.push('sharpshooter')

  // 🔮 oracle — longest hot streak >= 3
  // 🔥 on_fire — longest hot streak >= 5
  // 🧊 ice_breaker — broke a cold streak of 5+
  let longestHot = 0
  let currentHot = 0
  let currentCold = 0
  let lastWasCold = false
  let brokeIce = false
  for (const s of scores) {
    const correct = s.score_type !== 'miss'
    if (correct) {
      if (lastWasCold && currentCold >= 5) brokeIce = true
      lastWasCold = false
      currentHot++
      currentCold = 0
      if (currentHot > longestHot) longestHot = currentHot
    } else {
      lastWasCold = true
      currentCold++
      currentHot = 0
    }
  }
  if (longestHot >= 3) earnedIds.push('oracle')
  if (longestHot >= 5) earnedIds.push('on_fire')
  if (brokeIce) earnedIds.push('ice_breaker')

  // 👑 top_dog — rank #1 (only if pool has 2+ entries AND entry has scores)
  if (currentRank === 1 && totalEntries >= 2 && scores.length > 0) {
    earnedIds.push('top_dog')
  }

  // 🌍 globe_trotter — 50%+ accuracy across all 12 groups
  const groupResults = new Map<string, { correct: number; total: number }>()
  for (const s of scores) {
    const match = matchById.get(s.match_id)
    if (!match || match.stage !== 'group' || !match.group_letter) continue
    const g = match.group_letter
    const cur = groupResults.get(g) ?? { correct: 0, total: 0 }
    cur.total++
    if (s.score_type !== 'miss') cur.correct++
    groupResults.set(g, cur)
  }
  if (
    groupResults.size >= 12 &&
    Array.from(groupResults.values()).every((s) => s.total > 0 && s.correct / s.total >= 0.5)
  ) {
    earnedIds.push('globe_trotter')
  }

  // ⚡ lightning_rod — at least one prediction per tournament match
  if (predictionCount > 0 && predictionCount >= matches.length) {
    earnedIds.push('lightning_rod')
  }

  // 🏟️ stadium_regular — 104+ predictions
  if (predictionCount >= 104) earnedIds.push('stadium_regular')

  // 🎪 showtime — exact in a knockout match
  for (const s of scores) {
    if (s.score_type !== 'exact') continue
    const match = matchById.get(s.match_id)
    if (match && match.stage !== 'group') {
      earnedIds.push('showtime')
      break
    }
  }

  // 🏆 grand_finale — non-miss in the Final
  for (const s of scores) {
    if (s.score_type === 'miss') continue
    const match = matchById.get(s.match_id)
    if (match && match.stage === 'final') {
      earnedIds.push('grand_finale')
      break
    }
  }

  // ⭐ legend — Level 10 (totalXP >= 7500). Computed AFTER badge bonuses so
  // legend can stack on top of everything else.
  const matchPoints = scores.reduce((sum, s) => sum + s.total_points, 0)
  const badgeXP = earnedIds.reduce((sum, id) => {
    const b = BADGE_DEFINITIONS.find((b) => b.id === id)
    return sum + (b?.xpBonus ?? 0)
  }, 0)
  const totalXP = matchPoints + badgeXP
  if (totalXP >= 7500) earnedIds.push('legend')

  // Map total XP → level number.
  let currentLevel = 1
  for (const level of LEVELS) {
    if (totalXP >= level.xpRequired) currentLevel = level.level
  }

  return { totalXP, currentLevel, earnedBadgeIds: earnedIds }
}
