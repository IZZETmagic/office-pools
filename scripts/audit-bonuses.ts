/**
 * FULL BONUS AUDIT — READ-ONLY. Generalises scripts/audit-podium.ts from the three
 * podium rows to EVERY bonus type the engine can emit, and compares POINTS as well
 * as presence.
 *
 * Replays lib/bonusCalculation.calculateAllBonusPoints over every submitted classic
 * entry and diffs the full bonus set it would write against what bonus_scores holds.
 * Writes NOTHING.
 *
 *   npx tsx <this> [--mode=progressive] [--limit=N]
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

async function pageAllChunked(ids: string[], q: (chunk: string[], from: number, to: number) => any, size = 1000) {
  const out: any[] = []
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200)
    let off = 0
    for (;;) {
      // Long sweeps hit transient `fetch failed` blips — retry rather than lose the run.
      let data: any = null, error: any = null
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          ;({ data, error } = await q(chunk, off, off + size - 1))
          if (!error) break
        } catch (e) {
          error = e
        }
        await new Promise(r => setTimeout(r, 500 * 2 ** attempt))
      }
      if (error) throw new Error(error.message ?? String(error))
      if (!data || data.length === 0) break
      out.push(...data)
      off += data.length
      if (data.length < size) break
    }
  }
  return out
}

const keyOf = (b: { bonus_type: string; related_group_letter?: string | null; related_match_id?: string | null }) =>
  `${b.bonus_type}|${(b.related_group_letter ?? '').trim()}|${b.related_match_id ?? ''}`

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

  for (const mode of modes) {
    const { data: pools } = await admin.from('pools').select('pool_id').eq('prediction_mode', mode)
    const poolIds = (pools ?? []).map((p: any) => p.pool_id).slice(0, limit)

    const settingsRows = await pageAllChunked(poolIds, (c, f, t) => admin.from('pool_settings').select('*').in('pool_id', c).range(f, t))
    const settingsByPool = new Map(settingsRows.map((s: any) => [s.pool_id, { ...DEFAULT_POOL_SETTINGS, ...s }]))

    const members = await pageAllChunked(poolIds, (c, f, t) => admin.from('pool_members').select('member_id, pool_id').in('pool_id', c).range(f, t))
    const poolByMember = new Map(members.map((m: any) => [m.member_id, m.pool_id]))

    const entries = await pageAllChunked(members.map((m: any) => m.member_id), (c, f, t) =>
      admin.from('pool_entries').select('entry_id, member_id, has_submitted_predictions').in('member_id', c).range(f, t))

    let submitted = entries.filter((e: any) => e.has_submitted_predictions)
    if (mode === 'progressive') {
      const ers = await pageAllChunked(entries.map((e: any) => e.entry_id), (c, f, t) =>
        admin.from('entry_round_submissions').select('id, entry_id').in('entry_id', c).eq('has_submitted', true).order('id').range(f, t))
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
      admin.from('bonus_scores').select('entry_id, bonus_type, bonus_category, related_group_letter, related_match_id, points_earned')
        .in('entry_id', c).order('entry_id').range(f, t))
    const storedByEntry = new Map<string, Map<string, number>>()
    for (const b of bonusRows) {
      const m = storedByEntry.get(b.entry_id) ?? new Map<string, number>()
      m.set(keyOf(b), (m.get(keyOf(b)) ?? 0) + b.points_earned)
      storedByEntry.set(b.entry_id, m)
    }

    type T = { stored: number; computed: number; add: number; remove: number; ptsDiff: number; addPts: number; removePts: number }
    const tally: Record<string, T> = {}
    const bump = (t: string): T => (tally[t] ??= { stored: 0, computed: 0, add: 0, remove: 0, ptsDiff: 0, addPts: 0, removePts: 0 })
    const offenders: string[] = []
    let entriesWithDiff = 0

    for (const e of submitted) {
      const rows = predsByEntry.get(e.entry_id) ?? []
      const settings = settingsByPool.get(poolByMember.get(e.member_id))
      if (!settings) continue

      const predictionMap = new Map(rows.map((p: any) => [p.match_id, {
        home: p.predicted_home_score, away: p.predicted_away_score,
        homePso: p.predicted_home_pso ?? null, awayPso: p.predicted_away_pso ?? null,
        winnerTeamId: p.predicted_winner_team_id ?? null,
      }]))

      // Mirrors recalculate.ts: an entry with no prediction rows is not scored.
      const computedList = rows.length === 0 ? [] : calculateAllBonusPoints({
        memberId: e.entry_id,
        memberPredictions: predictionMap as any,
        matches: matches as any,
        teams: teamsData as any,
        conductData: (conduct ?? []) as any,
        settings: settings as any,
        tournamentAwards: (awards as any) ?? null,
        predictionMode: mode as any,
      })

      const computed = new Map<string, number>()
      for (const b of computedList) computed.set(keyOf(b as any), (computed.get(keyOf(b as any)) ?? 0) + b.points_earned)
      const stored = storedByEntry.get(e.entry_id) ?? new Map<string, number>()

      let entryDirty = false
      for (const k of new Set([...computed.keys(), ...stored.keys()])) {
        const type = k.split('|')[0]
        const t = bump(type)
        const c = computed.get(k)
        const s = stored.get(k)
        if (c != null) t.computed++
        if (s != null) t.stored++
        if (c != null && s == null) { t.add++; t.addPts += c; entryDirty = true }
        if (c == null && s != null) { t.remove++; t.removePts += s; entryDirty = true }
        if (c != null && s != null && c !== s) { t.ptsDiff += c - s; entryDirty = true }
      }
      if (entryDirty) {
        entriesWithDiff++
        if (offenders.length < 15) offenders.push(e.entry_id)
      }
    }

    console.log(`===== ${mode.toUpperCase()} — ${submitted.length} submitted entries, ${poolIds.length} pools =====`)
    const types = Object.keys(tally).sort()
    let anyBad = false
    for (const t of types) {
      const r = tally[t]
      const bad = r.add || r.remove || r.ptsDiff
      if (bad) anyBad = true
      console.log(
        `  ${bad ? '!!' : 'ok'} ${t.padEnd(28)} stored=${String(r.stored).padStart(5)} engine=${String(r.computed).padStart(5)}` +
        `  ADD=${String(r.add).padStart(4)}(+${r.addPts})  REMOVE=${String(r.remove).padStart(4)}(-${r.removePts})  PTS_DELTA=${r.ptsDiff}`
      )
    }
    console.log(`  entries with any difference: ${entriesWithDiff}${anyBad && offenders.length ? `  e.g. ${offenders.slice(0, 5).join(', ')}` : ''}`)
    console.log('')
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
