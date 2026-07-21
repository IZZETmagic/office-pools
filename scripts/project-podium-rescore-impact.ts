/**
 * READ-ONLY projection of the podium re-score's LEADERBOARD impact.
 *
 * Answers "what will actually move?" before running the re-score. Replays the
 * fixed bonus engine to get each entry's podium delta, then re-ranks every pool
 * using the EXACT tiebreaker chain from lib/scoring/recalculate.ts:540-575
 * (total → exact_count → correct_count → bonus_points → submission time) and
 * diffs the result against the stored current_rank.
 *
 * Writes NOTHING. No recalculatePool, no inserts, no updates, no DDL.
 *
 *   npx tsx scripts/project-podium-rescore-impact.ts
 *   npx tsx scripts/project-podium-rescore-impact.ts --show=20   # sample movers
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'

;(() => {
  const envPath = resolve(process.cwd(), '.env.local')
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
})()

import { createAdminClient } from '../lib/supabase/server'
import { calculateAllBonusPoints } from '../lib/bonusCalculation'
import { DEFAULT_POOL_SETTINGS } from '../app/pools/[pool_id]/results/points'

const TOURNAMENT = '00000000-0000-0000-0000-000000000001'
const PODIUM_TYPES = ['champion_correct', 'second_place_correct', 'third_place_correct']

async function pageAllChunked(ids: string[], q: (chunk: string[], from: number, to: number) => any, size = 1000) {
  const out: any[] = []
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200)
    let off = 0
    for (;;) {
      const { data, error } = await q(chunk, off, off + size - 1)
      if (error) throw new Error(error.message)
      if (!data || data.length === 0) break
      out.push(...data)
      off += data.length
      if (data.length < size) break
    }
  }
  return out
}

/** Mirrors lib/scoring/recalculate.ts:540-575 exactly. */
function assignRanks(rows: any[], submissionTime: Map<string, string | null>) {
  const sorted = [...rows].sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total
    if (b.exact_count !== a.exact_count) return b.exact_count - a.exact_count
    if (b.correct_count !== a.correct_count) return b.correct_count - a.correct_count
    if (b.bonus !== a.bonus) return b.bonus - a.bonus
    const at = submissionTime.get(a.entry_id)
    const bt = submissionTime.get(b.entry_id)
    if (at && bt) return new Date(at).getTime() - new Date(bt).getTime()
    if (at && !bt) return -1
    if (!at && bt) return 1
    return 0
  })
  const rank = new Map<string, number>()
  for (let i = 0; i < sorted.length; i++) {
    if (i === 0) { rank.set(sorted[i].entry_id, 1); continue }
    const prev = sorted[i - 1], curr = sorted[i]
    const tied =
      curr.total === prev.total &&
      curr.exact_count === prev.exact_count &&
      curr.correct_count === prev.correct_count &&
      curr.bonus === prev.bonus &&
      submissionTime.get(curr.entry_id) === submissionTime.get(prev.entry_id)
    rank.set(curr.entry_id, tied ? rank.get(prev.entry_id)! : i + 1)
  }
  return rank
}

async function main() {
  const showArg = process.argv.find(a => a.startsWith('--show='))
  const show = showArg ? parseInt(showArg.split('=')[1], 10) : 0
  const admin = createAdminClient()

  const [{ data: matches }, { data: teams }, { data: conduct }, { data: awards }] = await Promise.all([
    admin.from('matches').select('*').eq('tournament_id', TOURNAMENT).order('match_number'),
    admin.from('teams').select('team_id, country_name, country_code, group_letter, fifa_ranking_points, flag_url').eq('tournament_id', TOURNAMENT),
    admin.from('match_conduct').select('match_id, team_id, yellow_cards, indirect_red_cards, direct_red_cards, yellow_direct_red_cards'),
    admin.from('tournament_awards').select('champion_team_id, runner_up_team_id, third_place_team_id, best_player, top_scorer').eq('tournament_id', TOURNAMENT).maybeSingle(),
  ])
  const teamsData = (teams as any[]).map(t => ({ ...t, group_letter: t.group_letter?.trim() || '', country_code: t.country_code?.trim() || '' }))

  // Classic pools only — bracket_picker is untouched by this re-score.
  const { data: pools } = await admin.from('pools').select('pool_id, pool_name, prediction_mode').in('prediction_mode', ['progressive', 'full_tournament'])
  const poolIds = (pools ?? []).map((p: any) => p.pool_id)
  const poolMeta = new Map((pools ?? []).map((p: any) => [p.pool_id, p]))

  const settingsRows = await pageAllChunked(poolIds, (c, f, t) => admin.from('pool_settings').select('*').in('pool_id', c).range(f, t))
  const settingsByPool = new Map(settingsRows.map((s: any) => [s.pool_id, { ...DEFAULT_POOL_SETTINGS, ...s }]))

  const members = await pageAllChunked(poolIds, (c, f, t) => admin.from('pool_members').select('member_id, pool_id').in('pool_id', c).range(f, t))
  const poolByMember = new Map(members.map((m: any) => [m.member_id, m.pool_id]))

  const entries = await pageAllChunked(members.map((m: any) => m.member_id), (c, f, t) =>
    admin.from('pool_entries')
      .select('entry_id, member_id, entry_name, has_submitted_predictions, predictions_submitted_at, match_points, bonus_points, scored_total_points, current_rank, point_adjustment')
      .in('member_id', c).range(f, t))

  const ers = await pageAllChunked(entries.map((e: any) => e.entry_id), (c, f, t) =>
    admin.from('entry_round_submissions').select('id, entry_id').in('entry_id', c).eq('has_submitted', true).order('id').range(f, t))
  const roundSubmitted = new Set(ers.map((r: any) => r.entry_id))

  const isSubmitted = (e: any) => {
    const mode = poolMeta.get(poolByMember.get(e.member_id))?.prediction_mode
    return mode === 'progressive'
      ? (e.has_submitted_predictions || roundSubmitted.has(e.entry_id))
      : e.has_submitted_predictions
  }

  const scoredEntryIds = entries.map((e: any) => e.entry_id)
  const predRows = await pageAllChunked(scoredEntryIds, (c, f, t) =>
    admin.from('predictions')
      .select('entry_id, match_id, predicted_home_score, predicted_away_score, predicted_home_pso, predicted_away_pso, predicted_winner_team_id')
      .in('entry_id', c).order('entry_id').order('match_id').range(f, t))
  const predsByEntry = new Map<string, any[]>()
  for (const p of predRows) {
    const l = predsByEntry.get(p.entry_id) ?? []; l.push(p); predsByEntry.set(p.entry_id, l)
  }

  // Tiebreaker inputs from the stored match_scores.
  const msRows = await pageAllChunked(scoredEntryIds, (c, f, t) =>
    admin.from('match_scores').select('entry_id, score_type').in('entry_id', c).range(f, t))
  const exactBy = new Map<string, number>(), correctBy = new Map<string, number>()
  for (const r of msRows) {
    if (r.score_type === 'exact') exactBy.set(r.entry_id, (exactBy.get(r.entry_id) ?? 0) + 1)
    if (r.score_type !== 'miss') correctBy.set(r.entry_id, (correctBy.get(r.entry_id) ?? 0) + 1)
  }

  const storedPodium = await pageAllChunked(scoredEntryIds, (c, f, t) =>
    admin.from('bonus_scores').select('entry_id, bonus_type, points_earned').in('entry_id', c).in('bonus_type', PODIUM_TYPES).range(f, t))
  const storedByEntry = new Map<string, Map<string, number>>()
  for (const b of storedPodium) {
    const m = storedByEntry.get(b.entry_id) ?? new Map(); m.set(b.bonus_type, b.points_earned); storedByEntry.set(b.entry_id, m)
  }

  // ---- per-entry podium delta from the FIXED engine ----
  const delta = new Map<string, number>()
  const byType: Record<string, { add: number; addPts: number; rm: number; rmPts: number; changed: number; changedPts: number }> = {}
  for (const t of PODIUM_TYPES) byType[t] = { add: 0, addPts: 0, rm: 0, rmPts: 0, changed: 0, changedPts: 0 }
  for (const e of entries) {
    if (!isSubmitted(e)) continue
    const rows = predsByEntry.get(e.entry_id) ?? []
    if (rows.length === 0) continue
    const poolId = poolByMember.get(e.member_id)
    const settings = settingsByPool.get(poolId)
    const mode = poolMeta.get(poolId)?.prediction_mode
    if (!settings || !mode) continue
    const predictionMap = new Map(rows.map((p: any) => [p.match_id, {
      home: p.predicted_home_score, away: p.predicted_away_score,
      homePso: p.predicted_home_pso ?? null, awayPso: p.predicted_away_pso ?? null,
      winnerTeamId: p.predicted_winner_team_id ?? null,
    }]))
    const bonuses = calculateAllBonusPoints({
      memberId: e.entry_id, memberPredictions: predictionMap as any,
      matches: matches as any, teams: teamsData as any, conductData: (conduct ?? []) as any,
      settings: settings as any, tournamentAwards: (awards as any) ?? null, predictionMode: mode as any,
    })
    let d = 0
    const stored = storedByEntry.get(e.entry_id) ?? new Map()
    const computed = new Map(bonuses.filter(b => PODIUM_TYPES.includes(b.bonus_type)).map(b => [b.bonus_type, b.points_earned]))
    for (const t of PODIUM_TYPES) {
      const c = computed.get(t) ?? 0, s = stored.get(t) ?? 0
      d += c - s
      // Reconciliation breakdown so this agrees with scripts/audit-podium.ts
      if (c > 0 && s === 0) { byType[t].add++; byType[t].addPts += c }
      else if (c === 0 && s > 0) { byType[t].rm++; byType[t].rmPts += s }
      else if (c !== s) { byType[t].changed++; byType[t].changedPts += c - s }
    }
    if (d !== 0) delta.set(e.entry_id, d)
  }

  // ---- re-rank every pool ----
  const byPool = new Map<string, any[]>()
  for (const e of entries) {
    const pid = poolByMember.get(e.member_id)
    if (!pid) continue
    const l = byPool.get(pid) ?? []; l.push(e); byPool.set(pid, l)
  }
  const submissionTime = new Map<string, string | null>(entries.map((e: any) => [e.entry_id, e.predictions_submitted_at ?? null]))

  let poolsWithPointChange = 0, poolsWithRankChange = 0, poolsWithNewWinner = 0
  let entriesPointChange = 0, entriesRankUp = 0, entriesRankDown = 0
  let biggestPoolMove = 0
  const winnerChanges: string[] = []
  const movers: string[] = []

  for (const [poolId, poolEntries] of byPool) {
    const scored = poolEntries.filter(isSubmitted)
    if (scored.length === 0) continue
    const rows = scored.map((e: any) => ({
      entry_id: e.entry_id,
      total: (e.scored_total_points ?? 0),
      bonus: (e.bonus_points ?? 0),
      exact_count: exactBy.get(e.entry_id) ?? 0,
      correct_count: correctBy.get(e.entry_id) ?? 0,
    }))
    const after = rows.map(r => {
      const d = delta.get(r.entry_id) ?? 0
      return { ...r, total: r.total + d, bonus: r.bonus + d }
    })
    const changed = after.some((r, i) => r.total !== rows[i].total)
    if (!changed) continue
    poolsWithPointChange++

    const rankBefore = assignRanks(rows, submissionTime)
    const rankAfter = assignRanks(after, submissionTime)

    let poolRankChanged = false, poolMax = 0
    for (const r of rows) {
      if (delta.has(r.entry_id)) entriesPointChange++
      const b = rankBefore.get(r.entry_id)!, a = rankAfter.get(r.entry_id)!
      if (a !== b) {
        poolRankChanged = true
        poolMax = Math.max(poolMax, Math.abs(a - b))
        if (a < b) entriesRankUp++; else entriesRankDown++
        if (movers.length < show) {
          const e = scored.find((x: any) => x.entry_id === r.entry_id)
          movers.push(`    ${(e?.entry_name ?? r.entry_id).padEnd(22)} rank ${b} → ${a}   ${delta.get(r.entry_id) ? (delta.get(r.entry_id)! > 0 ? '+' : '') + delta.get(r.entry_id) + ' pts' : '(displaced)'}`)
        }
      }
    }
    if (poolRankChanged) poolsWithRankChange++
    biggestPoolMove = Math.max(biggestPoolMove, poolMax)

    const winnerBefore = [...rankBefore.entries()].filter(([, v]) => v === 1).map(([k]) => k).sort()
    const winnerAfter = [...rankAfter.entries()].filter(([, v]) => v === 1).map(([k]) => k).sort()
    if (JSON.stringify(winnerBefore) !== JSON.stringify(winnerAfter)) {
      poolsWithNewWinner++
      if (winnerChanges.length < 15) {
        const nm = (id: string) => scored.find((x: any) => x.entry_id === id)?.entry_name ?? id.slice(0, 8)
        winnerChanges.push(`    ${(poolMeta.get(poolId)?.pool_name ?? poolId).slice(0, 34).padEnd(36)} ${winnerBefore.map(nm).join('/')}  →  ${winnerAfter.map(nm).join('/')}`)
      }
    }
  }

  const totalPts = [...delta.values()].reduce((a, b) => a + b, 0)
  const gainers = [...delta.values()].filter(d => d > 0).length
  const losers = [...delta.values()].filter(d => d < 0).length

  console.log('===== PODIUM ROW RECONCILIATION (should match scripts/audit-podium.ts) =====')
  for (const t of PODIUM_TYPES) {
    const r = byType[t]
    console.log(`  ${t.padEnd(22)} ADD ${String(r.add).padStart(3)} (+${r.addPts})   REMOVE ${r.rm} (-${r.rmPts})   REPRICED ${r.changed} (${r.changedPts >= 0 ? '+' : ''}${r.changedPts})`)
  }
  console.log('')
  console.log('===== PROJECTED RE-SCORE IMPACT (read-only) =====')
  console.log(`entries whose points change : ${delta.size}  (${gainers} gain, ${losers} lose)`)
  console.log(`net points moved            : ${totalPts > 0 ? '+' : ''}${totalPts}`)
  console.log(`pools with any point change : ${poolsWithPointChange}`)
  console.log(`pools with any RANK change  : ${poolsWithRankChange}`)
  console.log(`pools whose #1 CHANGES      : ${poolsWithNewWinner}`)
  console.log(`entries moving up / down    : ${entriesRankUp} / ${entriesRankDown}`)
  console.log(`largest single rank move    : ${biggestPoolMove} places`)
  if (winnerChanges.length) {
    console.log('\n  pools changing winner (first 15):')
    for (const w of winnerChanges) console.log(w)
  }
  if (movers.length) {
    console.log(`\n  sample rank movers (first ${show}):`)
    for (const m of movers) console.log(m)
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
