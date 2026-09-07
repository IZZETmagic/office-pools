/**
 * Re-read `league_fixtures.referee` from the provider.
 *
 * WHY THIS EXISTS
 *   api-football ENRICHES THE REFEREE AFTER THE MATCH. At sync time — during
 *   the game and on the completion tick — the feed sends an initial and a
 *   surname, "C. Kavanagh". By the following day the same fixture reads
 *   "Chris Kavanagh, England". The league sync writes the column once, inside
 *   step 7b3's `changed` loop, and never revisits a fixture that has stopped
 *   changing. So every referee we hold is the short form, and the long one was
 *   available all along.
 *
 *   Verified 2026-09-07: `/fixtures?league=39&season=2026` returned 30 of 30
 *   referees as full names, while all 132 rows in our database were initials.
 *
 * WHAT IT WRITES
 *   `league_fixtures.referee`, and nothing else. Provider truth about a
 *   display-only column that nothing scores from.
 *
 * COST
 *   ONE bulk `/fixtures` call per league-season — five for the whole product —
 *   because the season payload carries the referee for all 380 fixtures. There
 *   is no per-fixture call here at all.
 *
 * ⚠ SAFE TO RE-RUN, AND WORTH RE-RUNNING. It only writes where the value has
 *   actually changed, so a second run touches nothing; and because enrichment
 *   is what it is chasing, running it a day after a matchweek is the point.
 *
 * Usage:
 *   npx tsx scripts/refresh-referees.ts --dry-run
 *   npx tsx scripts/refresh-referees.ts --league 39
 *   npx tsx scripts/refresh-referees.ts
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'

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
import { getFixtures } from '@/lib/integrations/apiFootball/client'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const leagueArg = args.includes('--league') ? Number(args[args.indexOf('--league') + 1]) : null

/** "C. Kavanagh" — what the feed sends while a match is live. */
const looksAbbreviated = (v: string) => /^[A-Z]\.\s/.test(v.trim())

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

  let calls = 0
  let changed = 0
  let unchanged = 0
  let stillShort = 0

  for (const season of seasons) {
    const { data: rows, error: fErr } = await admin
      .from('league_fixtures')
      .select('fixture_id, external_fixture_id, referee')
      .eq('season_id', season.season_id)
      .range(0, 999)
    if (fErr) throw fErr
    const ours = new Map(
      ((rows ?? []) as Array<{ fixture_id: string; external_fixture_id: string; referee: string | null }>)
        .map((r) => [r.external_fixture_id, r]),
    )
    if (ours.size === 0) continue

    // ⚠ ONE CALL FOR THE WHOLE SEASON. The bulk payload carries the referee for
    // every fixture, so asking per fixture would be 380 calls to learn what one
    // already answered — the same trade `backfill-match-events` makes.
    let feed
    try {
      feed = await getFixtures({ league: season.external_league_id, season: season.external_season })
      calls++
    } catch (e) {
      console.warn(`  ! ${season.competition_name}: ${String(e)}`)
      continue
    }

    let seasonChanged = 0
    for (const f of feed) {
      const mine = ours.get(String(f.fixture.id))
      const next = f.fixture.referee ?? null
      if (!mine || !next) continue
      if (mine.referee === next) {
        unchanged++
        continue
      }
      // ⚠ NEVER TRADE A LONG NAME FOR A SHORT ONE. A fixture re-read while it
      // is live would otherwise undo an earlier enrichment, and the next run
      // would swap it back — a column that flickers with the fixture list.
      if (mine.referee && !looksAbbreviated(mine.referee) && looksAbbreviated(next)) {
        stillShort++
        continue
      }
      if (!dryRun) {
        const { error } = await admin
          .from('league_fixtures')
          .update({ referee: next })
          .eq('fixture_id', mine.fixture_id)
        if (error) {
          console.warn(`  ! ${f.fixture.id}: ${error.message}`)
          continue
        }
      }
      if (seasonChanged < 3) {
        console.log(`  ${f.fixture.id}: ${mine.referee ?? '—'}  ->  ${next}`)
      }
      seasonChanged++
      changed++
    }
    console.log(
      `${season.competition_name} ${season.season_label} — ${seasonChanged} updated of ${ours.size}`,
    )
  }

  console.log(
    `\n${dryRun ? 'DRY RUN — ' : ''}${calls} api call(s), ${changed} updated, ${unchanged} already current` +
      (stillShort > 0 ? `, ${stillShort} left alone (feed was shorter than ours)` : ''),
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
