// =============================================================
// VERIFY: a league pool's card has real numbers on it
// =============================================================
// READ ONLY. Runs the code the two list surfaces run — readEntryScoring with
// the source their `sourceFor` now resolves, and readLeagueCardFacts — and
// prints the four tiles, the pill and the clock for every league pool.
//
// The bug this guards: both pages hand-inlined the source as shadow-or-prod, so
// a league pool was read out of `pool_entries` / `predictions` / `match_scores`
// / `entry_xp_state`, all of which are legitimately EMPTY for one. Empty is a
// valid PostgREST result, so every card rendered 0 points, rank "—", grey form
// dots and Level 1 without a single error anywhere.
//
//   npx tsx scripts/verify-league-pool-cards.ts
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
import { readEntryScoring, readRecentForm } from '../lib/scoring/readSource'
import { readLeagueCardFacts } from '../lib/league/poolCards'
import { getModeName, getPoolStripe } from '../lib/design/poolMode'
import { hasCompetitionColor } from '../lib/design/competitionColor'
import { pickBestEntry } from '../lib/bestEntry'

const admin = createAdminClient()
let failures = 0
const bad = (m: string) => { failures++; console.log(`    ✗ ${m}`) }

async function main() {
  const { data: pools, error } = await admin
    .from('pools')
    .select('pool_id, pool_name, prediction_mode, league_mode, league_season_id, league_table_lock_at, prediction_deadline, archived_at, tournament_id')
    .eq('prediction_mode', 'league_pickem')
    .is('archived_at', null)
    .order('pool_name')
  if (error) throw error

  const rows = (pools ?? []) as Array<Record<string, string | null>>
  console.log(`\n${rows.length} live league pools\n`)

  // The card stripe is the competition's brand colour, resolved from
  // `tournaments.external_league_id` — the same key CreatePoolModal uses for the
  // crest. A pool whose tournament has no provider id renders the unthemed
  // slate, which is a signal to add a row to competitionColor.ts, not a crash.
  const leagueIdByTournament = new Map<string, number>()
  {
    const ids = Array.from(new Set(rows.map((r) => r.tournament_id).filter(Boolean))) as string[]
    const { data: comps } = await admin
      .from('tournaments')
      .select('tournament_id, external_league_id')
      .in('tournament_id', ids)
    for (const c of (comps ?? []) as Array<{ tournament_id: string; external_league_id: number | null }>) {
      if (c.external_league_id != null) leagueIdByTournament.set(c.tournament_id, c.external_league_id)
    }
  }

  // Every entry per pool, then scoring for all of them, then the best — the
  // order the pages use. ⚠ The scoring map has to exist BEFORE the pick: a
  // league entry's `pool_entries.current_rank` is NULL, so picking without it
  // returns whichever row the database happened to return first.
  const perPool = []
  for (const p of rows) {
    const { data: ents } = await admin
      .from('pool_entries')
      .select('entry_id, current_rank, scored_total_points, pool_members!inner(pool_id)')
      .eq('pool_members.pool_id', p.pool_id as string)
    perPool.push({ p, entries: (ents ?? []) as Array<{ entry_id: string; current_rank: number | null; scored_total_points: number | null }> })
  }
  const leagueScoring = await readEntryScoring(
    admin,
    perPool.flatMap((x) => x.entries.map((e) => e.entry_id)),
    'league',
  )
  const withEntries = perPool.map(({ p, entries }) => ({
    p,
    entries,
    best: pickBestEntry(entries, leagueScoring) ?? entries[0] ?? null,
  }))

  const facts = await readLeagueCardFacts(
    admin,
    withEntries.map(({ p, best }) => ({
      poolId: p.pool_id as string,
      seasonId: p.league_season_id,
      leagueMode: p.league_mode,
      tableLockAt: p.league_table_lock_at,
      entryId: best?.entry_id ?? null,
    })),
  )

  const scoring = leagueScoring

  let anyWithPoints = 0
  for (const { p, entries, best } of withEntries) {
    const f = facts.get(p.pool_id as string)
    const s = best ? scoring.get(best.entry_id) : undefined
    const form = best ? await readRecentForm(admin, best.entry_id, 'league', 5) : []
    const pill = getModeName('league_pickem', p.league_mode)
    const pts = s?.scored_total_points ?? 0
    if (pts > 0) anyWithPoints++

    console.log(`── ${p.pool_name}   [${pill}]`)
    console.log(`   Points ${pts}   Rank ${s?.current_rank ?? '—'} of ${entries.length}   MW ${f?.openMatchweekNumber ?? '—'} of ${f?.matchweekCount ?? '?'}   Form ${form.length ? form.join(',') : '(none)'}`)
    console.log(`   pill "${pill}"   picks ${f?.madePicks ?? 0}/${f?.totalPicks ?? 0}   submitted=${f?.hasSubmitted}`)
    console.log(`   clock ${f?.deadlineAt ?? 'none'}   (pools.prediction_deadline was ${p.prediction_deadline})`)

    const leagueId = leagueIdByTournament.get(p.tournament_id as string) ?? null
    const [top, base] = getPoolStripe({ externalLeagueId: leagueId })
    console.log(`   stripe ${top} \u2192 ${base}   (league id ${leagueId ?? 'none'})`)
    if (!hasCompetitionColor(leagueId)) {
      bad(`${p.pool_name}: no competition colour \u2014 add league id ${leagueId} to lib/design/competitionColor.ts`)
    }

    // --- assertions ---
    if (pill === 'league_pickem') bad(`${p.pool_name}: the pill is still the raw column value`)
    if (f?.deadlineAt && f.deadlineAt === p.prediction_deadline) {
      bad(`${p.pool_name}: the clock is still the season end`)
    }
    if (f && f.matchweekCount === 0) bad(`${p.pool_name}: no matchweeks read for its season`)
    if (f && f.openMatchweekNumber !== null && f.totalPicks === 0 && p.league_mode === 'pickem') {
      bad(`${p.pool_name}: an open matchweek with zero fixtures to pick`)
    }
  }

  // The headline: at least one pool must now show points that pool_entries does
  // not have. Without this the whole change is unverified — every number above
  // could be a zero that merely looks tidier.
  console.log('')
  if (anyWithPoints === 0) bad('no league pool reported points — the league read is not landing')
  else console.log(`    ✓ ${anyWithPoints} pool(s) report points from league_entry_totals`)

  const stale = withEntries.filter((w) => (w.best?.scored_total_points ?? 0) > 0)
  if (stale.length > 0) bad(`${stale.length} league entries have pool_entries.scored_total_points > 0 — the two sources can disagree`)
  else console.log('    ✓ no league entry carries World Cup totals, so there is one source per pool')

  console.log(failures === 0 ? '\n✓ all checks passed\n' : `\n✗ ${failures} failed\n`)
  process.exit(failures === 0 ? 0 : 1)
}
main().catch((e) => { console.error(e); process.exit(1) })
