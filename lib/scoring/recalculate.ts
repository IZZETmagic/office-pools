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
      .select('entry_id, member_id, has_submitted_predictions, point_adjustment')
      .in('member_id', memberIds)

    if (!entries) {
      return { success: false, poolId, predictionMode: pool.prediction_mode, entriesProcessed: 0, matchScoresWritten: 0, bonusScoresWritten: 0, error: 'Failed to fetch entries' }
    }

    const submittedEntries = entries.filter((e: any) => e.has_submitted_predictions)

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
        const { data: page } = await adminClient
          .from('predictions')
          .select('entry_id, match_id, predicted_home_score, predicted_away_score, predicted_home_pso, predicted_away_pso, predicted_winner_team_id')
          .in('entry_id', entryIds)
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
      }
    }

    // 5. Write results to database (shadow-write for Phase 1)
    const writeResult = await writeScoresToDB(adminClient, poolId, result)

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

  const [
    { data: allGroupRankings },
    { data: allThirdPlaceRankings },
    { data: allKnockoutPicks },
  ] = await Promise.all([
    adminClient
      .from('bracket_picker_group_rankings')
      .select('*')
      .in('entry_id', entryIds),
    adminClient
      .from('bracket_picker_third_place_rankings')
      .select('*')
      .in('entry_id', entryIds),
    adminClient
      .from('bracket_picker_knockout_picks')
      .select('*')
      .in('entry_id', entryIds),
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

  const input: BracketPickerInput = {
    poolId,
    tournamentId,
    settings,
    matches,
    teams,
    conductData: conduct,
    entries: bpEntries,
  }

  return calculateBracketPicker(input)
}

// ----- Database write (Phase 1: shadow-write) -----

async function writeScoresToDB(
  adminClient: any,
  poolId: string,
  result: ScoringResult,
): Promise<{ matchScoresWritten: number; bonusScoresWritten: number }> {
  const { matchScores, bonusScores, entryTotals } = result

  let matchScoresWritten = 0
  let bonusScoresWritten = 0

  // Write match_scores — delete existing for all entries then bulk insert
  // (mirrors bonus_scores pattern to ensure stale rows from reset/scheduled matches are removed)
  const allEntryIds = [...new Set(entryTotals.map(t => t.entry_id))]

  if (allEntryIds.length > 0) {
    // Delete all existing match_scores for pool entries in parallel batches
    const deleteMatchBatchSize = 100
    const deleteMatchBatches: string[][] = []
    for (let i = 0; i < allEntryIds.length; i += deleteMatchBatchSize) {
      deleteMatchBatches.push(allEntryIds.slice(i, i + deleteMatchBatchSize))
    }
    await Promise.all(
      deleteMatchBatches.map(batch =>
        adminClient.from('match_scores').delete().in('entry_id', batch)
          .then(({ error }: { error: any }) => { if (error) console.error(`[scoring] Failed to delete match_scores batch:`, error) })
      )
    )
  }

  if (matchScores.length > 0) {
    // Insert fresh match_scores in parallel batches
    const batchSize = 500
    const matchBatches: MatchScoreRow[][] = []
    for (let i = 0; i < matchScores.length; i += batchSize) {
      matchBatches.push(matchScores.slice(i, i + batchSize))
    }
    const matchResults = await Promise.all(
      matchBatches.map(batch =>
        adminClient
          .from('match_scores')
          .insert(batch)
          .then(({ error }: { error: any }) => {
            if (error) { console.error(`[scoring] Failed to insert match_scores batch:`, error); return 0 }
            return batch.length
          })
      )
    )
    matchScoresWritten = matchResults.reduce((sum, n) => sum + n, 0)
  }

  // Write bonus_scores — delete existing then bulk insert (in parallel batches)
  if (bonusScores.length > 0) {
    const affectedEntryIds = [...new Set(bonusScores.map(bs => bs.entry_id))]

    // Delete all existing bonus_scores for affected entries in parallel
    const deleteBatchSize = 100
    const deleteBatches: string[][] = []
    for (let i = 0; i < affectedEntryIds.length; i += deleteBatchSize) {
      deleteBatches.push(affectedEntryIds.slice(i, i + deleteBatchSize))
    }
    await Promise.all(
      deleteBatches.map(batch =>
        adminClient.from('bonus_scores').delete().in('entry_id', batch)
          .then(({ error }: { error: any }) => { if (error) console.error(`[scoring] Failed to delete bonus_scores batch:`, error) })
      )
    )

    // Insert new bonus_scores in parallel batches
    const insertBatchSize = 500
    const insertBatches: BonusScoreRow[][] = []
    for (let i = 0; i < bonusScores.length; i += insertBatchSize) {
      insertBatches.push(bonusScores.slice(i, i + insertBatchSize))
    }
    const bonusResults = await Promise.all(
      insertBatches.map(batch =>
        adminClient.from('bonus_scores').insert(batch)
          .then(({ error }: { error: any }) => {
            if (error) { console.error(`[scoring] Failed to insert bonus_scores batch:`, error); return 0 }
            return batch.length
          })
      )
    )
    bonusScoresWritten = bonusResults.reduce((sum, n) => sum + n, 0)
  }

  // Update entry totals on pool_entries — batch in groups of 50 using Promise.all
  if (entryTotals.length > 0) {
    const batchSize = 50
    for (let i = 0; i < entryTotals.length; i += batchSize) {
      const batch = entryTotals.slice(i, i + batchSize)
      const updatePromises = batch.map(totals =>
        adminClient
          .from('pool_entries')
          .update({
            match_points: totals.match_points,
            bonus_points: totals.bonus_points,
            scored_total_points: totals.total_points,
          })
          .eq('entry_id', totals.entry_id)
          .then(({ error }: { error: any }) => {
            if (error && !error.message?.includes('v2_')) {
              console.error(`[scoring] Failed to update entry totals for ${totals.entry_id}:`, error)
            }
          })
      )
      await Promise.all(updatePromises)
    }
  }

  return { matchScoresWritten, bonusScoresWritten }
}
