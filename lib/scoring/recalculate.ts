// =============================================================
// SCORING ENGINE — RECALCULATION ORCHESTRATOR
// =============================================================
// This is the single entry point for recalculating scores.
// It determines the pool's prediction mode, fetches all required
// data, calls the appropriate calculator, and writes results
// to the database.
//
// Phase 1: Shadow-writes to match_scores table alongside the
// existing system. Does NOT modify existing scoring logic.
// =============================================================

import { createAdminClient } from '@/lib/supabase/server'
import { fanOutResultPushes } from '@/lib/push/match-results'
import { detectAndPushBadgesForPool } from '@/lib/push/badges'
import { invalidatePoolCache } from '@/lib/poolData'
import type {
  ScoringResult,
  MatchScoreRow,
  BonusScoreRow,
  EntryTotals,
  MatchWithResult,
  TeamData,
  ConductData,
  TournamentAwards,
  EntryWithPredictions,
  PoolSettings,
} from './types'
import { DEFAULT_POOL_SETTINGS } from '@/app/pools/[pool_id]/results/points'
import { calculateFullTournament } from './full'
import { calculateProgressive } from './progressive'
import { calculateBracketPicker, type BracketPickerInput } from './bracket'
import type { BPEntryWithPicks } from './types'
import { diffRows, matchScoreKey, matchScoreValue, bonusScoreKey, bonusScoreValue } from './diffWrite'
import { syncShadowResolvedBracketsPiggyback } from './shadowBrackets'
import { isProdScoringEnabled } from './prodScoringFlag'

// ----- Public API -----

export type RecalculateOptions = {
  /** The pool to recalculate */
  poolId: string
  /** Optional: only recalculate scores for a specific match (optimization for live updates) */
  matchId?: string
}

export type RecalculateResult = {
  success: boolean
  poolId: string
  predictionMode: string
  entriesProcessed: number
  matchScoresWritten: number
  bonusScoresWritten: number
  error?: string
}

/**
 * Recalculate all scores for a pool and write to match_scores table.
 *
 * This is the ONLY function that should write to match_scores.
 * Call it when:
 *   - A match result is entered/updated
 *   - Pool scoring settings change
 *   - A group completes (triggers bonus recalculation)
 *   - Tournament awards are set
 */
export async function recalculatePool(options: RecalculateOptions): Promise<RecalculateResult> {
  const { poolId } = options
  const adminClient = createAdminClient()

  // Production-scoring kill-switch (shadow cutover). When prod scoring is
  // disabled, the shadow engine is the sole scorer — skip the heavy recompute
  // entirely (this is where the CPU goes). STILL fire the side-effect pushes:
  // in this mode they read shadow scores (see lib/push/*). Fail-safe default ON.
  if (!(await isProdScoringEnabled(adminClient))) {
    void fanOutResultPushes().catch((err) =>
      console.error(`[scoring] push fan-out (shadow mode) failed for pool ${poolId}:`, err),
    )
    void detectAndPushBadgesForPool(poolId).catch((err) =>
      console.error(`[scoring] badge fan-out (shadow mode) failed for pool ${poolId}:`, err),
    )
    invalidatePoolCache(poolId)
    return { success: true, poolId, predictionMode: 'shadow', entriesProcessed: 0, matchScoresWritten: 0, bonusScoresWritten: 0 }
  }

  try {
    // 1. Fetch pool info
    const { data: pool, error: poolError } = await adminClient
      .from('pools')
      .select('pool_id, tournament_id, prediction_mode')
      .eq('pool_id', poolId)
      .single()

    if (poolError || !pool) {
      return { success: false, poolId, predictionMode: 'unknown', entriesProcessed: 0, matchScoresWritten: 0, bonusScoresWritten: 0, error: `Pool not found: ${poolError?.message}` }
    }

    // 2. Fetch all required data in parallel
    const [
      { data: matches },
      { data: teams },
      { data: conductData },
      { data: settingsRow },
      { data: tournamentAwardsRow },
      { data: poolMembers },
    ] = await Promise.all([
      adminClient
        .from('matches')
        .select('*, home_team:teams!matches_home_team_id_fkey(country_name, flag_url), away_team:teams!matches_away_team_id_fkey(country_name, flag_url)')
        .eq('tournament_id', pool.tournament_id)
        .order('match_number', { ascending: true }),
      adminClient
        .from('teams')
        .select('team_id, country_name, country_code, group_letter, fifa_ranking_points, flag_url')
        .eq('tournament_id', pool.tournament_id),
      adminClient
        .from('match_conduct')
        .select('match_id, team_id, yellow_cards, indirect_red_cards, direct_red_cards, yellow_direct_red_cards'),
      adminClient
        .from('pool_settings')
        .select('*')
        .eq('pool_id', poolId)
        .single(),
      adminClient
        .from('tournament_awards')
        .select('champion_team_id, runner_up_team_id, third_place_team_id, best_player, top_scorer')
        .eq('tournament_id', pool.tournament_id)
        .single(),
      adminClient
        .from('pool_members')
        .select('member_id')
        .eq('pool_id', poolId),
    ])

    if (!matches || !teams || !poolMembers) {
      return { success: false, poolId, predictionMode: pool.prediction_mode, entriesProcessed: 0, matchScoresWritten: 0, bonusScoresWritten: 0, error: 'Failed to fetch pool data' }
    }

    // Normalize data
    const normalizedMatches: MatchWithResult[] = matches.map((m: any) => ({
      ...m,
      home_team: Array.isArray(m.home_team) ? m.home_team[0] ?? null : m.home_team,
      away_team: Array.isArray(m.away_team) ? m.away_team[0] ?? null : m.away_team,
    }))

    const settings: PoolSettings = { ...DEFAULT_POOL_SETTINGS, ...(settingsRow || {}) }
    const tournamentAwards: TournamentAwards | null = tournamentAwardsRow || null
    const conduct: ConductData[] = conductData || []
    const teamsData: TeamData[] = (teams as any[]).map(t => ({
      ...t,
      group_letter: t.group_letter?.trim() || '',
      country_code: t.country_code?.trim() || '',
    }))

    // 3. Fetch entries and predictions
    const memberIds = poolMembers.map((m: any) => m.member_id)
    const { data: entries } = await adminClient
      .from('pool_entries')
      .select('entry_id, member_id, has_submitted_predictions, point_adjustment, predictions_submitted_at, match_points, bonus_points, scored_total_points, current_rank')
      .in('member_id', memberIds)

    if (!entries) {
      return { success: false, poolId, predictionMode: pool.prediction_mode, entriesProcessed: 0, matchScoresWritten: 0, bonusScoresWritten: 0, error: 'Failed to fetch entries' }
    }

    // Determine which entries count as "submitted".
    //
    // full_tournament / bracket_picker: the legacy
    // has_submitted_predictions flag, set by the all-at-once submit flow.
    //
    // progressive: submission lives per-round in entry_round_submissions,
    // and the manual round-submit flow deliberately never sets the legacy
    // flag — only the deadline auto-submit sweep does. Filtering on the
    // flag alone made manual submitters invisible to scoring (group-stage
    // day 1: 99 entries across 21 pools stuck on 0 points while
    // auto-submitted entries scored fine). An entry counts as submitted
    // once it has submitted any round.
    let submittedEntries = entries.filter((e: any) => e.has_submitted_predictions)
    if (pool.prediction_mode === 'progressive') {
      const allEntryIds = entries.map((e: any) => e.entry_id)
      const roundSubmittedIds = new Set<string>()
      const ersPageSize = 1000
      let ersOffset = 0
      let ersHasMore = true
      while (ersHasMore) {
        const { data: page } = await adminClient
          .from('entry_round_submissions')
          .select('id, entry_id')
          .in('entry_id', allEntryIds)
          .eq('has_submitted', true)
          .order('id', { ascending: true })
          .range(ersOffset, ersOffset + ersPageSize - 1)
        if (!page || page.length === 0) {
          ersHasMore = false
        } else {
          for (const r of page) roundSubmittedIds.add((r as any).entry_id)
          ersOffset += page.length
          if (page.length < ersPageSize) ersHasMore = false
        }
      }
      submittedEntries = entries.filter(
        (e: any) => e.has_submitted_predictions || roundSubmittedIds.has(e.entry_id)
      )
    }

    // 4. Route to the appropriate calculator
    let result: ScoringResult

    if (pool.prediction_mode === 'bracket_picker') {
      result = await calculateBracketPickerMode(adminClient, poolId, pool.tournament_id, normalizedMatches, teamsData, conduct, settings, submittedEntries)
    } else {
      // Full tournament or progressive — both use match predictions
      const entryIds = submittedEntries.map((e: any) => e.entry_id)

      // Fetch ALL predictions — paginate to avoid Supabase's 1000-row limit
      const predictionsByEntry = new Map<string, any[]>()
      const pageSize = 1000
      let offset = 0
      let hasMore = true

      while (hasMore) {
        // Stable sort is load-bearing: offset pagination without ORDER BY is
        // nondeterministic under concurrent writes — page seams silently
        // dropped entries' predictions, scoring them as if they predicted
        // nothing (108 entries in large pools after match 1).
        const { data: page } = await adminClient
          .from('predictions')
          .select('entry_id, match_id, predicted_home_score, predicted_away_score, predicted_home_pso, predicted_away_pso, predicted_winner_team_id')
          .in('entry_id', entryIds)
          .order('entry_id', { ascending: true })
          .order('match_id', { ascending: true })
          .range(offset, offset + pageSize - 1)

        if (!page || page.length === 0) {
          hasMore = false
        } else {
          for (const p of page) {
            const list = predictionsByEntry.get(p.entry_id) || []
            list.push(p)
            predictionsByEntry.set(p.entry_id, list)
          }
          offset += page.length
          if (page.length < pageSize) hasMore = false
        }
      }

      const entriesWithPredictions: EntryWithPredictions[] = submittedEntries.map((e: any) => ({
        entry_id: e.entry_id,
        member_id: e.member_id,
        point_adjustment: e.point_adjustment ?? 0,
        predictions: (predictionsByEntry.get(e.entry_id) || []).map((p: any) => ({
          match_id: p.match_id,
          predicted_home_score: p.predicted_home_score,
          predicted_away_score: p.predicted_away_score,
          predicted_home_pso: p.predicted_home_pso ?? null,
          predicted_away_pso: p.predicted_away_pso ?? null,
          predicted_winner_team_id: p.predicted_winner_team_id ?? null,
        })),
      }))

      const input = {
        poolId,
        tournamentId: pool.tournament_id,
        predictionMode: pool.prediction_mode as 'full_tournament' | 'progressive',
        settings,
        matches: normalizedMatches,
        teams: teamsData,
        conductData: conduct,
        entries: entriesWithPredictions,
        tournamentAwards,
      }

      if (pool.prediction_mode === 'progressive') {
        result = calculateProgressive(input)
      } else {
        result = calculateFullTournament(input)
        // Piggyback (knockout shadow phase): keep shadow_resolved_brackets fresh.
        // Env-gated OFF (SHADOW_BRACKETS_ENABLED) so it adds ZERO cost to live
        // scoring until deliberately enabled, and fire-and-forget so a failure can
        // never affect the recalc — same pattern as the push fan-outs below.
        if (process.env.SHADOW_BRACKETS_ENABLED === 'true') {
          void syncShadowResolvedBracketsPiggyback(
            adminClient, poolId, normalizedMatches, teamsData, conduct, entriesWithPredictions,
          ).catch((err) => console.error(`[scoring] shadow bracket sync failed for pool ${poolId}:`, err))
        }
      }
    }

    // 5. Build submission time lookup for rank tiebreaker, plus current
    // totals so the write step can skip entries whose values didn't change
    // (every skipped UPDATE is a realtime event that never fans out).
    const submissionTimeMap = new Map<string, string | null>()
    const currentTotals = new Map<string, CurrentEntryTotals>()
    for (const e of entries as any[]) {
      submissionTimeMap.set(e.entry_id, e.predictions_submitted_at ?? null)
      currentTotals.set(e.entry_id, {
        match_points: e.match_points ?? null,
        bonus_points: e.bonus_points ?? null,
        scored_total_points: e.scored_total_points ?? null,
        current_rank: e.current_rank ?? null,
      })
    }

    // 6. Write results to database (shadow-write for Phase 1)
    const writeResult = await writeScoresToDB(adminClient, poolId, result, submissionTimeMap, currentTotals, options.matchId)

    // 7. Fire match-completion pushes (prediction_result + matchday MVP +
    // streak milestones). Fire-and-forget — if push fan-out fails or hangs,
    // the recalc still returns success. The fan-out has its own per-match
    // claim guard so concurrent recalcs across pools don't double-send.
    void fanOutResultPushes().catch((err) =>
      console.error(`[scoring] push fan-out failed for pool ${poolId}:`, err),
    )

    // 8. Fire badge + level-up pushes for entries whose XP state changed.
    // Diffs against entry_xp_state snapshot so users only get pushed for
    // *newly* earned badges and *newly crossed* levels. First-run entries
    // are seeded silently.
    void detectAndPushBadgesForPool(poolId).catch((err) =>
      console.error(`[scoring] badge fan-out failed for pool ${poolId}:`, err),
    )

    // Refresh this pool's cached leaderboard now that its scores changed
    // (SCALE_PLAN Phase 1b). Safe no-op when caching is off / outside a request
    // context; can never affect scoring (see invalidatePoolCache).
    invalidatePoolCache(poolId)

    return {
      success: true,
      poolId,
      predictionMode: pool.prediction_mode,
      entriesProcessed: submittedEntries.length,
      matchScoresWritten: writeResult.matchScoresWritten,
      bonusScoresWritten: writeResult.bonusScoresWritten,
    }
  } catch (err: any) {
    console.error(`[scoring] recalculatePool error for ${poolId}:`, err)
    return {
      success: false,
      poolId,
      predictionMode: 'unknown',
      entriesProcessed: 0,
      matchScoresWritten: 0,
      bonusScoresWritten: 0,
      error: err?.message || 'Unknown error',
    }
  }
}

// ----- Bracket picker data fetching -----

// Fetch every row of a per-entry table across all entries, paginating
// past PostgREST's 1000-row response cap. Ordered by (entry_id, id) so
// page boundaries are deterministic under concurrent writes.
async function fetchAllByEntry(
  adminClient: any,
  table: string,
  entryIds: string[],
): Promise<any[]> {
  if (entryIds.length === 0) return []
  const out: any[] = []
  const pageSize = 1000
  let offset = 0
  for (;;) {
    const { data: page, error } = await adminClient
      .from(table)
      .select('*')
      .in('entry_id', entryIds)
      .order('entry_id', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1)
    if (error) {
      console.error(`[scoring] Failed to fetch ${table} page at offset ${offset}:`, error)
      break
    }
    if (!page || page.length === 0) break
    out.push(...page)
    if (page.length < pageSize) break
    offset += page.length
  }
  return out
}

async function calculateBracketPickerMode(
  adminClient: any,
  poolId: string,
  tournamentId: string,
  matches: MatchWithResult[],
  teams: TeamData[],
  conduct: ConductData[],
  settings: PoolSettings,
  submittedEntries: any[],
): Promise<ScoringResult> {
  const entryIds = submittedEntries.map((e: any) => e.entry_id)

  // Paginate every per-entry fetch. A single bracket entry carries ~48
  // group-ranking rows (plus third-place and knockout rows), so any pool
  // past ~20 entries blows through PostgREST's 1000-row response cap. An
  // unpaginated .in() silently returned only the first page, leaving every
  // entry beyond the cap with no predictions — scored as if they'd
  // predicted nothing (the June 12 bracket zero-points incident: large
  // pools scored only their first ~20 entries). Stable ORDER BY so page
  // seams are deterministic; mirrors the predictions fetch above.
  const [allGroupRankings, allThirdPlaceRankings, allKnockoutPicks] = await Promise.all([
    fetchAllByEntry(adminClient, 'bracket_picker_group_rankings', entryIds),
    fetchAllByEntry(adminClient, 'bracket_picker_third_place_rankings', entryIds),
    fetchAllByEntry(adminClient, 'bracket_picker_knockout_picks', entryIds),
  ])

  // Group by entry
  const groupRankingsByEntry = new Map<string, any[]>()
  const thirdPlaceByEntry = new Map<string, any[]>()
  const knockoutPicksByEntry = new Map<string, any[]>()

  for (const r of (allGroupRankings || [])) {
    const list = groupRankingsByEntry.get(r.entry_id) || []
    list.push(r)
    groupRankingsByEntry.set(r.entry_id, list)
  }
  for (const r of (allThirdPlaceRankings || [])) {
    const list = thirdPlaceByEntry.get(r.entry_id) || []
    list.push(r)
    thirdPlaceByEntry.set(r.entry_id, list)
  }
  for (const p of (allKnockoutPicks || [])) {
    const list = knockoutPicksByEntry.get(p.entry_id) || []
    list.push(p)
    knockoutPicksByEntry.set(p.entry_id, list)
  }

  const bpEntries: BPEntryWithPicks[] = submittedEntries.map((e: any) => ({
    entry_id: e.entry_id,
    member_id: e.member_id,
    point_adjustment: e.point_adjustment ?? 0,
    groupRankings: groupRankingsByEntry.get(e.entry_id) || [],
    thirdPlaceRankings: thirdPlaceByEntry.get(e.entry_id) || [],
    knockoutPicks: knockoutPicksByEntry.get(e.entry_id) || [],
  }))

  // Live provisional group scoring kill switch. Defaults FALSE on any read
  // problem — failing closed reverts to the original fully-completed-groups
  // behavior. Backout: set sync_settings.bp_provisional_scoring = false and
  // run one sweep; the scoring gate reverts every provisional point.
  const { data: provisionalSetting } = await adminClient
    .from('sync_settings')
    .select('setting_value')
    .eq('setting_key', 'bp_provisional_scoring')
    .maybeSingle()
  const provisionalGroups =
    provisionalSetting?.setting_value === true || provisionalSetting?.setting_value === 'true'

  const input: BracketPickerInput = {
    poolId,
    tournamentId,
    settings,
    matches,
    teams,
    conductData: conduct,
    entries: bpEntries,
    provisionalGroups,
  }

  return calculateBracketPicker(input)
}

// ----- Database write (Phase 1: shadow-write) -----

type CurrentEntryTotals = {
  match_points: number | null
  bonus_points: number | null
  scored_total_points: number | null
  current_rank: number | null
}

async function writeScoresToDB(
  adminClient: any,
  poolId: string,
  result: ScoringResult,
  submissionTimeMap: Map<string, string | null>,
  currentTotals?: Map<string, CurrentEntryTotals>,
  onlyMatchId?: string,
): Promise<{ matchScoresWritten: number; bonusScoresWritten: number }> {
  const { matchScores: allMatchScores, bonusScores, entryTotals } = result

  // Live-update optimization: when the caller knows exactly one match's
  // score moved, scope the match_scores rewrite to that match. Totals,
  // ranks, and bonus_scores still come from the full computation, so the
  // table stays globally consistent — we just skip rewriting rows that
  // cannot have changed. Full rewrites (no onlyMatchId) remain the
  // authority for settings changes, resets, and completion cascades.
  const matchScores = onlyMatchId
    ? allMatchScores.filter(ms => ms.match_id === onlyMatchId)
    : allMatchScores

  let matchScoresWritten = 0
  let bonusScoresWritten = 0

  const allEntryIds = [...new Set(entryTotals.map(t => t.entry_id))]

  // B1 — change-only writes (gated by sync_settings.scoring_diff_writes_enabled).
  // When ON, write only the match_scores / bonus_scores rows whose MEANINGFUL
  // values changed instead of deleting and re-inserting every row. Stored values
  // come out identical except metadata (id, calculated_at) — parity-tested — so
  // we skip the no-op churn that makes completion sweeps run for minutes.
  // SAFETY: ANY failure in the diff path (read or write) falls back to the legacy
  // delete-all + insert-all path. Legacy is idempotent, so it reconciles any
  // partial diff writes to the correct final state — B1 is strictly
  // no-worse-than-legacy under failure. pool_entries totals (further down) are
  // already diff-gated.
  const useDiffWrites = await isDiffWritesEnabled(adminClient)

  if (useDiffWrites) {
    try {
      matchScoresWritten = await diffWriteMatchScores(adminClient, poolId, matchScores, allEntryIds, onlyMatchId)
      bonusScoresWritten = await diffWriteBonusScores(adminClient, bonusScores)
    } catch (err) {
      console.error(`[scoring] diff-write failed for pool ${poolId}; falling back to legacy delete+insert:`, err)
      const legacy = await legacyWriteScores(adminClient, poolId, matchScores, bonusScores, allEntryIds, onlyMatchId)
      matchScoresWritten = legacy.matchScoresWritten
      bonusScoresWritten = legacy.bonusScoresWritten
    }
  } else {
    const legacy = await legacyWriteScores(adminClient, poolId, matchScores, bonusScores, allEntryIds, onlyMatchId)
    matchScoresWritten = legacy.matchScoresWritten
    bonusScoresWritten = legacy.bonusScoresWritten
  }

  // Update entry totals + current_rank on pool_entries
  // NOTE: previous_rank is NOT updated here — it is only snapshotted when a match
  // is set to live (via /api/pools/snapshot-ranks), so rank deltas show movement
  // since the start of the current matchday, not since the last recalculation.
  if (entryTotals.length > 0) {
    // Compute new ranks with tiebreakers:
    // 1. Total points (descending)
    // 2. Most exact scores (descending)
    // 3. Most correct results (descending)
    // 4. Bonus points (descending)
    // 5. Earlier submission time (ascending — earlier is better)
    const sorted = [...entryTotals].sort((a, b) => {
      // Primary: total points
      if (b.total_points !== a.total_points) return b.total_points - a.total_points
      // Tiebreaker 1: most exact scores
      if (b.exact_count !== a.exact_count) return b.exact_count - a.exact_count
      // Tiebreaker 2: most correct results
      if (b.correct_count !== a.correct_count) return b.correct_count - a.correct_count
      // Tiebreaker 3: bonus points
      if (b.bonus_points !== a.bonus_points) return b.bonus_points - a.bonus_points
      // Tiebreaker 4: earlier submission time
      const aTime = submissionTimeMap.get(a.entry_id)
      const bTime = submissionTimeMap.get(b.entry_id)
      if (aTime && bTime) return new Date(aTime).getTime() - new Date(bTime).getTime()
      if (aTime && !bTime) return -1 // submitted beats not submitted
      if (!aTime && bTime) return 1
      return 0
    })

    // Assign ranks — only entries with identical values across ALL tiebreakers share a rank
    const rankMap = new Map<string, number>()
    for (let i = 0; i < sorted.length; i++) {
      if (i === 0) {
        rankMap.set(sorted[i].entry_id, 1)
        continue
      }
      const prev = sorted[i - 1]
      const curr = sorted[i]
      const isTied =
        curr.total_points === prev.total_points &&
        curr.exact_count === prev.exact_count &&
        curr.correct_count === prev.correct_count &&
        curr.bonus_points === prev.bonus_points &&
        submissionTimeMap.get(curr.entry_id) === submissionTimeMap.get(prev.entry_id)

      rankMap.set(curr.entry_id, isTied ? rankMap.get(prev.entry_id)! : i + 1)
    }

    // Write new totals + new current_rank. Skip entries whose stored values
    // already match — every skipped UPDATE is one less WAL row for realtime
    // to evaluate against every subscribed client, and one less pointless
    // client refresh.
    const changedTotals = entryTotals.filter(totals => {
      const cur = currentTotals?.get(totals.entry_id)
      if (!cur) return true
      const newRank = rankMap.get(totals.entry_id) ?? null
      return (
        cur.match_points !== totals.match_points ||
        cur.bonus_points !== totals.bonus_points ||
        cur.scored_total_points !== totals.total_points ||
        cur.current_rank !== newRank
      )
    })

    const batchSize = 50
    for (let i = 0; i < changedTotals.length; i += batchSize) {
      const batch = changedTotals.slice(i, i + batchSize)
      const updatePromises = batch.map(totals => {
        const newRank = rankMap.get(totals.entry_id) ?? null
        return adminClient
          .from('pool_entries')
          .update({
            match_points: totals.match_points,
            bonus_points: totals.bonus_points,
            scored_total_points: totals.total_points,
            current_rank: newRank,
            last_rank_update: new Date().toISOString(),
          })
          .eq('entry_id', totals.entry_id)
          .then(({ error }: { error: any }) => {
            if (error && !error.message?.includes('v2_')) {
              console.error(`[scoring] Failed to update entry totals for ${totals.entry_id}:`, error)
            }
          })
      })
      await Promise.all(updatePromises)
    }
  }

  return { matchScoresWritten, bonusScoresWritten }
}

// =============================================================
// B1 — change-only (diff) write path
// =============================================================
// Reached only when sync_settings.scoring_diff_writes_enabled is true.
// Produces a stored state with IDENTICAL MEANINGFUL VALUES to the legacy
// delete-all+insert-all path (parity-tested via
// lib/scoring/__tests__/diffWrite.test.ts) — metadata columns (id,
// calculated_at) may differ on unchanged rows, which is harmless and in fact
// more accurate (an unchanged row keeps the timestamp of when it was actually
// scored). Only the rows that changed are written.

// Module-level cache for the kill switch. A full sweep calls recalculatePool
// ~600× and re-reading sync_settings each time is 600 needless reads; cache for
// 15s so a flip still takes effect within a sweep or two. Failures are not
// cached (so a transient read error can't pin us off).
let _diffFlagCache: { value: boolean; at: number } | null = null
const DIFF_FLAG_TTL_MS = 15_000

/** Read the B1 kill switch (cached). Fails safe to FALSE → legacy path. */
async function isDiffWritesEnabled(adminClient: any): Promise<boolean> {
  const now = Date.now()
  if (_diffFlagCache && now - _diffFlagCache.at < DIFF_FLAG_TTL_MS) return _diffFlagCache.value
  try {
    const { data } = await adminClient
      .from('sync_settings')
      .select('setting_value')
      .eq('setting_key', 'scoring_diff_writes_enabled')
      .maybeSingle()
    const value = data?.setting_value === true || data?.setting_value === 'true'
    _diffFlagCache = { value, at: now }
    return value
  } catch {
    return false
  }
}

/** Sequential batches — bounds concurrency (calmer than unbounded Promise.all). */
async function inBatches<T>(items: T[], size: number, fn: (batch: T[]) => Promise<void>): Promise<void> {
  for (let i = 0; i < items.length; i += size) {
    await fn(items.slice(i, i + size))
  }
}

/**
 * Fetch existing rows for a set of entries, chunking the entry_id list
 * (URL-length safety) AND paginating each chunk past PostgREST's 1000-row
 * cap. Throws on any read error — a partial read would corrupt the diff
 * (missing existing rows look "new" → duplicate-key, or compute wrong
 * deletes), so we'd rather skip this pool's update this run and let the
 * next sweep retry than write a corrupt state.
 */
async function fetchExistingForEntries(
  adminClient: any,
  table: string,
  selectCols: string,
  pkCol: string,
  entryIds: string[],
  extraFilter: ((q: any) => any) | null,
): Promise<any[]> {
  const out: any[] = []
  const entryChunk = 100
  for (let i = 0; i < entryIds.length; i += entryChunk) {
    const chunk = entryIds.slice(i, i + entryChunk)
    const pageSize = 1000
    let offset = 0
    for (;;) {
      let q = adminClient.from(table).select(selectCols).in('entry_id', chunk)
      if (extraFilter) q = extraFilter(q)
      q = q.order('entry_id', { ascending: true }).order(pkCol, { ascending: true }).range(offset, offset + pageSize - 1)
      const { data: page, error } = await q
      if (error) {
        console.error(`[scoring] diff: failed reading existing ${table} (offset ${offset}):`, error)
        throw error
      }
      if (!page || page.length === 0) break
      out.push(...page)
      if (page.length < pageSize) break
      offset += page.length
    }
  }
  return out
}

const MATCH_SCORE_COLS =
  'id, entry_id, match_id, pool_id, match_number, stage, score_type, base_points, multiplier, ' +
  'pso_points, total_points, teams_match, predicted_home_score, predicted_away_score, ' +
  'actual_home_score, actual_away_score, predicted_home_pso, predicted_away_pso, ' +
  'actual_home_pso, actual_away_pso, predicted_home_team_id, predicted_away_team_id'

/**
 * Diff-write match_scores. Scope mirrors the legacy delete EXACTLY:
 * pool_id = poolId, entry_id in entryIds, and match_id = onlyMatchId when set.
 * Upserts changed+new rows on the existing (entry_id, match_id) unique key;
 * deletes stored rows whose key is no longer computed (reset/removed matches).
 */
async function diffWriteMatchScores(
  adminClient: any,
  poolId: string,
  computed: MatchScoreRow[],
  entryIds: string[],
  onlyMatchId?: string,
): Promise<number> {
  if (entryIds.length === 0) return 0 // parity: legacy skips when no entries

  const existing = await fetchExistingForEntries(
    adminClient, 'match_scores', MATCH_SCORE_COLS, 'id', entryIds,
    (q: any) => { let f = q.eq('pool_id', poolId); if (onlyMatchId) f = f.eq('match_id', onlyMatchId); return f },
  )

  const d = diffRows<MatchScoreRow, any>(computed, existing, matchScoreKey, matchScoreValue, (r) => r.id)

  // Upsert changed+new first (rows stay present for concurrent readers), then
  // delete stale (disjoint key set). Throw on any error so writeScoresToDB falls
  // back to the idempotent legacy path rather than reporting a phantom success.
  const upserts = [...d.toInsert, ...d.toUpdate.map(u => u.row)]
  await inBatches(upserts, 500, async (batch) => {
    const { error } = await adminClient.from('match_scores').upsert(batch, { onConflict: 'entry_id,match_id' })
    if (error) { console.error('[scoring] diff: match_scores upsert failed:', error); throw error }
  })
  await inBatches(d.toDeleteIds, 100, async (ids) => {
    const { error } = await adminClient.from('match_scores').delete().in('id', ids)
    if (error) { console.error('[scoring] diff: match_scores stale-delete failed:', error); throw error }
  })
  return upserts.length
}

const BONUS_SCORE_COLS =
  'bonus_id, entry_id, bonus_type, bonus_category, related_group_letter, related_match_id, points_earned, description'

/**
 * Diff-write bonus_scores. Scope mirrors the legacy delete EXACTLY:
 * only entries that have computed bonus rows (affectedEntryIds). Changed+new
 * rows are upserted on the natural-key unique index (migration
 * 2026-06-29_bonus_scores_natural_key_unique.sql) — batched, symmetric with
 * match_scores, no per-row updates. Stale rows deleted by bonus_id. Throws on
 * any error → caller falls back to the legacy path (also covers the case where
 * the unique index has not been applied yet).
 */
async function diffWriteBonusScores(adminClient: any, computed: BonusScoreRow[]): Promise<number> {
  if (computed.length === 0) return 0 // parity: legacy only acts when bonusScores.length > 0

  const affectedEntryIds = [...new Set(computed.map(b => b.entry_id))]
  const existing = await fetchExistingForEntries(
    adminClient, 'bonus_scores', BONUS_SCORE_COLS, 'bonus_id', affectedEntryIds, null,
  )

  const d = diffRows<BonusScoreRow, any>(computed, existing, bonusScoreKey, bonusScoreValue, (r) => r.bonus_id)

  const upserts = [...d.toInsert, ...d.toUpdate.map(u => u.row)]
  await inBatches(upserts, 500, async (batch) => {
    const { error } = await adminClient.from('bonus_scores').upsert(batch, {
      onConflict: 'entry_id,bonus_type,related_group_letter,related_match_id',
    })
    if (error) { console.error('[scoring] diff: bonus_scores upsert failed:', error); throw error }
  })
  await inBatches(d.toDeleteIds, 100, async (ids) => {
    const { error } = await adminClient.from('bonus_scores').delete().in('bonus_id', ids)
    if (error) { console.error('[scoring] diff: bonus_scores stale-delete failed:', error); throw error }
  })
  return upserts.length
}

// =============================================================
// Legacy write path (delete-all + insert-all)
// =============================================================
// The original, proven path. Used directly when the flag is OFF, and as the
// idempotent fallback when the diff path throws. Behaviour is verbatim from the
// pre-B1 code, so flag-off == exactly today's production behaviour.
async function legacyWriteScores(
  adminClient: any,
  poolId: string,
  matchScores: MatchScoreRow[],
  bonusScores: BonusScoreRow[],
  allEntryIds: string[],
  onlyMatchId?: string,
): Promise<{ matchScoresWritten: number; bonusScoresWritten: number }> {
  let matchScoresWritten = 0
  let bonusScoresWritten = 0

  // Write match_scores — delete existing for all entries then bulk insert.
  if (allEntryIds.length > 0) {
    const deleteMatchBatchSize = 100
    const deleteMatchBatches: string[][] = []
    for (let i = 0; i < allEntryIds.length; i += deleteMatchBatchSize) {
      deleteMatchBatches.push(allEntryIds.slice(i, i + deleteMatchBatchSize))
    }
    await Promise.all(
      deleteMatchBatches.map(batch => {
        // T-0018 / D-014: scope delete by pool_id (prevents a cross-pool wipe).
        let del = adminClient.from('match_scores').delete().eq('pool_id', poolId).in('entry_id', batch)
        if (onlyMatchId) del = del.eq('match_id', onlyMatchId)
        return del.then(({ error }: { error: any }) => { if (error) console.error(`[scoring] Failed to delete match_scores batch:`, error) })
      })
    )
  }
  if (matchScores.length > 0) {
    const batchSize = 500
    const matchBatches: MatchScoreRow[][] = []
    for (let i = 0; i < matchScores.length; i += batchSize) matchBatches.push(matchScores.slice(i, i + batchSize))
    const matchResults = await Promise.all(
      matchBatches.map(batch =>
        adminClient.from('match_scores').insert(batch).then(({ error }: { error: any }) => {
          if (error) { console.error(`[scoring] Failed to insert match_scores batch:`, error); return 0 }
          return batch.length
        })
      )
    )
    matchScoresWritten = matchResults.reduce((sum, n) => sum + n, 0)
  }

  // Write bonus_scores — delete existing for affected entries then bulk insert.
  if (bonusScores.length > 0) {
    const affectedEntryIds = [...new Set(bonusScores.map(bs => bs.entry_id))]
    const deleteBatchSize = 100
    const deleteBatches: string[][] = []
    for (let i = 0; i < affectedEntryIds.length; i += deleteBatchSize) deleteBatches.push(affectedEntryIds.slice(i, i + deleteBatchSize))
    await Promise.all(
      deleteBatches.map(batch =>
        adminClient.from('bonus_scores').delete().in('entry_id', batch)
          .then(({ error }: { error: any }) => { if (error) console.error(`[scoring] Failed to delete bonus_scores batch:`, error) })
      )
    )
    const insertBatchSize = 500
    const insertBatches: BonusScoreRow[][] = []
    for (let i = 0; i < bonusScores.length; i += insertBatchSize) insertBatches.push(bonusScores.slice(i, i + insertBatchSize))
    const bonusResults = await Promise.all(
      insertBatches.map(batch =>
        adminClient.from('bonus_scores').insert(batch).then(({ error }: { error: any }) => {
          if (error) { console.error(`[scoring] Failed to insert bonus_scores batch:`, error); return 0 }
          return batch.length
        })
      )
    )
    bonusScoresWritten = bonusResults.reduce((sum, n) => sum + n, 0)
  }

  return { matchScoresWritten, bonusScoresWritten }
}
