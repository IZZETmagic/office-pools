/**
 * One-off backfill of `match_events`, plus referee and the half-time pair, for
 * league fixtures that were already played when migration 136 landed.
 *
 * WHY THIS EXISTS
 *   The sync writes a timeline when a fixture CHANGES (step 7b3). Every fixture
 *   that finished before 136 was applied will therefore never change again and
 *   would stay blank forever — which on 2026-09-06 is 137 completed fixtures
 *   across five leagues, i.e. every game the product has a result for.
 *
 * WHAT IT WRITES
 *   Only `match_events` (replace-all per fixture) and only the three display
 *   columns on `league_fixtures`. It never touches a scoring table, and
 *   `match_events` has no scoring consumer by design.
 *
 * ⚠ IT USES THE SAME MAPPER AS THE SYNC. `eventsToTimeline` is imported rather
 *   than reimplemented, so a backfilled fixture and a live-synced one cannot
 *   disagree about what happened — which is the entire failure mode of a
 *   one-off script that "just does the same thing".
 *
 * COST
 *   ONE /fixtures?ids= call per TWENTY fixtures. The bundled response carries
 *   each fixture's events, and its referee and half-time score alongside them,
 *   so a 137-fixture backlog is 7 calls rather than 142.
 *
 * ⚠ THE SEPARATE BULK CALL FOR REFEREE AND HALF-TIME IS GONE, and not only to
 *   save the call. It was a second read of the same facts from a different
 *   endpoint, which is a licence for the two to disagree; they now arrive in
 *   the same object as the events they belong to.
 *
 * ⚠ AND THE BLAST RADIUS IS WHY BATCHING MATTERED MORE HERE THAN IN THE SYNC.
 *   This script deletes before it writes, across every fixture in a run. Before
 *   the client's refusal guard, exhausting the daily quota mid-run would have
 *   wiped the timeline of every REMAINING fixture — each refusal arriving as
 *   HTTP 200 with an empty response, reading exactly like a match in which
 *   nothing happened. A fixture the batch does not carry is now skipped and
 *   reported, and there are twenty times fewer chances to hit the wall.
 *
 * Usage:
 *   npx tsx scripts/backfill-match-events.ts --dry-run    # report only
 *   npx tsx scripts/backfill-match-events.ts              # every completed fixture
 *   npx tsx scripts/backfill-match-events.ts --league 39  # one competition
 *   npx tsx scripts/backfill-match-events.ts --limit 5    # a toe in the water
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
import { eventsToTimeline } from '@/lib/integrations/apiFootball/mappers'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const leagueArg = args.includes('--league')
  ? Number(args[args.indexOf('--league') + 1])
  : null
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

  // ---- 1. Which seasons, and their provider coordinates --------------------
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

  let totalRows = 0
  let totalCalls = 0
  let totalFixtures = 0
  const failures: Array<{ fixture: string; reason: string }> = []

  for (const season of seasons) {
    // ---- 2. Completed fixtures, with the home club's PROVIDER id ------------
    // ⚠ `side` is computed against the home team's api-football id, so the club
    // row is joined rather than the event's team name being matched — names
    // differ between endpoints and would silently mis-side every event.
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

    // ---- 3. Twenty fixtures per call ----------------------------------------
    // A chunk at a time rather than all up front, so a long run reports
    // progress and commits as it goes: a backfill that dies at fixture 300
    // should have written the first 299.
    for (let i = 0; i < fixtures.length; i += IDS_PER_CALL) {
      const chunk = fixtures.slice(i, i + IDS_PER_CALL)
      const got = await getFixturesByIds(chunk.map((f) => Number(f.external_fixture_id)))
      totalCalls += got.calls
      const carried = new Map(got.fixtures.map((f) => [String(f.fixture.id), f]))
      // Named by the ids it took down, so a rerun knows what to chase.
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

        // ⚠ MEMBERSHIP, NOT `?? []`. An absent fixture is one the batch did not
        // carry — a refused chunk, or an id the provider does not know — and the
        // delete below must never run on it. `bundled?.events ?? []` would read
        // identically to a goalless, cardless match and clear the timeline.
        const bundled = carried.get(fx.external_fixture_id)
        if (!bundled?.events) {
          failures.push({ fixture: fx.external_fixture_id, reason: 'not carried by the batch' })
          continue
        }
        const rows = eventsToTimeline(bundled.events, {
          fixtureId: fx.fixture_id,
          homeExternalTeamId: homeExt,
        })

        // Referee and half time out of the SAME object as the events.
        const ht = bundled.score?.halftime
        const m = {
          referee: bundled.fixture.referee ?? null,
          ht: (ht && ht.home !== null && ht.away !== null ? [ht.home, ht.away] : null) as
            | [number, number]
            | null,
        }
        const goals = rows.filter(
          (r) => r.kind === 'goal' || r.kind === 'penalty' || r.kind === 'own_goal',
        ).length

        if (dryRun) {
          console.log(
            `  ${fx.external_fixture_id}: ${rows.length} event(s), ${goals} goal(s)` +
              `${m.referee ? `, ref ${m.referee}` : ''}${m.ht ? `, HT ${m.ht[0]}-${m.ht[1]}` : ''}`,
          )
          totalRows += rows.length
          continue
        }

        // ⚠ REPLACE-ALL, the same as the sync. Re-running this script must be a
        // no-op rather than a doubling — and the unique (fixture_id, sort_index)
        // index would fail loudly if it were not.
        //
        // ⚠⚠ ONE STATEMENT, NOT TWO — and this script is why. It used to DELETE
        // then INSERT as separate calls, down the whole list, and on 2026-09-09
        // the sibling backfill lost fixture 1575143 in the gap: the delete
        // committed, `TypeError: fetch failed` took the insert, and the fixture
        // was left emptier than it started. Migration 140 put the pair in a
        // transaction. Both or neither.
        const { error: wErr } = await admin.rpc('replace_match_events', {
          p_fixture_id: fx.fixture_id,
          p_rows: rows,
        })
        if (wErr) {
          failures.push({ fixture: fx.external_fixture_id, reason: `write: ${wErr.message}` })
          continue
        }

        // ⚠ The half-time pair together or not at all — league_fixtures_ht_pair_ck
        // refuses {1, null}.
        const patch: Record<string, unknown> = {}
        if (m.referee) patch.referee = m.referee
        if (m.ht) {
          patch.home_goals_ht = m.ht[0]
          patch.away_goals_ht = m.ht[1]
        }
        if (Object.keys(patch).length > 0) {
          const { error: updErr } = await admin
            .from('league_fixtures')
            .update(patch)
            .eq('fixture_id', fx.fixture_id)
          if (updErr) {
            failures.push({ fixture: fx.external_fixture_id, reason: `meta: ${updErr.message}` })
          }
        }

        totalRows += rows.length
        console.log(`  ${fx.external_fixture_id}: ${rows.length} event(s), ${goals} goal(s)`)
      }

      // ⚠ PER CHUNK, NOT PER FIXTURE. It used to sleep between api calls, and
      // there were as many of those as there were fixtures; there is now one
      // per twenty, so pausing per fixture would be throttling the DATABASE in
      // the name of politeness to a provider we are no longer talking to.
      await sleep(120)
    }
  }

  console.log(
    `\n${dryRun ? 'DRY RUN — ' : ''}${totalFixtures} fixture(s), ${totalRows} event row(s), ${totalCalls} api call(s)`,
  )
  if (failures.length > 0) {
    console.log(`\n${failures.length} failure(s):`)
    for (const f of failures) console.log(`  ${f.fixture}: ${f.reason}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
