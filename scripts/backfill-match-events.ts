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
 *   One /fixtures/events call per completed fixture, plus one bulk /fixtures
 *   call per league-season for referee and half-time. ~142 calls for the whole
 *   backlog, against a 7,500/day plan. Sequential with a small delay: this is a
 *   one-off, and there is nothing to gain by racing the provider's rate limit.
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
import { getFixtureEvents, getFixtures } from '@/lib/integrations/apiFootball/client'
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

    // ---- 3. Referee + half time, in ONE call for the whole season -----------
    // The bulk /fixtures response carries both for all 380, so asking per
    // fixture would be 380 calls to learn what one already answered.
    const meta = new Map<string, { referee: string | null; ht: [number, number] | null }>()
    try {
      const env = await getFixtures({ league: season.external_league_id, season: season.external_season })
      totalCalls++
      for (const f of env) {
        const ht = f.score?.halftime
        meta.set(String(f.fixture.id), {
          referee: f.fixture.referee ?? null,
          ht: ht && ht.home !== null && ht.away !== null ? [ht.home, ht.away] : null,
        })
      }
    } catch (e) {
      console.warn(`  ! ${season.competition_name}: bulk fixtures failed — ${String(e)}`)
    }

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

      let rows: ReturnType<typeof eventsToTimeline> = []
      try {
        const evts = await getFixtureEvents(Number(fx.external_fixture_id))
        totalCalls++
        rows = eventsToTimeline(evts, { fixtureId: fx.fixture_id, homeExternalTeamId: homeExt })
      } catch (e) {
        failures.push({ fixture: fx.external_fixture_id, reason: `events: ${String(e)}` })
        continue
      }

      const m = meta.get(fx.external_fixture_id)
      const goals = rows.filter(
        (r) => r.kind === 'goal' || r.kind === 'penalty' || r.kind === 'own_goal',
      ).length

      if (dryRun) {
        console.log(
          `  ${fx.external_fixture_id}: ${rows.length} event(s), ${goals} goal(s)` +
            `${m?.referee ? `, ref ${m.referee}` : ''}${m?.ht ? `, HT ${m.ht[0]}-${m.ht[1]}` : ''}`,
        )
        totalRows += rows.length
        continue
      }

      // ⚠ REPLACE-ALL, the same as the sync. Re-running this script must be a
      // no-op rather than a doubling — and the unique (fixture_id, sort_index)
      // index would fail loudly if it were not.
      const { error: delErr } = await admin
        .from('match_events')
        .delete()
        .eq('fixture_id', fx.fixture_id)
      if (delErr) {
        failures.push({ fixture: fx.external_fixture_id, reason: `delete: ${delErr.message}` })
        continue
      }
      if (rows.length > 0) {
        const { error: insErr } = await admin.from('match_events').insert(rows)
        if (insErr) {
          failures.push({ fixture: fx.external_fixture_id, reason: `insert: ${insErr.message}` })
          continue
        }
      }

      // ⚠ The half-time pair together or not at all — league_fixtures_ht_pair_ck
      // refuses {1, null}.
      const patch: Record<string, unknown> = {}
      if (m?.referee) patch.referee = m.referee
      if (m?.ht) {
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

      // Polite, and this is a one-off — there is nothing to gain by racing the
      // provider's rate limit.
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
