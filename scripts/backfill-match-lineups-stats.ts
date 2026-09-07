/**
 * One-off backfill of `match_lineups` and `match_team_stats` for league fixtures
 * that were already played when migration 139 landed.
 *
 * WHY THIS EXISTS — and it is not optional
 *   Neither sync gate fires retroactively. Statistics ride step 7b4's `changed`
 *   gate, and a fixture that finished last week will never change again.
 *   Line-ups ride 7b5's WINDOW gate, and that window closed hours after
 *   kickoff. So every fixture with a result today would show two permanently
 *   empty tabs — which is precisely the "a tab that is always there and never
 *   has anything in it" failure `MatchTabBar` refuses to ship.
 *
 *   This is 136's `backfill-match-events.ts` for 139's two tables, and it is
 *   deliberately its near-twin: same env loader, same flags, same replace-all,
 *   same "import the mapper, never reimplement it" rule.
 *
 * WHAT IT WRITES
 *   `match_lineups` and `match_team_stats` only, replace-all per fixture.
 *   Never a scoring table — neither of these has a scoring consumer by design,
 *   and `match_conduct` remains the only card count anything scores from.
 *
 * ⚠ IT USES THE SAME MAPPERS AS THE SYNC. `lineupsToRows` and `statisticsToRows`
 *   are imported rather than reimplemented, so a backfilled fixture and a
 *   live-synced one cannot disagree — the entire failure mode of a one-off
 *   script that "just does the same thing".
 *
 * ⚠ A FIXTURE WITH NO LINE-UP IS NORMAL, NOT A FAILURE. The provider does not
 *   hold line-ups for every historical fixture, and an empty response writes
 *   nothing rather than an empty row. Re-running later picks up anything the
 *   feed has since published.
 *
 * COST
 *   TWO calls per completed fixture — one /fixtures/lineups, one
 *   /fixtures/statistics. On 2026-09-07 that is roughly 2 × the completed
 *   fixture count across five leagues, against a 7,500/day plan. Sequential
 *   with a small delay; there is nothing to gain by racing the rate limit.
 *   Use --dry-run first, and --limit to take a toe in the water.
 *
 * Usage:
 *   npx tsx scripts/backfill-match-lineups-stats.ts --dry-run
 *   npx tsx scripts/backfill-match-lineups-stats.ts --league 39 --limit 5
 *   npx tsx scripts/backfill-match-lineups-stats.ts
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'

// --- .env.local loader (mirrors the other runner scripts) -------------------
const envPath = resolve(process.cwd(), '.env.local')
try {
  const envContent = readFileSync(envPath, 'utf8')
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
} catch {
  console.error('Could not read .env.local')
  process.exit(1)
}

import { createAdminClient } from '@/lib/supabase/server'
import { getFixtureLineups, getFixtureStatistics } from '@/lib/integrations/apiFootball/client'
import { lineupsToRows, statisticsToRows } from '@/lib/integrations/apiFootball/mappers'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const leagueArg = args.includes('--league') ? Number(args[args.indexOf('--league') + 1]) : null
const limitArg = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : null

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

type FixtureRow = {
  fixture_id: string
  external_fixture_id: string
  season_id: string
  home_club_id: string
}

async function main() {
  const admin = createAdminClient()

  const { data: seasonRows, error: sErr } = await admin
    .from('league_seasons')
    .select('season_id, competition_name, season_label, external_league_id, external_season')
  if (sErr) throw sErr
  const seasons = (seasonRows ?? []).filter(
    (s: { external_league_id: number }) => leagueArg === null || s.external_league_id === leagueArg,
  ) as Array<{
    season_id: string
    competition_name: string
    season_label: string
    external_league_id: number
    external_season: number
  }>

  let totalCalls = 0
  let totalFixtures = 0
  let lineupRows = 0
  let statRows = 0
  let noLineup = 0
  let noStats = 0
  const failures: Array<{ fixture: string; reason: string }> = []

  for (const season of seasons) {
    const { data: fxRows, error: fErr } = await admin
      .from('league_fixtures')
      .select('fixture_id, external_fixture_id, season_id, home_club_id')
      .eq('season_id', season.season_id)
      .eq('is_completed', true)
      .order('kickoff_at', { ascending: true })
      .range(0, 999)
    if (fErr) throw fErr
    let fixtures = (fxRows ?? []) as FixtureRow[]
    if (limitArg !== null) fixtures = fixtures.slice(0, limitArg)
    if (fixtures.length === 0) continue

    // ⚠ THE SIDE IS COMPUTED AGAINST THE HOME CLUB'S PROVIDER ID, joined here,
    // never matched by team name. `/lineups` abbreviates names where `/events`
    // does not, so a name match silently mis-sides an entire line-up.
    const { data: clubRows, error: cErr } = await admin
      .from('league_clubs')
      .select('club_id, external_club_id')
      .eq('season_id', season.season_id)
      .range(0, 999)
    if (cErr) throw cErr
    const extByClub = new Map(
      ((clubRows ?? []) as Array<{ club_id: string; external_club_id: number }>).map((c) => [
        c.club_id,
        c.external_club_id,
      ]),
    )

    console.log(
      `\n${season.competition_name} ${season.season_label} — ${fixtures.length} completed fixture(s)`,
    )

    for (const fx of fixtures) {
      totalFixtures++
      const homeExt = extByClub.get(fx.home_club_id)
      if (homeExt === undefined) {
        failures.push({ fixture: fx.external_fixture_id, reason: 'home club has no provider id' })
        continue
      }
      const opts = { fixtureId: fx.fixture_id, homeExternalTeamId: homeExt }

      // ---- line-ups --------------------------------------------------------
      let lRows: ReturnType<typeof lineupsToRows> = []
      try {
        lRows = lineupsToRows(await getFixtureLineups(Number(fx.external_fixture_id)), opts)
        totalCalls++
      } catch (e) {
        failures.push({ fixture: fx.external_fixture_id, reason: `lineups: ${String(e)}` })
      }
      if (lRows.length === 0) noLineup++

      // ---- statistics ------------------------------------------------------
      let sRows: ReturnType<typeof statisticsToRows> = []
      try {
        sRows = statisticsToRows(await getFixtureStatistics(Number(fx.external_fixture_id)), opts)
        totalCalls++
      } catch (e) {
        failures.push({ fixture: fx.external_fixture_id, reason: `statistics: ${String(e)}` })
      }
      if (sRows.length === 0) noStats++

      if (dryRun) {
        const xi = lRows.map((r) => r.players.filter((p) => p.starter).length).join('/')
        const poss = sRows.map((r) => r.possession_pct ?? '—').join('/')
        console.log(
          `  ${fx.external_fixture_id}: lineups ${lRows.length} side(s)${xi ? ` (XI ${xi})` : ''}` +
            `, stats ${sRows.length} side(s)${sRows.length ? ` (poss ${poss})` : ''}`,
        )
        lineupRows += lRows.length
        statRows += sRows.length
        await sleep(120)
        continue
      }

      // ⚠ REPLACE-ALL, the same as the sync, so re-running is a no-op rather
      // than a doubling — and the unique (fixture_id, side) indexes would fail
      // loudly if it were not.
      //
      // ⚠ AN EMPTY RESULT DELETES NOTHING. The provider not holding a line-up
      // for an old fixture must not wipe one we already have.
      if (lRows.length > 0) {
        const { error: delErr } = await admin
          .from('match_lineups')
          .delete()
          .eq('fixture_id', fx.fixture_id)
        if (delErr) {
          failures.push({ fixture: fx.external_fixture_id, reason: `lineup delete: ${delErr.message}` })
        } else {
          const { error: insErr } = await admin.from('match_lineups').insert(lRows)
          if (insErr) {
            failures.push({ fixture: fx.external_fixture_id, reason: `lineup insert: ${insErr.message}` })
          } else {
            lineupRows += lRows.length
          }
        }
      }

      if (sRows.length > 0) {
        const { error: delErr } = await admin
          .from('match_team_stats')
          .delete()
          .eq('fixture_id', fx.fixture_id)
        if (delErr) {
          failures.push({ fixture: fx.external_fixture_id, reason: `stats delete: ${delErr.message}` })
        } else {
          const { error: insErr } = await admin.from('match_team_stats').insert(sRows)
          if (insErr) {
            failures.push({ fixture: fx.external_fixture_id, reason: `stats insert: ${insErr.message}` })
          } else {
            statRows += sRows.length
          }
        }
      }

      console.log(
        `  ${fx.external_fixture_id}: ${lRows.length} line-up row(s), ${sRows.length} stat row(s)`,
      )
      await sleep(120)
    }
  }

  console.log(
    `\n${dryRun ? 'DRY RUN — ' : ''}${totalFixtures} fixture(s), ${totalCalls} api call(s)\n` +
      `  match_lineups     ${lineupRows} row(s)   (${noLineup} fixture(s) the feed has no line-up for)\n` +
      `  match_team_stats  ${statRows} row(s)   (${noStats} fixture(s) the feed has no statistics for)`,
  )
  if (failures.length > 0) {
    console.log(`\n${failures.length} failure(s):`)
    for (const f of failures.slice(0, 20)) console.log(`  ${f.fixture}: ${f.reason}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
