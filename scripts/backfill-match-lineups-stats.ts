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
 *   ONE /fixtures?ids= call per TWENTY fixtures, carrying both the line-ups and
 *   the statistics. It used to be TWO calls per fixture, so a five-league
 *   season backfill goes from ~3,800 calls to ~95 — the difference between a
 *   run that can exhaust a 7,500/day plan in one sitting and one that cannot.
 *   Use --dry-run first, and --limit to take a toe in the water.
 *
 * ⚠ THE BLAST RADIUS IS THE REAL REASON, NOT THE ARITHMETIC. This script
 *   deletes before it writes, once per fixture, right down the list. Before the
 *   client's refusal guard, running out of quota mid-run meant every REMAINING
 *   fixture read as "the provider holds nothing" — HTTP 200, empty response —
 *   and the guard is what makes that a reported skip instead of a deletion.
 *   Twenty times fewer calls is twenty times fewer chances to reach the wall.
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
import { getFixturesByIds, IDS_PER_CALL } from '@/lib/integrations/apiFootball/client'
import { lineupsToRows, playersToRows, statisticsToRows } from '@/lib/integrations/apiFootball/mappers'

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
  let playerRows = 0
  let noLineup = 0
  let noStats = 0
  let noPlayers = 0
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

    // Twenty fixtures per call, a chunk at a time so a long run reports
    // progress and commits as it goes rather than all at the end.
    for (let i = 0; i < fixtures.length; i += IDS_PER_CALL) {
      const chunk = fixtures.slice(i, i + IDS_PER_CALL)
      const got = await getFixturesByIds(chunk.map((f) => Number(f.external_fixture_id)))
      totalCalls += got.calls
      const carried = new Map(got.fixtures.map((f) => [String(f.fixture.id), f]))
      for (const msg of got.failures) {
        failures.push({ fixture: chunk.map((f) => f.external_fixture_id).join(','), reason: msg })
      }

      for (const fx of chunk) {
        totalFixtures++
        const homeExt = extByClub.get(fx.home_club_id)
        if (homeExt === undefined) {
          failures.push({ fixture: fx.external_fixture_id, reason: 'home club has no provider id' })
          continue
        }
        const opts = { fixtureId: fx.fixture_id, homeExternalTeamId: homeExt }

        // ⚠ ABSENT IS NOT EMPTY, AND HERE THE TWO LOOK IDENTICAL DOWNSTREAM. A
        // fixture the batch did not carry has no line-ups and no statistics to
        // write — but so does a 1974 fixture the provider simply has nothing for,
        // and only one of those should be counted as "the feed holds none". The
        // membership test keeps a refused chunk out of the `noLineup`/`noStats`
        // tallies, which are what tell you whether a re-run is worth making.
        const bundled = carried.get(fx.external_fixture_id)
        if (!bundled) {
          failures.push({ fixture: fx.external_fixture_id, reason: 'not carried by the batch' })
          continue
        }

        // ---- line-ups --------------------------------------------------------
        const lRows = bundled.lineups ? lineupsToRows(bundled.lineups, opts) : []
        if (lRows.length === 0) noLineup++

        // ---- statistics ------------------------------------------------------
        const sRows = bundled.statistics ? statisticsToRows(bundled.statistics, opts) : []
        if (sRows.length === 0) noStats++

        // ---- player statistics (migration 141) -------------------------------
        // ⭐ FREE. Already in the same bundled response; it was being discarded.
        const pRows = bundled.players ? playersToRows(bundled.players, opts) : []
        if (pRows.length === 0) noPlayers++

        if (dryRun) {
          const xi = lRows.map((r) => r.players.filter((p) => p.starter).length).join('/')
          const poss = sRows.map((r) => r.possession_pct ?? '—').join('/')
          // The two numbers worth eyeballing before a real run: a squad size
          // that is not 40, and a top rating that is not in the 6-9 range.
          const rated = pRows.map((r) => r.rating).filter((r): r is number => r !== null)
          console.log(
            `  ${fx.external_fixture_id}: lineups ${lRows.length} side(s)${xi ? ` (XI ${xi})` : ''}` +
              `, stats ${sRows.length} side(s)${sRows.length ? ` (poss ${poss})` : ''}` +
              `, players ${pRows.length}${rated.length ? ` (top rating ${Math.max(...rated)})` : ''}`,
          )
          lineupRows += lRows.length
          statRows += sRows.length
          playerRows += pRows.length
          await sleep(120)
          continue
        }

        // ⚠ REPLACE-ALL, the same as the sync, so re-running is a no-op rather
        // than a doubling — and the unique (fixture_id, side) indexes would fail
        // loudly if it were not.
        //
        // ⚠ AN EMPTY RESULT DELETES NOTHING. The provider not holding a line-up
        // for an old fixture must not wipe one we already have.
        // ⚠⚠ THE FAILURE THAT PROMPTED MIGRATION 140 HAPPENED ON THIS LINE.
        // 2026-09-09, fixture 1575143: `lineup insert: TypeError: fetch failed`
        // — a transient blip on the INSERT, after the DELETE had committed,
        // leaving a Bundesliga fixture with zero line-up rows. Two PostgREST
        // calls have no transaction between them; a plpgsql function does.
        if (lRows.length > 0) {
          const { error: wErr } = await admin.rpc('replace_match_lineups', {
            p_fixture_id: fx.fixture_id,
            p_rows: lRows,
          })
          if (wErr) {
            failures.push({ fixture: fx.external_fixture_id, reason: `lineup write: ${wErr.message}` })
          } else {
            lineupRows += lRows.length
          }
        }

        if (sRows.length > 0) {
          const { error: wErr } = await admin.rpc('replace_match_team_stats', {
            p_fixture_id: fx.fixture_id,
            p_rows: sRows,
          })
          if (wErr) {
            failures.push({ fixture: fx.external_fixture_id, reason: `stats write: ${wErr.message}` })
          } else {
            statRows += sRows.length
          }
        }

        if (pRows.length > 0) {
          const { error: wErr } = await admin.rpc('replace_match_player_stats', {
            p_fixture_id: fx.fixture_id,
            p_rows: pRows,
          })
          if (wErr) {
            failures.push({ fixture: fx.external_fixture_id, reason: `player write: ${wErr.message}` })
          } else {
            playerRows += pRows.length
          }
        }

        console.log(
          `  ${fx.external_fixture_id}: ${lRows.length} line-up row(s), ${sRows.length} stat row(s), ${pRows.length} player row(s)`,
        )
      }

      // Per chunk, not per fixture — there is one request per twenty now, so
      // pausing per fixture would only be throttling our own database.
      await sleep(120)
    }
  }

  console.log(
    `\n${dryRun ? 'DRY RUN — ' : ''}${totalFixtures} fixture(s), ${totalCalls} api call(s)\n` +
      `  match_lineups     ${lineupRows} row(s)   (${noLineup} fixture(s) the feed has no line-up for)\n` +
      `  match_team_stats  ${statRows} row(s)   (${noStats} fixture(s) the feed has no statistics for)\n` +
      `  match_player_stats ${playerRows} row(s)   (${noPlayers} fixture(s) the feed has no player data for)`,
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
