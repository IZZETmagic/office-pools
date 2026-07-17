// ============================================================================
// Shared entry-analytics computation — SINGLE SOURCE OF TRUTH.
//
// Mirrors the per-entry analytics block in
// app/api/pools/[pool_id]/leaderboard/route.ts EXACTLY, using the identical
// helper functions, so the values this produces match what the leaderboard
// shows today. Used by:
//   - scripts/backfill-entry-analytics-oneoff.ts  (one-time populate)
//   - app/api/cron/analytics-sweep/route.ts        (ongoing background refresh)
//   - (later) the leaderboard read path             (read these columns)
// Because all three call THIS function, they cannot drift.
//
// Note: the crowd computation is hoisted OUT of the per-entry loop (the
// leaderboard route currently calls it per-entry, which is redundant — it's
// pool-wide). Same result, computed once per pool.
//
// STATUS: DRAFT. Not imported by any live code path yet. Zero runtime impact
// until explicitly wired in (cron registration + read-path flip), both of
// which are separate, gated, calm-window steps.
// ============================================================================
import { createAdminClient } from '@/lib/supabase/server'
import {
  matchScoresToPredictionResults,
  computeStreaks,
  computeCrowdPredictions,
} from '@/app/pools/[pool_id]/analytics/analyticsHelpers'
import { computeFullXPBreakdown } from '@/app/pools/[pool_id]/analytics/xpSystem'
import { getScoringSource, readEntryScoring, readMatchScores } from '@/lib/scoring/readSource'

export type EntryAnalyticsRow = {
  entry_id: string
  total_xp: number
  current_level: number
  last_five: ('exact' | 'winner_gd' | 'winner' | 'miss' | 'no_pick')[]
  current_streak: { type: 'hot' | 'cold' | 'none'; length: number }
  hit_rate: number
  total_completed: number
  exact_count: number
  contrarian_wins: number
  crowd_agreement_pct: number
  analytics_updated_at: string
}

type Admin = ReturnType<typeof createAdminClient>

/**
 * Compute the analytics row for every submitted-with-predictions entry in a
 * pool. Pure read + compute — does NOT write. Returns one row per entry that
 * has predictions (entries with none are skipped, matching the leaderboard).
 */
export async function computePoolEntryAnalytics(
  admin: Admin,
  poolId: string,
): Promise<EntryAnalyticsRow[]> {
  const { data: poolRow } = await admin
    .from('pools')
    .select('tournament_id, prediction_mode')
    .eq('pool_id', poolId)
    .single()
  if (!poolRow) return []
  const source = await getScoringSource(admin, poolId, (poolRow as { prediction_mode: string }).prediction_mode)

  const [{ data: matches }, { data: poolMembers }] = await Promise.all([
    admin
      .from('matches')
      .select(
        '*, home_team:teams!matches_home_team_id_fkey(country_name, country_code, flag_url), away_team:teams!matches_away_team_id_fkey(country_name, country_code, flag_url)',
      )
      .eq('tournament_id', (poolRow as any).tournament_id)
      .order('match_number', { ascending: true }),
    admin
      .from('pool_members')
      .select('member_id, user_id, role, users(user_id, username, full_name)')
      .eq('pool_id', poolId),
  ])
  if (!matches || !poolMembers) return []

  const memberIds = poolMembers.map((m: any) => m.member_id)
  if (memberIds.length === 0) return []

  const { data: entries } = await admin
    .from('pool_entries')
    .select('entry_id, member_id, entry_name, entry_number, has_submitted_predictions, point_adjustment, current_rank, match_points, bonus_points, scored_total_points')
    .in('member_id', memberIds)
  if (!entries || entries.length === 0) return []

  const entryIds = entries.map((e: any) => e.entry_id)
  const scoringMap = await readEntryScoring(admin, entryIds, source)

  // All predictions, paginated with the SAME stable order as the route.
  const allPredictions: any[] = []
  {
    let off = 0
    let more = true
    while (more) {
      const { data: page } = await admin
        .from('predictions')
        .select('prediction_id, entry_id, match_id, predicted_home_score, predicted_away_score, predicted_home_pso, predicted_away_pso, predicted_winner_team_id')
        .in('entry_id', entryIds)
        .order('entry_id', { ascending: true })
        .order('match_id', { ascending: true })
        .range(off, off + 999)
      if (!page || page.length === 0) more = false
      else {
        allPredictions.push(...page)
        off += page.length
        if (page.length < 1000) more = false
      }
    }
  }

  // match_scores per entry, via the read source.
  const matchScoresByEntry = new Map<string, any[]>()
  for (const ms of await readMatchScores(admin, entryIds, source)) {
    const a = matchScoresByEntry.get(ms.entry_id) || []
    a.push(ms)
    matchScoresByEntry.set(ms.entry_id, a)
  }

  const normalizedMatches = matches.map((m: any) => ({
    ...m,
    home_team: Array.isArray(m.home_team) ? m.home_team[0] ?? null : m.home_team,
    away_team: Array.isArray(m.away_team) ? m.away_team[0] ?? null : m.away_team,
  }))

  const predsByEntry = new Map<string, any[]>()
  for (const p of allPredictions) {
    const a = predsByEntry.get(p.entry_id) || []
    a.push(p)
    predsByEntry.set(p.entry_id, a)
  }

  const membersWithEntries: any[] = poolMembers.map((m: any) => ({
    member_id: m.member_id,
    pool_id: poolId,
    user_id: m.user_id,
    role: m.role,
    joined_at: '',
    entry_fee_paid: false,
    users: m.users ?? { user_id: m.user_id, username: '', full_name: '', email: '' },
    entries: entries
      .filter((e: any) => e.member_id === m.member_id)
      .map((e: any) => ({
        entry_id: e.entry_id,
        member_id: e.member_id,
        entry_name: e.entry_name,
        entry_number: e.entry_number,
        has_submitted_predictions: e.has_submitted_predictions,
        total_points: scoringMap.get(e.entry_id)?.scored_total_points ?? 0,
        point_adjustment: scoringMap.get(e.entry_id)?.point_adjustment ?? 0,
        current_rank: scoringMap.get(e.entry_id)?.current_rank ?? null,
        match_points: scoringMap.get(e.entry_id)?.match_points ?? 0,
        bonus_points: scoringMap.get(e.entry_id)?.bonus_points ?? 0,
        scored_total_points: scoringMap.get(e.entry_id)?.scored_total_points ?? 0,
      })),
  }))

  const allPredsTyped: any[] = allPredictions.map((p: any) => ({
    prediction_id: p.prediction_id || '',
    entry_id: p.entry_id,
    match_id: p.match_id,
    predicted_home_score: p.predicted_home_score,
    predicted_away_score: p.predicted_away_score,
    predicted_home_pso: p.predicted_home_pso ?? null,
    predicted_away_pso: p.predicted_away_pso ?? null,
    predicted_winner_team_id: p.predicted_winner_team_id ?? null,
  }))

  const now = new Date().toISOString()
  const rows: EntryAnalyticsRow[] = []

  for (const entry of entries as any[]) {
    const entryPreds = (predsByEntry.get(entry.entry_id) || []).map((p: any) => ({
      prediction_id: p.prediction_id || '',
      entry_id: p.entry_id,
      match_id: p.match_id,
      predicted_home_score: p.predicted_home_score,
      predicted_away_score: p.predicted_away_score,
      predicted_home_pso: p.predicted_home_pso ?? null,
      predicted_away_pso: p.predicted_away_pso ?? null,
      predicted_winner_team_id: p.predicted_winner_team_id ?? null,
    }))
    if (entryPreds.length === 0) continue

    const predResults = matchScoresToPredictionResults(matchScoresByEntry.get(entry.entry_id) || [])
    const streaks = computeStreaks(predResults)
    const crowdData = computeCrowdPredictions(
      normalizedMatches as any,
      allPredsTyped,
      entryPreds as any,
      membersWithEntries,
    )
    const xp = computeFullXPBreakdown({
      predictionResults: predResults,
      matches: normalizedMatches as any,
      crowdData,
      streaks,
      entryPredictions: entryPreds as any,
      entryRank: scoringMap.get(entry.entry_id)?.current_rank ?? null,
      totalMatches: normalizedMatches.length,
    })

    const lastFive = predResults.slice(-5).map((r: any) => r.type) as EntryAnalyticsRow['last_five']
    while (lastFive.length < 5) lastFive.unshift('no_pick')

    const totalCompleted = predResults.length
    const nonMiss = predResults.filter((r: any) => r.type !== 'miss').length
    const crowdTotal = crowdData.filter((c: any) => c.userPredictedResult !== null).length
    const agreements = crowdData.filter((c: any) => !c.userIsContrarian && c.userPredictedResult !== null).length

    rows.push({
      entry_id: entry.entry_id,
      total_xp: xp.totalXP,
      current_level: xp.currentLevel.level,
      last_five: lastFive,
      current_streak: streaks.currentStreak,
      hit_rate: totalCompleted > 0 ? Math.round((nonMiss / totalCompleted) * 10000) / 100 : 0,
      total_completed: totalCompleted,
      exact_count: predResults.filter((r: any) => r.type === 'exact').length,
      contrarian_wins: crowdData.filter((c: any) => c.userIsContrarian && c.userWasCorrect).length,
      crowd_agreement_pct: crowdTotal > 0 ? Math.round((agreements / crowdTotal) * 10000) / 100 : 0,
      analytics_updated_at: now,
    })
  }

  return rows
}

/**
 * Compute + write the analytics columns for a pool. Upserts into
 * entry_xp_state (onConflict entry_id). Returns the number of rows written.
 */
export async function writePoolEntryAnalytics(admin: Admin, poolId: string): Promise<number> {
  const rows = await computePoolEntryAnalytics(admin, poolId)
  let written = 0
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100)
    const { error } = await admin.from('entry_xp_state').upsert(batch, { onConflict: 'entry_id' })
    if (error) console.error(`[entryAnalytics] upsert error pool ${poolId}:`, error.message)
    else written += batch.length
  }
  return written
}
