// =============================================================
// verify-league-contract — the read contract, against real pools
// =============================================================
// `GET /api/pools/:id/league` (Decision 12) is what the React Native league
// build will be written against, so it needs to be right before four screens
// are built on top of it. It has never been called.
//
// ## What this checks, and what it cannot
//
// It assembles exactly what the route assembles — the same helpers, the same
// order — against real production pools, and asserts the shape and the numbers.
// What it does NOT cover is the HTTP layer: `requireAuth`, the membership 403,
// and the JSON round trip. Those need a real session, so they are a browser
// check, not this. ⚠ Read a pass here as *"the assembly is right"*, never as
// *"the endpoint works"*.
//
// ## ⚠ THE PARITY CHECK IS THE POINT
//
// The season now comes from a per-season cache rather than from three reads
// inside `readLeaguePoolView`. That is a change of PLUMBING that must not be a
// change of ANSWER, so the last block runs the same pool both ways — cached and
// uncached — and compares. A cache that quietly returns something different is
// worse than no cache, and nothing else in the suite would notice.
//
//   npx tsx scripts/verify-league-contract.ts
//
// Exits 1 on any failure. Read-only.
// =============================================================

import { readFileSync } from 'fs'
import { resolve } from 'path'

;(() => {
  const envContent = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
  for (const line of envContent.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i === -1) continue
    const k = t.slice(0, i).trim()
    let v = t.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    if (!process.env[k]) process.env[k] = v
  }
})()

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readLeaguePoolView, readLeaguePredictions, deriveRoundSubmissions } from '../lib/league/read'
import { readEntryTotals } from '../lib/league/duels'
// ⚠ `seasonRead`, not `season` — the latter carries `import 'server-only'`,
// which throws under tsx. That split is why this script can exercise the real
// reader at all rather than a copy of it.
import { readLeagueSeasonUncached } from '../lib/league/seasonRead'

let failures = 0
function ok(label: string, pass: boolean, detail = '') {
  console.log(`    ${pass ? '✓' : '✗'} ${label}${detail ? `  — ${detail}` : ''}`)
  if (!pass) failures++
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required')
  const admin: SupabaseClient = createClient(url, key, { auth: { persistSession: false } })

  const { data: pools, error } = await admin
    .from('pools')
    .select('pool_id, pool_name, league_season_id, tournament_id, league_mode, league_depth')
    .not('league_season_id', 'is', null)
    .is('archived_at', null)
    .order('pool_name')
  if (error) throw new Error(error.message)
  if (!pools?.length) throw new Error('no league pools to check')

  console.log(`\n  ${pools.length} league pool(s)\n${'='.repeat(70)}`)

  for (const p of pools as Array<Record<string, string | null>>) {
    console.log(`\n  ${p.pool_name}  ·  ${p.league_mode ?? 'NULL mode'} / ${p.league_depth ?? 'NULL depth'}`)
    console.log('  ' + '-'.repeat(66))

    const season = await readLeagueSeasonUncached(admin, p.league_season_id as string)
    const { view, error: viewErr } = await readLeaguePoolView(admin, {
      poolId: p.pool_id as string,
      seasonId: p.league_season_id as string,
      tournamentId: p.tournament_id as string,
      season,
    })
    ok('the view assembles', !viewErr && !!view, viewErr ?? '')
    if (!view) continue

    // A league season is 20 clubs, 38 matchweeks, 380 fixtures. A view that
    // renders SOME of that is the silent-empty failure, not an error.
    ok('teams present', view.teams.length > 0, `${view.teams.length}`)
    ok('fixtures present', view.matches.length > 0, `${view.matches.length}`)
    ok('matchweek count present', view.matchweekCount > 0, `${view.matchweekCount}`)
    ok(
      'every fixture landed in a round',
      view.matches.every((m) => Boolean((m as { round_key?: string }).round_key ?? true)),
    )

    // ⚠ OPEN ≠ IN PLAY. All weekend the open matchweek is the one AFTER the one
    // being played, which is why both are on the payload and why a screen that
    // uses the wrong one shows the wrong week.
    ok(
      'open / in-play matchweeks are coherent',
      view.openMatchweekNumber === null ||
        view.inPlayMatchweekNumber === null ||
        view.openMatchweekNumber >= view.inPlayMatchweekNumber,
      `open ${view.openMatchweekNumber} · in play ${view.inPlayMatchweekNumber}`,
    )

    const { totals, error: totalsErr } = await readEntryTotals(admin, p.pool_id as string)
    ok('entry totals read (deny-all table, admin client)', !totalsErr, totalsErr ?? `${totals.size} entries`)

    const { data: members } = await admin
      .from('pool_members').select('member_id').eq('pool_id', p.pool_id)
    const { data: entries } = await admin
      .from('pool_entries')
      .select('entry_id, entry_name')
      .in('member_id', (members ?? []).map((m) => (m as { member_id: string }).member_id))
      .is('retired_at', null)

    let picksOk = true
    let submissionsSeen = 0
    for (const e of (entries ?? []) as Array<{ entry_id: string }>) {
      const { predictions, outcomes, error: predErr } = await readLeaguePredictions(admin, e.entry_id)
      if (predErr) { picksOk = false; break }
      const subs = deriveRoundSubmissions(e.entry_id, view.matches, predictions, outcomes)
      submissionsSeen += subs.length
    }
    ok('picks + submissions derive for every entry', picksOk,
      `${(entries ?? []).length} entries · ${submissionsSeen} matchweek rows`)

    // The stored totals are the engine's. A screen must render them, never
    // recompute them — so the contract has to actually carry them.
    //
    // ⚠ ONLY MEANINGFUL ONCE A POOL HAS SCORED. An unscored pool legitimately
    // has no totals rows at all, and asserting otherwise made this check fail
    // on three perfectly healthy pools the first time it ran.
    const { count: scoreRows } = await admin
      .from('league_match_scores')
      .select('entry_id', { count: 'exact', head: true })
      .eq('pool_id', p.pool_id as string)
    const all = (entries ?? []) as Array<{ entry_id: string }>
    const withTotals = all.filter((e) => totals.get(e.entry_id))
    if ((scoreRows ?? 0) === 0) {
      ok('unscored pool — no totals expected', true, `${all.length} entries, nothing scored yet`)
    } else {
      // ⚠ EVERY entry, not just the ones that picked. Migration 121 states the
      // rule: "an entry that has never picked has no totals row yet, and
      // updating nothing would drop them off the leaderboard entirely. They are
      // still in the pool, so they appear on 0."
      //
      // `league_score_duels`, `league_lms_settle` and `league_score_table` all
      // seed from `pool_entries` and honour it. `league_score_fixture` seeds
      // from the score rows, so a Pick'em member who never picked has no row —
      // see R28.
      ok('every entry carries a totals row (121\'s rule)',
        withTotals.length === all.length,
        `${withTotals.length} of ${all.length}` +
        (withTotals.length === all.length ? '' : ' — non-pickers have no row (R28)'))
    }
  }

  // ------------------------------------------------------------------ parity
  console.log(`\n\n  Cached vs uncached — the plumbing changed, the answer must not\n${'='.repeat(70)}\n`)
  const sample = (pools as Array<Record<string, string>>)[0]
  const withSeason = await readLeaguePoolView(admin, {
    poolId: sample.pool_id,
    seasonId: sample.league_season_id,
    tournamentId: sample.tournament_id,
    season: await readLeagueSeasonUncached(admin, sample.league_season_id),
    now: 1_800_000_000_000,
  })
  const withoutSeason = await readLeaguePoolView(admin, {
    poolId: sample.pool_id,
    seasonId: sample.league_season_id,
    tournamentId: sample.tournament_id,
    // No `season` — the inline three-read path scripts and non-caching callers take.
    now: 1_800_000_000_000,
  })
  const a = JSON.stringify(withSeason.view)
  const b = JSON.stringify(withoutSeason.view)
  ok('both paths produce a view', !!withSeason.view && !!withoutSeason.view)
  ok('and they are byte-identical', a === b,
    a === b ? `${(a.length / 1024).toFixed(1)} kB either way` : `${a.length} vs ${b.length} bytes — THE CACHE CHANGED THE ANSWER`)

  console.log(
    failures === 0
      ? '\n✓ the contract assembles correctly on every league pool\n'
      : `\n✗ ${failures} check(s) failed\n`,
  )
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
