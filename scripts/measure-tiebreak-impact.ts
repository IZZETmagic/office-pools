/**
 * READ-ONLY measurement for the knockout tie-break fix.
 *
 * Dry-runs the FIXED scoring engine (calculateFullTournament — a pure function)
 * against production data and diffs its output vs the stored
 * pool_entries.scored_total_points. It performs ONLY SELECTs; it never writes,
 * upserts, deletes, or calls an RPC. The authoritative re-score is the gated
 * recalc (#6) — this just sizes the impact and surfaces the entries to review.
 *
 * Caveat: "computed (new code, now)" is compared against "stored (old code, as
 * of the last recalc)". Between completed matches those align; if matches have
 * completed since a pool's last recalc, some delta is that lag, not the fix.
 * Treat the changed set as the population to review, not a signed-off number.
 *
 * Usage: npx tsx scripts/measure-tiebreak-impact.ts [--limit=N] [poolId ...]
 *   no pool args → all full_tournament pools
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'

// --- load .env.local (same bootstrap as scripts/canary-recalc.ts) ---
;(() => {
  const envPath = resolve(process.cwd(), '.env.local')
  try {
    const envContent = readFileSync(envPath, 'utf8')
    for (const line of envContent.split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const i = t.indexOf('=')
      if (i === -1) continue
      const k = t.slice(0, i).trim()
      let v = t.slice(i + 1).trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
      if (!process.env[k]) process.env[k] = v
    }
  } catch {
    console.error('Could not read .env.local')
    process.exit(1)
  }
})()

import { createAdminClient } from '../lib/supabase/server'
import { calculateFullTournament } from '../lib/scoring/full'
import { DEFAULT_POOL_SETTINGS } from '../app/pools/[pool_id]/results/points'

type Delta = {
  pool_id: string
  entry_id: string
  stored: number | null
  computed: number
  delta: number
  adjustment: number
}

async function loadTournamentData(admin: any, tournamentId: string) {
  const [{ data: matches }, { data: teams }, { data: conductData }, { data: awardsRow }] = await Promise.all([
    admin
      .from('matches')
      .select('*, home_team:teams!matches_home_team_id_fkey(country_name, flag_url), away_team:teams!matches_away_team_id_fkey(country_name, flag_url)')
      .eq('tournament_id', tournamentId)
      .order('match_number', { ascending: true }),
    admin
      .from('teams')
      .select('team_id, country_name, country_code, group_letter, fifa_ranking_points, flag_url')
      .eq('tournament_id', tournamentId),
    admin
      .from('match_conduct')
      .select('match_id, team_id, yellow_cards, indirect_red_cards, direct_red_cards, yellow_direct_red_cards'),
    admin
      .from('tournament_awards')
      .select('champion_team_id, runner_up_team_id, third_place_team_id, best_player, top_scorer')
      .eq('tournament_id', tournamentId)
      .single(),
  ])
  const normalizedMatches = (matches ?? []).map((m: any) => ({
    ...m,
    home_team: Array.isArray(m.home_team) ? m.home_team[0] ?? null : m.home_team,
    away_team: Array.isArray(m.away_team) ? m.away_team[0] ?? null : m.away_team,
  }))
  const teamsData = (teams ?? []).map((t: any) => ({
    ...t,
    group_letter: t.group_letter?.trim() || '',
    country_code: t.country_code?.trim() || '',
  }))
  return { normalizedMatches, teamsData, conduct: conductData ?? [], tournamentAwards: awardsRow ?? null }
}

async function loadPredictions(admin: any, entryIds: string[]) {
  const byEntry = new Map<string, any[]>()
  if (entryIds.length === 0) return byEntry
  const pageSize = 1000
  let offset = 0
  let more = true
  while (more) {
    const { data: page } = await admin
      .from('predictions')
      .select('entry_id, match_id, predicted_home_score, predicted_away_score, predicted_home_pso, predicted_away_pso, predicted_winner_team_id')
      .in('entry_id', entryIds)
      .order('entry_id', { ascending: true })
      .order('match_id', { ascending: true })
      .range(offset, offset + pageSize - 1)
    if (!page || page.length === 0) {
      more = false
    } else {
      for (const p of page) {
        const l = byEntry.get(p.entry_id) ?? []
        l.push(p)
        byEntry.set(p.entry_id, l)
      }
      offset += page.length
      if (page.length < pageSize) more = false
    }
  }
  return byEntry
}

async function measurePool(admin: any, poolId: string, tournamentId: string, tData: any): Promise<Delta[]> {
  const [{ data: settingsRow }, { data: members }] = await Promise.all([
    admin.from('pool_settings').select('*').eq('pool_id', poolId).single(),
    admin.from('pool_members').select('member_id').eq('pool_id', poolId),
  ])
  const settings = { ...DEFAULT_POOL_SETTINGS, ...(settingsRow || {}) }
  const memberIds = (members ?? []).map((m: any) => m.member_id)
  if (memberIds.length === 0) return []

  const { data: entries } = await admin
    .from('pool_entries')
    .select('entry_id, member_id, has_submitted_predictions, point_adjustment, scored_total_points')
    .in('member_id', memberIds)
  const submitted = (entries ?? []).filter((e: any) => e.has_submitted_predictions)
  if (submitted.length === 0) return []

  const preds = await loadPredictions(admin, submitted.map((e: any) => e.entry_id))
  const entriesWithPredictions = submitted.map((e: any) => ({
    entry_id: e.entry_id,
    member_id: e.member_id,
    point_adjustment: e.point_adjustment ?? 0,
    predictions: (preds.get(e.entry_id) ?? []).map((p: any) => ({
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
    tournamentId,
    predictionMode: 'full_tournament',
    settings,
    matches: tData.normalizedMatches,
    teams: tData.teamsData,
    conductData: tData.conduct,
    entries: entriesWithPredictions,
    tournamentAwards: tData.tournamentAwards,
  }
  const result = calculateFullTournament(input as any)

  const storedById = new Map<string, { stored: number | null; adj: number }>(
    submitted.map((e: any) => [e.entry_id, { stored: e.scored_total_points, adj: e.point_adjustment ?? 0 }]),
  )
  const deltas: Delta[] = []
  for (const t of result.entryTotals) {
    const s = storedById.get(t.entry_id)
    if (!s) continue
    const stored = s.stored == null ? null : Number(s.stored)
    const computed = t.total_points
    const delta = stored == null ? computed : computed - stored
    if (stored == null || delta !== 0 || s.adj !== 0) {
      deltas.push({ pool_id: poolId, entry_id: t.entry_id, stored, computed, delta, adjustment: s.adj })
    }
  }
  return deltas
}

async function main() {
  const admin = createAdminClient()
  const argPools = process.argv.slice(2).filter((a) => !a.startsWith('--'))
  const limitArg = process.argv.find((a) => a.startsWith('--limit='))
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity

  let poolsQ = admin.from('pools').select('pool_id, tournament_id').eq('prediction_mode', 'full_tournament')
  if (argPools.length) poolsQ = poolsQ.in('pool_id', argPools)
  const { data: poolsRaw } = await poolsQ
  const pools = (poolsRaw ?? []).slice(0, limit)
  if (pools.length === 0) {
    console.error('No full_tournament pools found for the given filter.')
    process.exit(1)
  }

  const byTournament = new Map<string, any>()
  const allDeltas: Delta[] = []
  let poolCount = 0

  for (const p of pools) {
    if (!byTournament.has(p.tournament_id)) {
      byTournament.set(p.tournament_id, await loadTournamentData(admin, p.tournament_id))
    }
    const tData = byTournament.get(p.tournament_id)
    try {
      const deltas = await measurePool(admin, p.pool_id, p.tournament_id, tData)
      const changed = deltas.filter((d) => d.delta !== 0)
      allDeltas.push(...deltas)
      poolCount++
      if (changed.length) console.log(`pool ${p.pool_id}: ${changed.length} entr${changed.length === 1 ? 'y' : 'ies'} changed`)
    } catch (e: any) {
      console.error(`pool ${p.pool_id} ERROR: ${e?.message || e}`)
    }
  }

  const changedAll = allDeltas.filter((d) => d.delta !== 0)
  const up = changedAll.filter((d) => d.delta > 0)
  const down = changedAll.filter((d) => d.delta < 0)
  const withAdj = allDeltas.filter((d) => d.adjustment !== 0)

  console.log('\n===== SUMMARY (read-only dry-run — no scores were written) =====')
  console.log(`full_tournament pools measured : ${poolCount} / ${pools.length}`)
  console.log(`entries with score change      : ${changedAll.length}  (up ${up.length}, down ${down.length})`)
  console.log(`largest increase / decrease    : +${up.length ? Math.max(...up.map((d) => d.delta)) : 0} / ${down.length ? Math.min(...down.map((d) => d.delta)) : 0}`)

  console.log('\nEntries carrying a point_adjustment (Eliel provisional +300 lives here):')
  if (withAdj.length === 0) console.log('  (none)')
  for (const d of withAdj) {
    console.log(`  entry ${d.entry_id}  pool ${d.pool_id}  stored ${d.stored} → computed ${d.computed}  (Δ ${d.delta >= 0 ? '+' : ''}${d.delta})  adjustment ${d.adjustment}`)
  }

  console.log('\nTop 20 entries by |Δ| (review these for correctness):')
  for (const d of [...changedAll].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 20)) {
    console.log(`  entry ${d.entry_id}  pool ${d.pool_id}  ${d.stored} → ${d.computed}  (Δ ${d.delta >= 0 ? '+' : ''}${d.delta})`)
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
