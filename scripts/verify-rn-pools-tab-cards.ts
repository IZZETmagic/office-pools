// =============================================================
// VERIFY: the RN Pools tab card names the right game and the right competition
// =============================================================
// READ ONLY. Runs the code the phone's Pools tab now runs — mobile's
// `getModeName` / `getModeChip`, the competition colour behind the rail, and
// the `matchesType` predicate behind the Type filter — over EVERY pool in the
// database, and asserts the three things that were false before 2026-09-05.
//
// The bugs this guards, all silent, all measured at 17 production pools:
//
//   1. `MODE_LABEL[mode] ?? 'Pool'` over a three-entry table of World Cup
//      bracket modes. Every league pool wore a badge reading "Pool".
//   2. `MODE_GRADIENT[mode] ?? MODE_GRADIENT.full_tournament`. Every league
//      pool's bar — and its progress ring — rendered in the WORLD CUP'S BLUE.
//   3. `p.predictionMode !== filters.type` for a filter whose options were the
//      same three modes. No selection could show a league pool, and every
//      selection hid all of them.
//
// ⚠ IT PROVES THE DATA, NOT THE PIXELS. That the rail draws, and that the World
// Cup's <mask> renders under react-native-svg, are only provable on a device.
//
//   npx tsx scripts/verify-rn-pools-tab-cards.ts
// =============================================================

import { readFileSync } from 'fs'
import { resolve } from 'path'
;(() => {
  const env = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
  for (const line of env.split('\n')) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue
    const i = t.indexOf('='); if (i === -1) continue
    const k = t.slice(0, i).trim(); let v = t.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (!process.env[k]) process.env[k] = v
  }
})()

import { createAdminClient } from '../lib/supabase/server'
// ⚠ MOBILE'S OWN COPY, deliberately — importing the web's would prove the web
// works and say nothing about the phone. The two are held equal by
// lib/design/__tests__/competitionMirror.guard.test.ts; this proves the copy
// the phone actually runs produces the right answer for real rows.
import { getModeChip, getModeName, isLeaguePoolMode } from '../mobile/lib/design/poolMode'
import { getCompetitionColor, UNTHEMED_COMPETITION } from '../lib/design/competitionColor'

const admin = createAdminClient()
let failures = 0
const bad = (m: string) => { failures++; console.log(`  ✗ ${m}`) }

const WORLD_CUP_BLUE = '#3B6EFF'

// The Type filter's values, mirroring TypeFilter in
// mobile/components/pools/PoolsFilterBar.tsx.
const TYPE_VALUES = [
  'full_tournament', 'progressive', 'bracket_picker',
  'pickem', 'showdown', 'last_man_standing', 'table',
] as const
const LEAGUE_TYPE_VALUES = new Set<string>(['pickem', 'showdown', 'last_man_standing', 'table'])

/** Mirrors `matchesType` in mobile/app/(tabs)/pools.tsx. */
function matchesType(
  pool: { predictionMode: string | null; leagueMode: string | null },
  type: string,
): boolean {
  if (LEAGUE_TYPE_VALUES.has(type)) {
    if (!isLeaguePoolMode(pool.predictionMode)) return false
    return (pool.leagueMode ?? 'pickem') === type
  }
  return pool.predictionMode === type
}

async function main() {
  const { data: pools, error } = await admin
    .from('pools')
    .select('pool_id, pool_name, prediction_mode, league_mode, tournament_id')
    .order('created_at', { ascending: false })
    .limit(5000)
  if (error) throw error
  if (!pools?.length) throw new Error('no pools returned')
  // ⚠ An exact 1,000 would mean PostgREST truncated us — see the row-cap rule.
  if (pools.length === 1000) throw new Error('exactly 1,000 rows: PostgREST almost certainly truncated')

  const tids = Array.from(new Set(pools.map((p) => p.tournament_id)))
  const { data: tours, error: tErr } = await admin
    .from('tournaments')
    .select('tournament_id, name, external_league_id')
    .in('tournament_id', tids)
  if (tErr) throw tErr
  const leagueIdOf = new Map(tours!.map((t) => [t.tournament_id, t.external_league_id as number | null]))
  const tourName = new Map(tours!.map((t) => [t.tournament_id, t.name as string]))

  console.log(`\n${pools.length} pools, ${tids.length} tournaments\n`)

  const shown = new Map<string, string[]>()
  let leagueCount = 0

  for (const p of pools) {
    const summary = { predictionMode: p.prediction_mode, leagueMode: p.league_mode }
    const label = getModeName(p.prediction_mode, p.league_mode)
    const chip = getModeChip(p.prediction_mode, p.league_mode, false)
    const leagueId = leagueIdOf.get(p.tournament_id) ?? null
    const railColor = getCompetitionColor(leagueId)
    const isLeague = isLeaguePoolMode(p.prediction_mode)
    if (isLeague) leagueCount++

    // ---- 1. the pill never falls back to a non-label ----
    if (label === 'Pool' || label === p.prediction_mode) {
      bad(`${p.pool_name}: pill reads "${label}" — the old ?? fallback is back`)
    }

    // ---- 2. a league pool never wears the World Cup's colour ----
    if (isLeague && railColor.toUpperCase() === WORLD_CUP_BLUE) {
      bad(`${p.pool_name}: league pool but the rail/ring is World Cup blue`)
    }
    if (isLeague && railColor === UNTHEMED_COMPETITION) {
      bad(`${p.pool_name}: league pool on "${tourName.get(p.tournament_id)}" has no competition colour (external_league_id ${leagueId})`)
    }
    if (chip.base.toUpperCase() === WORLD_CUP_BLUE && isLeague) {
      bad(`${p.pool_name}: league pool takes full_tournament's identity colour`)
    }

    // ---- 3. exactly one Type value finds this pool ----
    const hits = TYPE_VALUES.filter((t) => matchesType(summary, t))
    if (hits.length !== 1) {
      bad(`${p.pool_name} [${p.prediction_mode}/${p.league_mode ?? 'NULL'}]: ${hits.length} Type filter values match (expected exactly 1)${hits.length ? ` — ${hits.join(', ')}` : ''}`)
    }

    const key = `${label}  ·  ${tourName.get(p.tournament_id)}  ·  rail ${railColor} · pill ${chip.base}`
    if (!shown.has(key)) shown.set(key, [])
    shown.get(key)!.push(p.pool_name)
  }

  console.log('What each kind of pool now renders as:\n')
  for (const [key, names] of Array.from(shown.entries()).sort()) {
    console.log(`  ${String(names.length).padStart(4)}×  ${key}`)
    if (names.length <= 4) for (const n of names) console.log(`         · ${n}`)
  }

  console.log(`\n  league pools checked: ${leagueCount}`)
  if (leagueCount === 0) bad('no league pools found — this script proved nothing')

  console.log(failures === 0 ? '\n✓ all checks passed\n' : `\n✗ ${failures} failed\n`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
