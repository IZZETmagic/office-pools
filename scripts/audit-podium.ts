/**
 * PODIUM AUDIT — the ops guardrail for tournament podium bonuses. READ-ONLY.
 *
 * Replays the live bonus engine over every submitted classic entry and diffs the
 * podium rows it WOULD write against what `bonus_scores` actually holds. Writes
 * NOTHING: no recalculatePool, no inserts, no updates, no DDL.
 *
 * Run it whenever a tournament ends, and after any change to lib/podium.ts,
 * lib/bracketResolver.ts or lib/bonusCalculation.ts. A healthy tournament reads
 * ADD=0 / REMOVE=0 on every line. Any non-zero ADD is members owed points.
 *
 * It also prints the podium DERIVED from `matches` with `tournament_awards`
 * deliberately ignored, next to the awards row. Those two must agree — that
 * line is the standing check on the failure that started all of this: the awards
 * table has no automated writer, so for 13h41m after the 2026 final it was empty
 * and every podium bonus in the product was silently withheld. Scoring no longer
 * depends on it, and this line proves that each time it runs.
 *
 *   npx tsx scripts/audit-podium.ts                          # both classic modes
 *   npx tsx scripts/audit-podium.ts --mode=progressive       # one mode
 *   npx tsx scripts/audit-podium.ts --limit=25               # first N pools (quick)
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local.
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

async function pageAll(q: (from: number, to: number) => any, size = 1000) {
  const out: any[] = []
  let off = 0
  for (;;) {
    const { data, error } = await q(off, off + size - 1)
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break
    out.push(...data)
    off += data.length
    if (data.length < size) break
  }
  return out
}


/** Supabase .in() chokes on very large arrays — chunk it. */
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

async function main() {
  const args = process.argv.slice(2)
  const modeArg = args.find(a => a.startsWith('--mode='))?.split('=')[1]
  const limitArg = args.find(a => a.startsWith('--limit='))
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity
  const modes = modeArg ? [modeArg] : ['progressive', 'full_tournament']

  const admin = createAdminClient()

  const [{ data: matches }, { data: teams }, { data: conduct }, { data: awards }] = await Promise.all([
    admin.from('matches').select('*').eq('tournament_id', TOURNAMENT).order('match_number'),
    admin.from('teams').select('team_id, country_name, country_code, group_letter, fifa_ranking_points, flag_url').eq('tournament_id', TOURNAMENT),
    admin.from('match_conduct').select('match_id, team_id, yellow_cards, indirect_red_cards, direct_red_cards, yellow_direct_red_cards'),
    admin.from('tournament_awards').select('champion_team_id, runner_up_team_id, third_place_team_id, best_player, top_scorer').eq('tournament_id', TOURNAMENT).maybeSingle(),
  ])

  const teamsData = (teams as any[]).map(t => ({
    ...t,
    group_letter: t.group_letter?.trim() || '',
    country_code: t.country_code?.trim() || '',
  }))

  // Sanity: does the DERIVED podium match reality even with awards ignored?
  const { resolveActualPodium } = await import('../lib/podium')
  const derived = resolveActualPodium(matches as any, null)
  const nameOf = (id: string | null) => teamsData.find((t: any) => t.team_id === id)?.country_name ?? String(id)
  console.log(`DERIVED podium (tournament_awards IGNORED): champion=${nameOf(derived.champion)} runnerUp=${nameOf(derived.runnerUp)} third=${nameOf(derived.thirdPlace)} [source=${derived.source}]`)
  console.log(`STORED  podium (tournament_awards row)   : champion=${nameOf((awards as any)?.champion_team_id)} runnerUp=${nameOf((awards as any)?.runner_up_team_id)} third=${nameOf((awards as any)?.third_place_team_id)}`)
  console.log('')

  for (const mode of modes) {
    const { data: pools } = await admin.from('pools').select('pool_id').eq('prediction_mode', mode)
    const poolIds = (pools ?? []).map((p: any) => p.pool_id).slice(0, limit)

    const settingsRows = await pageAllChunked(poolIds, (c, f, t) => admin.from('pool_settings').select('*').in('pool_id', c).range(f, t))
    const settingsByPool = new Map(settingsRows.map((s: any) => [s.pool_id, { ...DEFAULT_POOL_SETTINGS, ...s }]))

    const members = await pageAllChunked(poolIds, (c, f, t) => admin.from('pool_members').select('member_id, pool_id').in('pool_id', c).range(f, t))
    const poolByMember = new Map(members.map((m: any) => [m.member_id, m.pool_id]))

    const entries = await pageAllChunked(members.map((m: any) => m.member_id), (c, f, t) =>
      admin.from('pool_entries').select('entry_id, member_id, has_submitted_predictions')
        .in('member_id', c).range(f, t))

    // submitted gate, mirroring lib/scoring/recalculate.ts
    let submitted = entries.filter((e: any) => e.has_submitted_predictions)
    if (mode === 'progressive') {
      const ers = await pageAllChunked(entries.map((e: any) => e.entry_id), (c, f, t) =>
        admin.from('entry_round_submissions').select('id, entry_id')
          .in('entry_id', c).eq('has_submitted', true)
          .order('id').range(f, t))
      const ids = new Set(ers.map((r: any) => r.entry_id))
      submitted = entries.filter((e: any) => e.has_submitted_predictions || ids.has(e.entry_id))
    }

    const entryIds = submitted.map((e: any) => e.entry_id)
    const predRows = await pageAllChunked(entryIds, (c, f, t) =>
      admin.from('predictions')
        .select('entry_id, match_id, predicted_home_score, predicted_away_score, predicted_home_pso, predicted_away_pso, predicted_winner_team_id')
        .in('entry_id', c).order('entry_id').order('match_id').range(f, t))
    const predsByEntry = new Map<string, any[]>()
    for (const p of predRows) {
      const l = predsByEntry.get(p.entry_id) ?? []
      l.push(p)
      predsByEntry.set(p.entry_id, l)
    }

    const bonusRows = await pageAllChunked(entryIds, (c, f, t) =>
      admin.from('bonus_scores').select('entry_id, bonus_type, points_earned')
        .in('entry_id', c).in('bonus_type', PODIUM_TYPES).order('entry_id').range(f, t))
    const storedByEntry = new Map<string, Set<string>>()
    for (const b of bonusRows) {
      const s = storedByEntry.get(b.entry_id) ?? new Set<string>()
      s.add(b.bonus_type)
      storedByEntry.set(b.entry_id, s)
    }

    const tally: Record<string, { computed: number; stored: number; toAdd: number; toRemove: number; pointsToAdd: number }> = {}
    for (const t of PODIUM_TYPES) tally[t] = { computed: 0, stored: 0, toAdd: 0, toRemove: 0, pointsToAdd: 0 }

    for (const e of submitted) {
      const rows = predsByEntry.get(e.entry_id) ?? []
      if (rows.length === 0) continue
      const predictionMap = new Map(rows.map((p: any) => [p.match_id, {
        home: p.predicted_home_score, away: p.predicted_away_score,
        homePso: p.predicted_home_pso ?? null, awayPso: p.predicted_away_pso ?? null,
        winnerTeamId: p.predicted_winner_team_id ?? null,
      }]))
      const settings = settingsByPool.get(poolByMember.get(e.member_id))
      if (!settings) continue

      const bonuses = calculateAllBonusPoints({
        memberId: e.entry_id,
        memberPredictions: predictionMap as any,
        matches: matches as any,
        teams: teamsData as any,
        conductData: (conduct ?? []) as any,
        settings: settings as any,
        tournamentAwards: (awards as any) ?? null,
        predictionMode: mode as any,
      })

      const computed = new Map(bonuses.filter(b => PODIUM_TYPES.includes(b.bonus_type)).map(b => [b.bonus_type, b.points_earned]))
      const stored = storedByEntry.get(e.entry_id) ?? new Set<string>()
      for (const t of PODIUM_TYPES) {
        const has = computed.has(t)
        if (has) tally[t].computed++
        if (stored.has(t)) tally[t].stored++
        if (has && !stored.has(t)) { tally[t].toAdd++; tally[t].pointsToAdd += computed.get(t)! }
        if (!has && stored.has(t)) tally[t].toRemove++
      }
    }

    console.log(`===== ${mode.toUpperCase()} — ${submitted.length} submitted entries, ${poolIds.length} pools =====`)
    for (const t of PODIUM_TYPES) {
      const r = tally[t]
      console.log(
        `  ${t.padEnd(22)} stored=${String(r.stored).padStart(4)}  fixed-engine=${String(r.computed).padStart(4)}` +
        `  ADD=${String(r.toAdd).padStart(4)} (+${r.pointsToAdd} pts)  REMOVE=${String(r.toRemove).padStart(3)}`
      )
    }
    console.log('')
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
