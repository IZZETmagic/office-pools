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
//
// ---------------------------------------------------------------------------
// XP OWNERSHIP (fixed 2026-07-26 — see drafts/2026-07-26_analytics_parity_result.md)
//
// This file used to compute its OWN total_xp as `Σ match_scores.total_points +
// badgeXP` and write it to entry_xp_state.total_xp / .current_level. That is a
// different QUANTITY from the XP the rest of the product means: computeFullXP-
// Breakdown uses BASE_XP[tier] x STAGE_MULTIPLIERS plus crowd/streak bonus
// events. Both were compared against the same LEVELS.xpRequired thresholds and
// both wrote the same two columns, last-writer-wins — so the level shown on
// /pools and /dashboard depended on which path last touched the row.
//
// entry_xp_state.total_xp / .current_level now have exactly ONE definition:
// computeFullXPBreakdown, reached via computePoolEntryAnalytics. This file
// consumes that value; it no longer invents one. The slim badge set below is
// unchanged and still drives badge pushes, so push behaviour is untouched.
// ---------------------------------------------------------------------------

import { createAdminClient } from '@/lib/supabase/server'
import { BADGE_DEFINITIONS, LEVELS } from '@/app/pools/[pool_id]/analytics/xpSystem'
import { computePoolEntryAnalytics, type EntryAnalyticsRow } from '@/lib/analytics/entryAnalytics'
import { sendPushToUser } from './apns'
import { isProdScoringEnabled } from '@/lib/scoring/prodScoringFlag'

/**
 * The authoritative analytics row for one entry, or null when it could not be
 * computed. Carries XP/level (the columns this file used to invent) AND the
 * analytics columns — we compute them all in one pass, so we persist them all
 * rather than throwing the rest away. That keeps entry_xp_state fresh as a
 * by-product of scoring, instead of depending on a separate sweep.
 */
export type EntryXP = EntryAnalyticsRow | null

type Snapshot = {
  current_level: number
  earned_badge_ids: string[] | null
  seeded: boolean | null
}

type BadgeState = {
  /** Mirrors the authoritative XP passed in — never computed here. */
  totalXP: number | null
  currentLevel: number | null
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

  // 4b. Authoritative XP + level for every entry in the pool — computed ONCE,
  // in bulk, from the single shared definition (computeFullXPBreakdown). This
  // replaces the per-entry points-based figure this file used to invent.
  //
  // Cost note: this is a handful of bulk queries for the whole pool, versus the
  // 3-queries-per-entry that computeBadgeState still issues below — so on a
  // large pool this is cheaper than what it displaces, not an addition.
  //
  // On failure we deliberately DO NOT fall back to a locally-derived number:
  // a wrong level is worse than a stale one. xpByEntry stays empty, the two
  // columns are omitted from the upsert (leaving any existing value untouched),
  // and level-up pushes are skipped for this run.
  const xpByEntry = new Map<string, EntryAnalyticsRow>()
  try {
    for (const row of await computePoolEntryAnalytics(adminClient, poolId)) {
      xpByEntry.set(row.entry_id, row)
    }
  } catch (err) {
    console.error('[badges] XP compute failed for', poolId, '— XP columns left untouched:', err)
  }

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
        tournamentId,
        matches,
        totalEntries,
        // Entries with no predictions get no analytics row — they have no XP
        // to speak of, and computeBadgeState will find no scores either.
        xp: xpByEntry.get(e.entry_id) ?? null,
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
  tournamentId: string
  matches: MatchRow[]
  totalEntries: number
  xp: EntryXP
}): Promise<void> {
  const { adminClient, entryId, entryName, poolId, poolName, userId, tournamentId, matches, totalEntries, xp } = args

  const state = await computeBadgeState(adminClient, entryId, matches, totalEntries, xp)

  // Load existing snapshot.
  const { data: snapshot } = (await adminClient
    .from('entry_xp_state')
    .select('current_level, earned_badge_ids, seeded')
    .eq('entry_id', entryId)
    .maybeSingle()) as { data: Snapshot | null }

  // Upsert new snapshot (always done — keeps state in sync even on first run).
  // The XP + analytics columns are OMITTED when they could not be computed: on
  // conflict PostgREST only SETs the columns present, so existing values are
  // left intact rather than clobbered with a guess.
  //
  // The error IS checked, and loudly. This upsert names highest_level_reached
  // (migration 026). If this code ever runs against a database where 026 has
  // not been applied, PostgREST rejects the ENTIRE upsert — not just that
  // column — so earned_badge_ids and `seeded` would silently stop updating
  // while the push paths below kept firing. That failure is invisible without
  // this check. Same class of bug as the swallowed pool_members error that made
  // this whole pipeline a no-op for months (see the note in step 2 above).
  const { error: snapshotErr } = await adminClient.from('entry_xp_state').upsert({
    entry_id: entryId,
    ...(xp
      ? {
          total_xp: xp.total_xp,
          current_level: xp.current_level,
          highest_level_reached: xp.highest_level_reached,
          // Persisted here too so the precomputed analytics stay fresh as a
          // by-product of scoring — we already paid to compute them above.
          last_five: xp.last_five,
          current_streak: xp.current_streak,
          hit_rate: xp.hit_rate,
          total_completed: xp.total_completed,
          exact_count: xp.exact_count,
          contrarian_wins: xp.contrarian_wins,
          crowd_agreement_pct: xp.crowd_agreement_pct,
          analytics_updated_at: xp.analytics_updated_at,
        }
      : {}),
    earned_badge_ids: state.earnedBadgeIds,
    seeded: true,
    updated_at: new Date().toISOString(),
  })
  if (snapshotErr) {
    console.error('[badges] entry_xp_state upsert FAILED for', entryId, '—', snapshotErr.message)
    // Bail before pushing. The snapshot is the diff basis for "what's new": if
    // it didn't persist, the next run re-derives the same badges and levels as
    // new and pushes them again. Staying silent is the safe failure.
    return
  }

  // Permanent, append-only record of every badge this entry has earned. Unlike
  // earned_badge_ids above (a mutable snapshot that shrinks when a later
  // recompute no longer re-derives a badge), badge_unlocks never loses a badge —
  // it's the durable "ever earned" source and the backing for cumulative counts.
  // Recorded for ALL currently-earned badges (even on the first seed);
  // idempotent via the (entry_id, badge_id) unique constraint.
  if (state.earnedBadgeIds.length > 0) {
    await adminClient
      .from('badge_unlocks')
      .upsert(
        state.earnedBadgeIds.map((badgeId) => ({
          entry_id: entryId,
          user_id: userId,
          pool_id: poolId,
          tournament_id: tournamentId,
          badge_id: badgeId,
        })),
        { onConflict: 'entry_id,badge_id', ignoreDuplicates: true },
      )
      .then(({ error }) => {
        if (error) console.warn('[badges] badge_unlocks upsert failed', entryId, error.message)
      })
  }

  // First-run guard: don't push for badges the user "earned" on the very
  // first snapshot — they may have had them for weeks.
  if (!snapshot?.seeded) return

  const previousBadgeIds = snapshot.earned_badge_ids ?? []
  const newBadgeIds = state.earnedBadgeIds.filter((id) => !previousBadgeIds.includes(id))
  const previousLevel = snapshot.current_level ?? 1
  // No authoritative level this run ⇒ no level-up claim. Never infer a crossing
  // from a number we didn't compute.
  const leveledUp = state.currentLevel !== null && state.currentLevel > previousLevel

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
  xp: EntryXP,
): Promise<BadgeState> {
  // Shadow-cutover mode (prod scoring off): read scores from the shadow table.
  const scoreTable = (await isProdScoringEnabled(adminClient)) ? 'match_scores' : 'shadow_match_scores'
  const [scoreRes, predCountRes, entryRes] = await Promise.all([
    adminClient
      .from(scoreTable)
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

  // ⭐ legend — Level 10. Uses the AUTHORITATIVE XP (computeFullXPBreakdown),
  // not a locally-derived figure. This file previously computed
  // `Σ match_scores.total_points + badgeXP` here and treated it as XP — a
  // different quantity measured against the same LEVELS thresholds. See the
  // XP OWNERSHIP note at the top of this file.
  //
  // Note the badge XP that computeFullXPBreakdown folds in comes from ITS badge
  // set, which is the fuller one (it includes dark_horse). That is intended:
  // XP is a whole-product number, while the slim set below exists only to
  // decide which badge PUSHES to fire.
  if (xp && xp.total_xp >= 7500) earnedIds.push('legend')

  // Level is whatever the shared definition says. Null when unavailable — the
  // caller then omits the column and skips level-up pushes.
  return { totalXP: xp?.total_xp ?? null, currentLevel: xp?.current_level ?? null, earnedBadgeIds: earnedIds }
}
