// =============================================================
// SHADOW SCORING — RESOLVED BRACKET MATERIALIZER  [knockout phase]
// =============================================================
// Persists each full_tournament entry's PREDICTED knockout bracket
// (the output of the tested lib/bracketResolver.resolvePredictedBracket)
// into shadow_resolved_brackets, so the DB-native knockout shadow
// scoring can LEFT JOIN it for teams_match instead of re-resolving
// the bracket graph in SQL (Option A — keep the graph logic in TS).
//
// The predicted bracket is prediction-derived and STABLE once an
// entry's predictions lock + the group stage's conduct is final, so
// this runs COLD: a one-shot batch (backfillResolvedBrackets) plus a
// best-effort piggyback on recalc. It never runs on the live per-goal
// scoring path.
// =============================================================

import { resolvePredictedBracket, resolveActualBracket, buildActualResultsMap, type BracketResult } from '@/lib/bracketResolver'
import { getKnockoutWinner } from '@/lib/tournament'
import { buildPredictionMap, toTeams } from './helpers'
import type { MatchWithResult, TeamData, ConductData, EntryWithPredictions } from './types'

export type ResolvedBracketRow = {
  entry_id: string
  match_id: string
  pool_id: string
  predicted_home_team_id: string | null
  predicted_away_team_id: string | null
}

/**
 * PURE. Resolve one entry's predicted bracket and flatten it to one row per
 * KNOCKOUT match slot — mirrors how full.ts consumes knockoutTeamMap. A slot
 * with an unresolved side yields NULL team ids (→ teams_match = false later,
 * matching checkKnockoutTeamsMatch).
 */
export function resolveEntryBracketRows(
  poolId: string,
  entry: EntryWithPredictions,
  matches: MatchWithResult[],
  teams: TeamData[],
  conduct: ConductData[],
): ResolvedBracketRow[] {
  const predictionMap = buildPredictionMap(entry.predictions)
  // Predicted bracket — no conduct, mirroring full.ts so the shadow match
  // engine stays parity-identical to production scoring. (`conduct` param is
  // retained on the signature for the bonus/actual arms below.)
  const { knockoutTeamMap } = resolvePredictedBracket({
    matches: matches as any,
    predictionMap,
    teams: toTeams(teams),
  })

  const rows: ResolvedBracketRow[] = []
  for (const m of matches) {
    if (m.stage === 'group') continue
    const resolved = knockoutTeamMap.get(m.match_number)
    if (!resolved) continue
    rows.push({
      entry_id: entry.entry_id,
      match_id: m.match_id,
      pool_id: poolId,
      predicted_home_team_id: resolved.home?.team_id ?? null,
      predicted_away_team_id: resolved.away?.team_id ?? null,
    })
  }
  return rows
}

/**
 * Write brackets for ONE pool as a full refresh: purge every row for the pool
 * (this IS the 'unscoring' gate — entries that dropped out of resolution simply
 * aren't in `rows`), then insert the current eligible rows. Bounded per pool
 * (≈ submitted entries × 32 knockout slots).
 */
export async function writeResolvedBracketsForPool(
  adminClient: any,
  poolId: string,
  rows: ResolvedBracketRow[],
): Promise<number> {
  const { error: delErr } = await adminClient
    .from('shadow_resolved_brackets')
    .delete()
    .eq('pool_id', poolId)
  if (delErr) throw new Error(`shadow_resolved_brackets purge failed (pool ${poolId}): ${delErr.message}`)

  let written = 0
  for (let i = 0; i < rows.length; i += 1000) {
    const batch = rows.slice(i, i + 1000)
    const { error } = await adminClient.from('shadow_resolved_brackets').insert(batch)
    if (error) throw new Error(`shadow_resolved_brackets insert failed (pool ${poolId}): ${error.message}`)
    written += batch.length
  }
  return written
}

/**
 * PIGGYBACK. Called fire-and-forget from recalculatePool (full_tournament only,
 * env-gated in the caller). Reuses the pool's already-loaded submitted entries;
 * adds only the resolve + write. Must never be awaited on the scoring path.
 */
export async function syncShadowResolvedBracketsPiggyback(
  adminClient: any,
  poolId: string,
  matches: MatchWithResult[],
  teams: TeamData[],
  conduct: ConductData[],
  entries: EntryWithPredictions[],
): Promise<void> {
  const eligible = entries.filter((e) => e.predictions.length > 0)
  const rows = eligible.flatMap((e) => resolveEntryBracketRows(poolId, e, matches, teams, conduct))
  await writeResolvedBracketsForPool(adminClient, poolId, rows)
}

export type BackfillSummary = { pools: number; entries: number; rowsWritten: number; errors: string[] }

/**
 * BATCH. One-shot populate of shadow_resolved_brackets for every submitted
 * full_tournament entry in a tournament (optionally scoped to poolIds so it can
 * be run in chunks if a single invocation would time out). Trigger it once the
 * group stage completes — predicted brackets are final from then on.
 */
export async function backfillResolvedBrackets(
  adminClient: any,
  tournamentId: string,
  opts?: { poolIds?: string[] },
): Promise<BackfillSummary> {
  const summary: BackfillSummary = { pools: 0, entries: 0, rowsWritten: 0, errors: [] }

  // Tournament-wide inputs (small): match structure + teams + conduct.
  const { data: matches } = await adminClient
    .from('matches')
    .select('match_id, match_number, stage, group_letter, home_team_id, away_team_id, home_team_placeholder, away_team_placeholder')
    .eq('tournament_id', tournamentId)
    .order('match_number', { ascending: true })
  const { data: teams } = await adminClient
    .from('teams')
    .select('team_id, country_name, country_code, group_letter, fifa_ranking_points, flag_url')
    .eq('tournament_id', tournamentId)
  const { data: conduct } = await adminClient
    .from('match_conduct')
    .select('match_id, team_id, yellow_cards, indirect_red_cards, direct_red_cards, yellow_direct_red_cards')
  if (!matches || !teams) {
    summary.errors.push('failed to load matches/teams')
    return summary
  }

  // Target pools: full_tournament only (progressive / bracket_picker handled separately).
  let poolsQuery = adminClient
    .from('pools')
    .select('pool_id')
    .eq('tournament_id', tournamentId)
    .eq('prediction_mode', 'full_tournament')
  if (opts?.poolIds && opts.poolIds.length > 0) poolsQuery = poolsQuery.in('pool_id', opts.poolIds)
  const { data: pools } = await poolsQuery
  if (!pools) {
    summary.errors.push('failed to load pools')
    return summary
  }

  for (const pool of pools) {
    try {
      const { data: members } = await adminClient
        .from('pool_members').select('member_id').eq('pool_id', pool.pool_id)
      const memberIds = (members ?? []).map((m: any) => m.member_id)
      if (memberIds.length === 0) {
        await writeResolvedBracketsForPool(adminClient, pool.pool_id, [])
        summary.pools++
        continue
      }

      const { data: entryRows } = await adminClient
        .from('pool_entries')
        .select('entry_id, member_id')
        .in('member_id', memberIds)
        .eq('has_submitted_predictions', true)
      const entries = entryRows ?? []
      if (entries.length === 0) {
        await writeResolvedBracketsForPool(adminClient, pool.pool_id, [])
        summary.pools++
        continue
      }

      // Predictions for these entries — paginate past PostgREST's 1000-row cap,
      // stable order so page seams are deterministic (mirrors recalculate.ts).
      const entryIds = entries.map((e: any) => e.entry_id)
      const predsByEntry = new Map<string, any[]>()
      const pageSize = 1000
      let offset = 0
      let hasMore = true
      while (hasMore) {
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
            const list = predsByEntry.get(p.entry_id) ?? []
            list.push(p)
            predsByEntry.set(p.entry_id, list)
          }
          offset += page.length
          if (page.length < pageSize) hasMore = false
        }
      }

      const entriesWithPredictions: EntryWithPredictions[] = entries.map((e: any) => ({
        entry_id: e.entry_id,
        member_id: e.member_id,
        point_adjustment: 0,
        predictions: (predsByEntry.get(e.entry_id) ?? []).map((p: any) => ({
          match_id: p.match_id,
          predicted_home_score: p.predicted_home_score,
          predicted_away_score: p.predicted_away_score,
          predicted_home_pso: p.predicted_home_pso ?? null,
          predicted_away_pso: p.predicted_away_pso ?? null,
          predicted_winner_team_id: p.predicted_winner_team_id ?? null,
        })),
      }))

      const eligible = entriesWithPredictions.filter((e) => e.predictions.length > 0)
      const rows = eligible.flatMap((e) =>
        resolveEntryBracketRows(
          pool.pool_id, e,
          matches as MatchWithResult[], teams as TeamData[], (conduct ?? []) as ConductData[],
        ),
      )
      const written = await writeResolvedBracketsForPool(adminClient, pool.pool_id, rows)
      summary.pools++
      summary.entries += eligible.length
      summary.rowsWritten += written
    } catch (e: any) {
      summary.errors.push(`pool ${pool.pool_id}: ${e?.message ?? String(e)}`)
    }
  }

  return summary
}

// =============================================================
// BONUS INPUT MATERIALIZATION  [bonus phase]
// =============================================================
// Materializes the inputs the set-based shadow_calculate_bonuses RPC joins on,
// mirroring lib/bonusCalculation.calculateAllBonusPoints EXACTLY:
//   - PREDICTED bracket resolved WITHOUT conductData (bonusCalculation omits it,
//     unlike full.ts) — parity-critical.
//   - ACTUAL bracket resolved WITH conductData.
//   - Podium + match-winner use the mode-aware "effective" knockout map:
//     progressive -> ACTUAL knockout teams (effectivePredictedBracket), full -> predicted.
// Covers BOTH full_tournament and progressive (unlike the match-engine backfill).
// predicted_winner_team_id is written via shadow_upsert_predicted_winners so the
// match engine's validated predicted_home/away is never overwritten.
// =============================================================

export type BonusMaterialization = {
  standings: Array<{ entry_id: string; group_letter: string; position: number; team_id: string }>
  qualified: Array<{ entry_id: string; team_id: string }>
  podium: { entry_id: string; champion_team_id: string | null; runner_up_team_id: string | null; third_place_team_id: string | null }
  brackets: Array<{ entry_id: string; match_id: string; pool_id: string; predicted_home_team_id: string | null; predicted_away_team_id: string | null; predicted_winner_team_id: string | null }>
  // Arm C source: WITHOUT-conduct predictedBracket pairs (both modes). Distinct from
  // brackets (which uses the effective/actual knockout map for the winner).
  pairs: Array<{ entry_id: string; match_id: string; pred_home_team_id: string | null; pred_away_team_id: string | null }>
}

/** PURE. One entry's bonus materialization rows — mirrors bonusCalculation's bracket inputs. */
export function resolveEntryBonusRows(
  poolId: string,
  mode: 'full_tournament' | 'progressive',
  entry: EntryWithPredictions,
  matches: MatchWithResult[],
  teams: TeamData[],
  actualBracket: BracketResult,
): BonusMaterialization {
  const predictionMap = buildPredictionMap(entry.predictions)
  // PREDICTED bracket — prediction-only (no conduct). Now that full.ts also
  // resolves predictions without conduct, the two arms agree by construction.
  const predictedBracket = resolvePredictedBracket({ matches: matches as any, predictionMap, teams: toTeams(teams) })
  // effectivePredictedBracket knockout map: progressive uses ACTUAL teams
  const effKnockout = mode === 'progressive' ? actualBracket.knockoutTeamMap : predictedBracket.knockoutTeamMap

  const standings: BonusMaterialization['standings'] = []
  for (const [group_letter, arr] of predictedBracket.allGroupStandings) {
    arr.forEach((st, idx) => standings.push({ entry_id: entry.entry_id, group_letter, position: idx + 1, team_id: st.team_id }))
  }

  const qualified = [...predictedBracket.qualifiedTeamIds].map((team_id) => ({ entry_id: entry.entry_id, team_id }))

  const brackets: BonusMaterialization['brackets'] = []
  const pairs: BonusMaterialization['pairs'] = []
  for (const m of matches) {
    if (m.stage === 'group') continue
    // Arm C: WITHOUT-conduct predictedBracket pairs (BOTH modes) — mirrors bonusCalculation
    const pslot = predictedBracket.knockoutTeamMap.get(m.match_number)
    pairs.push({
      entry_id: entry.entry_id,
      match_id: m.match_id,
      pred_home_team_id: pslot?.home?.team_id ?? null,
      pred_away_team_id: pslot?.away?.team_id ?? null,
    })
    // Arm D: effective knockout map (progressive = actual teams) + entry scoreline → winner
    const slot = effKnockout.get(m.match_number)
    if (!slot) continue
    const home = slot.home ?? null
    const away = slot.away ?? null
    const winner = home && away ? getKnockoutWinner(m.match_id, predictionMap, home, away) : null
    brackets.push({
      entry_id: entry.entry_id,
      match_id: m.match_id,
      pool_id: poolId,
      predicted_home_team_id: home?.team_id ?? null,
      predicted_away_team_id: away?.team_id ?? null,
      predicted_winner_team_id: winner?.team_id ?? null,
    })
  }

  // Podium — bracket-derived, with progressive fallback (mirrors calculateTournamentPodiumBonuses)
  let champ = predictedBracket.champion
  let runner = predictedBracket.runnerUp
  let third = predictedBracket.thirdPlace
  if (!champ || !runner) {
    const finalM = matches.find((mm) => mm.stage === 'final')
    const ft = finalM ? effKnockout.get(finalM.match_number) : null
    if (finalM && ft?.home && ft?.away) {
      const w = getKnockoutWinner(finalM.match_id, predictionMap, ft.home, ft.away)
      const l = w?.team_id === ft.home.team_id ? ft.away : ft.home
      if (w) champ = w
      if (l) runner = l
    }
  }
  if (!third) {
    const tpM = matches.find((mm) => mm.stage === 'third_place')
    const tt = tpM ? effKnockout.get(tpM.match_number) : null
    if (tpM && tt?.home && tt?.away) {
      const w = getKnockoutWinner(tpM.match_id, predictionMap, tt.home, tt.away)
      if (w) third = w
    }
  }
  const podium = {
    entry_id: entry.entry_id,
    champion_team_id: champ?.team_id ?? null,
    runner_up_team_id: runner?.team_id ?? null,
    third_place_team_id: third?.team_id ?? null,
  }

  return { standings, qualified, podium, brackets, pairs }
}

/** Compute + write the ACTUAL standings/qualified snapshot (WITH conduct). Returns the actual bracket. */
export async function writeActualSnapshot(
  adminClient: any,
  tournamentId: string,
  matches: MatchWithResult[],
  teams: TeamData[],
  conduct: ConductData[],
): Promise<BracketResult> {
  const actualResultsMap = buildActualResultsMap(matches as any)
  const actualBracket = resolveActualBracket({
    matches: matches as any, predictionMap: actualResultsMap, teams: toTeams(teams), conductData: conduct as any,
  })

  const standingsRows: any[] = []
  for (const [group_letter, arr] of actualBracket.allGroupStandings) {
    arr.forEach((st, idx) => standingsRows.push({ tournament_id: tournamentId, group_letter, position: idx + 1, team_id: st.team_id }))
  }
  const qualifiedRows = [...actualBracket.qualifiedTeamIds].map((team_id) => ({ tournament_id: tournamentId, team_id }))

  await adminClient.from('shadow_actual_standings').delete().eq('tournament_id', tournamentId)
  if (standingsRows.length) {
    const { error } = await adminClient.from('shadow_actual_standings').insert(standingsRows)
    if (error) throw new Error(`shadow_actual_standings insert failed: ${error.message}`)
  }
  await adminClient.from('shadow_actual_qualified').delete().eq('tournament_id', tournamentId)
  if (qualifiedRows.length) {
    const { error } = await adminClient.from('shadow_actual_qualified').insert(qualifiedRows)
    if (error) throw new Error(`shadow_actual_qualified insert failed: ${error.message}`)
  }
  return actualBracket
}

/** Write one pool's bonus materialization: full-refresh standings/qualified, upsert podium + predicted winners. */
async function writeEntryBonusMaterialization(
  adminClient: any,
  eligibleIds: string[],
  mats: BonusMaterialization[],
): Promise<void> {
  if (eligibleIds.length === 0) return
  const allStandings = mats.flatMap((m) => m.standings)
  const allQualified = mats.flatMap((m) => m.qualified)
  const allPairs = mats.flatMap((m) => m.pairs)
  const allPodium = mats.map((m) => m.podium)
  const allBrackets = mats.flatMap((m) => m.brackets)

  // full refresh (by entry) for standings + qualified + pairs
  for (let i = 0; i < eligibleIds.length; i += 200) {
    const slice = eligibleIds.slice(i, i + 200)
    for (const t of ['shadow_resolved_standings', 'shadow_resolved_qualified', 'shadow_resolved_pairs']) {
      const { error } = await adminClient.from(t).delete().in('entry_id', slice)
      if (error) throw new Error(`${t} purge failed: ${error.message}`)
    }
  }
  const insertChunked = async (table: string, rows: any[]) => {
    for (let i = 0; i < rows.length; i += 1000) {
      const { error } = await adminClient.from(table).insert(rows.slice(i, i + 1000))
      if (error) throw new Error(`${table} insert failed: ${error.message}`)
    }
  }
  await insertChunked('shadow_resolved_standings', allStandings)
  await insertChunked('shadow_resolved_qualified', allQualified)
  await insertChunked('shadow_resolved_pairs', allPairs)

  for (let i = 0; i < allPodium.length; i += 1000) {
    const { error } = await adminClient.from('shadow_resolved_podium').upsert(allPodium.slice(i, i + 1000), { onConflict: 'entry_id' })
    if (error) throw new Error(`shadow_resolved_podium upsert failed: ${error.message}`)
  }

  // predicted_winner via helper RPC (updates ONLY the winner column on conflict)
  for (let i = 0; i < allBrackets.length; i += 1000) {
    const { error } = await adminClient.rpc('shadow_upsert_predicted_winners', { p_rows: allBrackets.slice(i, i + 1000) })
    if (error) throw new Error(`shadow_upsert_predicted_winners failed: ${error.message}`)
  }
}

export type BonusBackfillSummary = { pools: number; entries: number; standings: number; qualified: number; podium: number; brackets: number; errors: string[] }

/**
 * BATCH. Populate all bonus inputs for a tournament (both modes). Writes the ACTUAL
 * snapshot once, then per pool materializes each submitted entry's predicted rows.
 * PRECONDITION: run AFTER the match-engine bracket backfill (so full entries' rows
 * exist and only predicted_winner is updated, preserving WITH-conduct home/away).
 */
export async function backfillBonusInputs(
  adminClient: any,
  tournamentId: string,
  opts?: { poolIds?: string[] },
): Promise<BonusBackfillSummary> {
  const summary: BonusBackfillSummary = { pools: 0, entries: 0, standings: 0, qualified: 0, podium: 0, brackets: 0, errors: [] }

  const { data: matches } = await adminClient
    .from('matches')
    .select('match_id, match_number, stage, group_letter, home_team_id, away_team_id, home_team_placeholder, away_team_placeholder, is_completed, home_score_ft, away_score_ft, home_score_pso, away_score_pso, winner_team_id, tournament_id, match_date')
    .eq('tournament_id', tournamentId)
    .order('match_number', { ascending: true })
  const { data: teams } = await adminClient
    .from('teams')
    .select('team_id, country_name, country_code, group_letter, fifa_ranking_points, flag_url')
    .eq('tournament_id', tournamentId)
  const { data: conduct } = await adminClient
    .from('match_conduct')
    .select('match_id, team_id, yellow_cards, indirect_red_cards, direct_red_cards, yellow_direct_red_cards')
  if (!matches || !teams) {
    summary.errors.push('failed to load matches/teams')
    return summary
  }

  let actualBracket: BracketResult
  try {
    actualBracket = await writeActualSnapshot(adminClient, tournamentId, matches as MatchWithResult[], teams as TeamData[], (conduct ?? []) as ConductData[])
  } catch (e: any) {
    summary.errors.push(`actual snapshot: ${e?.message ?? String(e)}`)
    return summary
  }

  let poolsQuery = adminClient.from('pools').select('pool_id, prediction_mode')
    .eq('tournament_id', tournamentId).neq('prediction_mode', 'bracket_picker')
  if (opts?.poolIds && opts.poolIds.length > 0) poolsQuery = poolsQuery.in('pool_id', opts.poolIds)
  const { data: pools } = await poolsQuery
  if (!pools) {
    summary.errors.push('failed to load pools')
    return summary
  }

  for (const pool of pools) {
    try {
      const mode: 'full_tournament' | 'progressive' = pool.prediction_mode === 'progressive' ? 'progressive' : 'full_tournament'

      const { data: members } = await adminClient.from('pool_members').select('member_id').eq('pool_id', pool.pool_id)
      const memberIds = (members ?? []).map((m: any) => m.member_id)
      if (memberIds.length === 0) { summary.pools++; continue }

      const { data: submittedRows } = await adminClient
        .from('pool_entries').select('entry_id, member_id').in('member_id', memberIds).eq('has_submitted_predictions', true)
      let entries: any[] = submittedRows ?? []

      // progressive: also count round-submitters (mirrors recalculate.ts submitted gate)
      if (mode === 'progressive') {
        const { data: allRows } = await adminClient.from('pool_entries').select('entry_id, member_id').in('member_id', memberIds)
        const have = new Set(entries.map((e: any) => e.entry_id))
        const rest = (allRows ?? []).filter((e: any) => !have.has(e.entry_id))
        if (rest.length > 0) {
          const { data: ers } = await adminClient.from('entry_round_submissions')
            .select('entry_id').in('entry_id', rest.map((e: any) => e.entry_id)).eq('has_submitted', true)
          const roundIds = new Set((ers ?? []).map((r: any) => r.entry_id))
          entries = entries.concat(rest.filter((e: any) => roundIds.has(e.entry_id)))
        }
      }
      if (entries.length === 0) { summary.pools++; continue }

      const entryIds = entries.map((e: any) => e.entry_id)
      const predsByEntry = new Map<string, any[]>()
      let offset = 0, hasMore = true
      while (hasMore) {
        const { data: page } = await adminClient
          .from('predictions')
          .select('entry_id, match_id, predicted_home_score, predicted_away_score, predicted_home_pso, predicted_away_pso, predicted_winner_team_id')
          .in('entry_id', entryIds)
          .order('entry_id', { ascending: true }).order('match_id', { ascending: true })
          .range(offset, offset + 999)
        if (!page || page.length === 0) hasMore = false
        else {
          for (const p of page) { const l = predsByEntry.get(p.entry_id) ?? []; l.push(p); predsByEntry.set(p.entry_id, l) }
          offset += page.length
          if (page.length < 1000) hasMore = false
        }
      }

      const mats: BonusMaterialization[] = []
      const eligibleIds: string[] = []
      for (const e of entries) {
        const preds = predsByEntry.get(e.entry_id) ?? []
        if (preds.length === 0) continue
        eligibleIds.push(e.entry_id)
        mats.push(resolveEntryBonusRows(
          pool.pool_id, mode,
          {
            entry_id: e.entry_id, member_id: e.member_id, point_adjustment: 0,
            predictions: preds.map((p: any) => ({
              match_id: p.match_id,
              predicted_home_score: p.predicted_home_score,
              predicted_away_score: p.predicted_away_score,
              predicted_home_pso: p.predicted_home_pso ?? null,
              predicted_away_pso: p.predicted_away_pso ?? null,
              predicted_winner_team_id: p.predicted_winner_team_id ?? null,
            })),
          },
          matches as MatchWithResult[], teams as TeamData[], actualBracket,
        ))
      }

      await writeEntryBonusMaterialization(adminClient, eligibleIds, mats)
      summary.pools++
      summary.entries += eligibleIds.length
      summary.standings += mats.reduce((a, m) => a + m.standings.length, 0)
      summary.qualified += mats.reduce((a, m) => a + m.qualified.length, 0)
      summary.podium += mats.length
      summary.brackets += mats.reduce((a, m) => a + m.brackets.length, 0)
    } catch (e: any) {
      summary.errors.push(`pool ${pool.pool_id}: ${e?.message ?? String(e)}`)
    }
  }

  return summary
}
