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
import { resolveEntryPodiumPick } from '@/lib/podium'
import { fetchMatchConductForTournament } from '@/lib/matchConduct'
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
  // Scoped + paginated. Unfiltered this is silently truncated at 1,000 rows by
  // PostgREST, which in the live scoring engine means conduct-based tiebreaks
  // resolved against partial data — no error, just wrong brackets.
  const conduct = await fetchMatchConductForTournament(adminClient, tournamentId)
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

  // Podium — the SAME function the Node engine scores with. This was previously a
  // hand-copy of calculateTournamentPodiumBonuses' derivation and it drifted:
  // shadow reproduced the progressive cascade bug byte-for-byte, so the parity
  // checker (which compares the two engines' outputs) could not see it. Never
  // re-inline this.
  const { champion: champ, runnerUp: runner, thirdPlace: third } = resolveEntryPodiumPick({
    mode,
    matches,
    predictionMap,
    predictedBracket,
    actualKnockoutTeamMap: effKnockout,
  })
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
  // Scoped + paginated. Unfiltered this is silently truncated at 1,000 rows by
  // PostgREST, which in the live scoring engine means conduct-based tiebreaks
  // resolved against partial data — no error, just wrong brackets.
  const conduct = await fetchMatchConductForTournament(adminClient, tournamentId)
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
        const { data: page, error: pageErr } = await adminClient
          .from('predictions')
          .select('entry_id, match_id, predicted_home_score, predicted_away_score, predicted_home_pso, predicted_away_pso, predicted_winner_team_id')
          .in('entry_id', entryIds)
          .order('entry_id', { ascending: true }).order('match_id', { ascending: true })
          .range(offset, offset + 999)
        // ⚠ This error used to be DISCARDED. A transient failure (the
        // `TypeError: fetch failed` seen throughout 2026-07-27) left `page`
        // null, which exited the loop as though paging had COMPLETED — so every
        // entry whose predictions had not yet loaded fell through the
        // `preds.length === 0 → continue` below and was silently skipped, with
        // no error and no summary entry. Its previously-materialized rows were
        // then purged by the write, leaving it with nothing.
        //
        // Real damage, found by diffing prod vs shadow: entry NasserSEN
        // (98f3163f) — 104 predictions, fully submitted — had 0 standings, 0
        // podium and 0 bonus rows against prod's 26, while its 10 pool-mates
        // were byte-perfect. Throwing here quarantines the pool for retry
        // instead of silently corrupting one member's scoring.
        if (pageErr) throw new Error(`predictions page @${offset}: ${pageErr.message}`)
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
        if (preds.length === 0) {
          // Make the skip VISIBLE. A submitted entry with zero loaded
          // predictions is anomalous, and silently dropping it is how
          // NasserSEN lost 26 bonus rows unnoticed. The paging error check
          // above should now prevent the transient cause, but if this ever
          // fires again it must be seen rather than inferred from a diff.
          summary.errors.push(`pool ${pool.pool_id}: entry ${e.entry_id} skipped — 0 predictions loaded`)
          continue
        }
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

// =============================================================
// DURABLE PREDICTED-BRACKET RECONCILER  (P1 — version-stamped, pull-based)
// =============================================================
// Resolves every entry whose stored predicted bracket has drifted from its
// inputs — predictions edited, a NEW (incl. mobile, which bypasses the API)
// submission, or an engine-version bump — and writes shadow_entry_bracket, the
// match engine's OWN table (no shared-column clobber), then stamps
// shadow_entry_bracket_state. Detection is `shadow_entries_needing_bracket_resolve`
// (per-entry version diff), so nothing can slip past by writing predictions
// directly. Idempotent; a no-op when nothing drifted. Shadow-only.
// =============================================================
export async function reconcileVersionedBrackets(
  adminClient: any,
  tournamentId: string,
  opts?: { cap?: number },
): Promise<{ flagged: number; resolved: number; errors: string[] }> {
  const summary = { flagged: 0, resolved: 0, errors: [] as string[] }
  const cap = opts?.cap ?? 500

  const { data: flagged, error: detErr } = await adminClient
    .rpc('shadow_entries_needing_bracket_resolve', { p_cap: cap })
  if (detErr) {
    summary.errors.push(`detect: ${detErr.message}`)
    return summary
  }
  const targets = (flagged ?? []) as Array<{ entry_id: string; pool_id: string }>
  summary.flagged = targets.length
  if (targets.length === 0) return summary

  const { data: verRow } = await adminClient
    .from('sync_settings').select('setting_value').eq('setting_key', 'scoring_engine_version').maybeSingle()
  const engineVersion = Number(verRow?.setting_value ?? 1)

  const { data: matches } = await adminClient
    .from('matches')
    .select('match_id, match_number, stage, group_letter, home_team_id, away_team_id, home_team_placeholder, away_team_placeholder')
    .eq('tournament_id', tournamentId)
    .order('match_number', { ascending: true })
  const { data: teams } = await adminClient
    .from('teams')
    .select('team_id, country_name, country_code, group_letter, fifa_ranking_points, flag_url')
    .eq('tournament_id', tournamentId)
  // Scoped + paginated. Unfiltered this is silently truncated at 1,000 rows by
  // PostgREST, which in the live scoring engine means conduct-based tiebreaks
  // resolved against partial data — no error, just wrong brackets.
  const conduct = await fetchMatchConductForTournament(adminClient, tournamentId)
  if (!matches || !teams) {
    summary.errors.push('failed to load matches/teams')
    return summary
  }

  // Predictions for the flagged entries (+ per-entry watermark), paginated past
  // PostgREST's 1000-row cap with a stable order so page seams are deterministic.
  const ids = targets.map((t) => t.entry_id)
  const predsByEntry = new Map<string, any[]>()
  const wmByEntry = new Map<string, string | null>()
  for (let i = 0; i < ids.length; i += 300) {
    const slice = ids.slice(i, i + 300)
    let offset = 0
    let more = true
    while (more) {
      const { data: page } = await adminClient
        .from('predictions')
        .select('entry_id, match_id, predicted_home_score, predicted_away_score, predicted_home_pso, predicted_away_pso, predicted_winner_team_id, updated_at')
        .in('entry_id', slice)
        .order('entry_id', { ascending: true })
        .order('match_id', { ascending: true })
        .range(offset, offset + 999)
      if (!page || page.length === 0) {
        more = false
      } else {
        for (const p of page) {
          const l = predsByEntry.get(p.entry_id) ?? []
          l.push(p)
          predsByEntry.set(p.entry_id, l)
          const cur = wmByEntry.get(p.entry_id) ?? null
          if (p.updated_at && (!cur || p.updated_at > cur)) wmByEntry.set(p.entry_id, p.updated_at)
        }
        offset += page.length
        if (page.length < 1000) more = false
      }
    }
  }

  const nowIso = new Date().toISOString()
  for (const t of targets) {
    try {
      const preds = predsByEntry.get(t.entry_id) ?? []
      const rows = preds.length === 0 ? [] : resolveEntryBracketRows(
        t.pool_id,
        {
          entry_id: t.entry_id,
          member_id: '',
          point_adjustment: 0,
          predictions: preds.map((p: any) => ({
            match_id: p.match_id,
            predicted_home_score: p.predicted_home_score,
            predicted_away_score: p.predicted_away_score,
            predicted_home_pso: p.predicted_home_pso ?? null,
            predicted_away_pso: p.predicted_away_pso ?? null,
            predicted_winner_team_id: p.predicted_winner_team_id ?? null,
          })),
        },
        matches as MatchWithResult[], teams as TeamData[], (conduct ?? []) as ConductData[],
      )

      // Own table → safe per-entry purge + insert (no bonus predicted_winner to clobber).
      const { error: delErr } = await adminClient.from('shadow_entry_bracket').delete().eq('entry_id', t.entry_id)
      if (delErr) throw new Error(`purge: ${delErr.message}`)
      if (rows.length > 0) {
        const { error: insErr } = await adminClient.from('shadow_entry_bracket').insert(
          rows.map((r) => ({
            entry_id: r.entry_id,
            match_id: r.match_id,
            predicted_home_team_id: r.predicted_home_team_id,
            predicted_away_team_id: r.predicted_away_team_id,
          })),
        )
        if (insErr) throw new Error(`insert: ${insErr.message}`)
      }

      // Stamp state LAST, so a mid-entry failure re-flags (re-resolves) next run.
      const { error: stErr } = await adminClient.from('shadow_entry_bracket_state').upsert(
        {
          entry_id: t.entry_id,
          predictions_watermark: wmByEntry.get(t.entry_id) ?? null,
          engine_version: engineVersion,
          resolved_at: nowIso,
        },
        { onConflict: 'entry_id' },
      )
      if (stErr) throw new Error(`stamp: ${stErr.message}`)
      summary.resolved++
    } catch (err: any) {
      summary.errors.push(`entry ${t.entry_id}: ${err?.message ?? String(err)}`)
    }
  }

  return summary
}

// ============================================================================
// P2 — the one reconciler. Re-derives every entry whose shadow per-entry output
// is stale for ANY reason, across ALL modes.
//
// Plan: drafts/2026-07-27_shadow_P2_input_version_watermark.md
// Migrations: 029 (schema) / 030 (selector) / 031 (marker)
//
// WHY THIS EXISTS — the defect it closes
// --------------------------------------
// The materialize cron only picks up pools whose PREDICTIONS changed
// (`shadow_pools_needing_materialize` tests `predictions.updated_at > since`).
// So a fix to derivation LOGIC never reaches existing data. Measured 2026-07-27:
// the July podium fix landed in `resolveEntryPodiumPick`, but
// `shadow_resolved_podium` still held pre-fix cascade values — 19 of 32 entries
// in one progressive pool recorded as picking France when they had picked
// Spain. The last prediction edit in the whole database was 2026-07-19, so the
// selector had returned zero pools for over a week and always would have.
//
// HOW IT DIFFERS FROM reconcileVersionedBrackets (P1), WHICH IT WILL REPLACE
//   - all modes, not full_tournament only (progressive is 44.5% of entries)
//   - governs ALL per-entry derived tables, not just shadow_entry_bracket
//   - watches results/conduct via inputs_version, which P1 is blind to
//
// NOT a replacement yet: P1 still runs, and its selector is untouched.
//
// ⚠ KNOWN INTERACTION (benign, self-converging): P1's own stamp does not set
// `inputs_version`, so a row it INSERTS lands at the column default 0. Once the
// tournament version is bumped past 0, such a row looks stale to P2 and gets
// re-derived once more than strictly needed. It converges and never produces
// wrong data. Deliberately not "fixed" by editing P1's live path — that goes
// away when this function replaces it.
// ============================================================================
export async function reconcileStaleEntries(
  adminClient: any,
  tournamentId: string,
  opts?: { cap?: number },
): Promise<{
  enabled: boolean
  selected: number
  pools: number
  marked: number
  quarantined: number
  skippedNoOutput: number
  reasons: Record<string, number>
  errors: string[]
}> {
  const out = { enabled: false, selected: 0, pools: 0, marked: 0, quarantined: 0, skippedNoOutput: 0, reasons: {} as Record<string, number>, errors: [] as string[] }

  // ⚠ PostgREST silently truncates ANY response at 1,000 rows — including RPC
  // results (see the `supabase_postgrest_row_cap` class of bug, which has hit
  // this codebase repeatedly). A cap above 1,000 would therefore return 1,000
  // and quietly under-reconcile while looking successful. Clamp it: batches are
  // meant to be small anyway, and the cron re-runs until the selector is dry.
  const MAX_CAP = 1000
  const cap = Math.min(opts?.cap ?? 500, MAX_CAP)

  // Opt-in kill switch. ABSENT = DISABLED, deliberately: deploying this code
  // must not start an estate-wide sweep on its own. Ryan flips it explicitly.
  const { data: enabledRow } = await adminClient
    .from('sync_settings').select('setting_value').eq('setting_key', 'shadow_rederive_enabled').maybeSingle()
  if (enabledRow?.setting_value !== true && enabledRow?.setting_value !== 'true') return out
  out.enabled = true

  // Snapshot BEFORE selection. Migration 031 clamps the stored watermark to this
  // instant, so an edit landing mid-run stays stale and is re-picked-up next
  // run rather than being marked clean against picks we never read.
  const snapshot = new Date().toISOString()

  const { data: stale, error: selErr } = await adminClient.rpc('shadow_entries_needing_rederive', { p_cap: cap })
  if (selErr) {
    out.errors.push(`select: ${selErr.message}`)
    return out
  }
  const rows = (stale ?? []) as Array<{ entry_id: string; pool_id: string; reason: string }>
  out.selected = rows.length
  if (rows.length === 0) return out

  for (const r of rows) out.reasons[r.reason] = (out.reasons[r.reason] ?? 0) + 1

  // Selection is per-entry; writing is per-pool (backfillBonusInputs takes pool
  // ids). We therefore re-derive whole pools and mark whole pools — see the
  // migration 031 header.
  const poolIds = [...new Set(rows.map((r) => r.pool_id))]
  out.pools = poolIds.length

  try {
    const brackets = await backfillResolvedBrackets(adminClient, tournamentId, { poolIds })
    const bonus = await backfillBonusInputs(adminClient, tournamentId, { poolIds })

    // ⚠ These helpers COLLECT errors into their summary rather than throwing.
    // On 2026-07-27 a run reported `podium: 0` while having actually written the
    // rows, then failed a later step — so a throw-only guard would have marked
    // partially-derived pools as clean.
    const softErrors = [...(brackets.errors ?? []), ...(bonus.errors ?? [])]

    // PER-POOL QUARANTINE, not all-or-nothing.
    //
    // `TypeError: fetch failed` is a transient network error and shows up in
    // most multi-pool batches: a 500-entry batch spans ~46 pools, so even a
    // low per-pool failure rate means nearly every batch has one. Discarding
    // the whole batch's work because one pool blipped would mean the sweep
    // NEVER CONVERGES — it would redo ~43 good pools every pass and mark none.
    //
    // So: quarantine the pools named in the errors, mark the rest. The failed
    // ones stay stale and are re-selected next run, which is exactly the
    // retry mechanism we want and needs no retry logic.
    //
    // Conservative fallback: an error we cannot attribute to a specific pool
    // poisons the whole batch, because we cannot tell which pool is bad.
    const failedPools = new Set<string>()
    let unattributable = false
    for (const e of softErrors) {
      const m = /pool ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.exec(e)
      if (m) failedPools.add(m[1])
      else unattributable = true
    }
    out.errors.push(...softErrors.map((e: string) => `backfill: ${e}`))
    if (unattributable) return out

    const cleanPools = poolIds.filter((p) => !failedPools.has(p))
    out.quarantined = failedPools.size
    if (cleanPools.length === 0) return out

    // CHUNK THE APPLY + MARK. `shadow_apply_changes` across 40 pools exceeds the
    // 2-minute statement_timeout — observed 2026-07-27, and it is the SAME
    // failure that killed the reverted dirty-pool drain ("shipped a
    // statement-timeout bug in the drain", commit 724b4ee). Phase A hit it too
    // and fixed it the same way.
    //
    // Each chunk is applied AND marked before the next starts, so a timeout
    // later in the batch cannot discard work already completed and committed.
    // Progress is monotonic: every successful chunk permanently shrinks the
    // selector, so the sweep converges even on a flaky connection.
    const APPLY_CHUNK = 10
    let markedTotal = 0
    let appliedPools = 0
    for (let i = 0; i < cleanPools.length; i += APPLY_CHUNK) {
      const chunk = cleanPools.slice(i, i + APPLY_CHUNK)

      const { error: applyErr } = await adminClient.rpc('shadow_apply_changes', {
        p_match_ids: [],
        p_pool_ids: chunk,
      })
      if (applyErr) {
        out.errors.push(`shadow_apply_changes[${i / APPLY_CHUNK}]: ${applyErr.message}`)
        continue // this chunk stays stale; the rest still get their chance
      }

      const { data: markRes, error: markErr } = await adminClient.rpc('shadow_mark_pools_rederived', {
        p_pool_ids: chunk,
        p_snapshot: snapshot,
      })
      if (markErr) {
        out.errors.push(`mark[${i / APPLY_CHUNK}]: ${markErr.message}`)
        continue
      }

      // Migration 032: the marker now REFUSES to mark an entry that produced no
      // derived output, and reports which. Surface that loudly — an entry in
      // this list is one P2 will keep retrying forever, which is the correct
      // behaviour but must never be something you have to infer from a diff.
      // (This is the safeguard for the 98f3163f class of failure: marked clean
      // while holding zero derived rows.)
      const skippedNoOutput = Number(markRes?.skipped_no_output ?? 0)
      if (skippedNoOutput > 0) {
        const ids = (markRes?.skipped_entry_ids ?? []) as string[]
        out.skippedNoOutput += skippedNoOutput
        out.errors.push(
          `mark[${i / APPLY_CHUNK}]: ${skippedNoOutput} entr${skippedNoOutput === 1 ? 'y' : 'ies'} produced NO derived output and were left stale — ${ids.join(', ')}`,
        )
      }

      markedTotal += Number(markRes?.marked ?? 0)
      appliedPools += chunk.length
    }
    out.marked = markedTotal
    out.pools = appliedPools
  } catch (e: any) {
    out.errors.push(`rederive: ${e?.message ?? String(e)}`)
  }

  return out
}
