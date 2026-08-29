// Import a league season from api-football into the league's OWN tables.
//
// Retargeted 2026-08-22 (L2). This used to require a hand-created `tournaments`
// row and wrote clubs into `teams` and fixtures into `matches`. A league now
// has its own structure (league_seasons / league_clubs / league_matchweeks /
// league_fixtures) and the season row is created by the import itself.
//
// Usage:
//   Dry run (fetches, builds the plan, writes NOTHING):
//     npx tsx scripts/import-league-season.ts premier-league 2026
//   Apply:
//     npx tsx scripts/import-league-season.ts premier-league 2026 --apply
//
// Idempotent: re-running inserts only what is new, by the schema's own natural
// keys. Requires NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and
// API_FOOTBALL_KEY in .env.local.

import { readFileSync } from 'fs'
import { resolve } from 'path'

try {
  const envFile = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
  for (const line of envFile.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
  }
} catch {
  console.error('Could not read .env.local')
}

// The competitions we know how to import. A new league is a row here plus one
// run — no code. An entry that has never been run is a claim, not a capability,
// so this stays as small as what has actually been imported.
//
// ⚠ Only leagues with ONE clean regular-season phase belong here today. The feed
// GROWS a split or play-off phase partway through a season, and the fixture sync
// never inserts a fixture the provider invents later — so Scotland, Belgium, the
// Netherlands, Portugal and the Championship would silently end short. See
// drafts/2026-08-28_european_leagues_expansion_research.md §4.
const CATALOGUE: Record<string, { name: string; country: string; apiLeagueId: number }> = {
  'premier-league': { name: 'Premier League', country: 'ENG', apiLeagueId: 39 },
  // Added 2026-08-28 as league #2. 20 clubs, 38 matchweeks, 380 fixtures — the
  // same shape as England, which is exactly why it was chosen to go first.
  'la-liga': { name: 'La Liga', country: 'ESP', apiLeagueId: 140 },
  // Added 2026-08-28 as league #3. Same shape again: 20/38/380, one phase.
  'serie-a': { name: 'Serie A', country: 'ITA', apiLeagueId: 135 },
  // Added 2026-08-28 as league #4, and the FIRST that is not England-shaped:
  // 18 clubs, 34 matchweeks, 306 fixtures, 9 a round.
  //
  // ⚠ The expansion research lists Germany among the leagues where "the feed
  // grows a phase mid-season", which is true and — checked against a finished
  // season today — harmless HERE, unlike Scotland. League 78 season 2024 returns
  // 308 fixtures: "Regular Season" rounds 1-34 complete, plus a two-fixture
  // "Relegation Round" against a 2. Bundesliga club (which is why that season
  // reports 19 clubs, not 18). Scotland's grown phase IS rounds 34-38 of the
  // league, so missing it ends the season early; Germany's is a play-off
  // against a club outside the league, so missing it loses nothing. The
  // importer picks the largest phase and skips the rest, which is the right
  // answer both times for different reasons.
  'bundesliga': { name: 'Bundesliga', country: 'GER', apiLeagueId: 78 },
}

function seasonLabel(startYear: number): string {
  return `${startYear}/${String((startYear + 1) % 100).padStart(2, '0')}`
}

function fmtDate(iso: string | null): string {
  if (!iso) return '(none)'
  return iso.replace('T', ' ').replace(/:\d{2}\.\d+Z$/, 'Z').replace(/:00\+00:00$/, 'Z').replace(/:00Z$/, 'Z')
}

async function main() {
  const apply = process.argv.includes('--apply')
  const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'))
  const slug = positional[0]
  const startYear = parseInt(positional[1] ?? '', 10)

  if (!slug || !Number.isFinite(startYear)) {
    console.error('Usage: npx tsx scripts/import-league-season.ts <competition-slug> <season-start-year> [--apply]')
    console.error(`Known competitions: ${Object.keys(CATALOGUE).join(', ')}`)
    process.exit(1)
  }
  const comp = CATALOGUE[slug]
  if (!comp) {
    console.error(`Unknown competition "${slug}". Known: ${Object.keys(CATALOGUE).join(', ')}`)
    process.exit(1)
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const { createClient } = await import('@supabase/supabase-js')
  const { importLeagueSeason } = await import('@/lib/integrations/apiFootball/importLeagueSeason')
  const db = createClient(url, key)

  console.log(
    `${apply ? 'APPLYING' : 'DRY RUN'} — ${comp.name} ${seasonLabel(startYear)} ` +
    `(api-football league ${comp.apiLeagueId}, season ${startYear})\n`
  )

  const res = await importLeagueSeason(db, {
    competition_slug: slug,
    competition_name: comp.name,
    season_label: seasonLabel(startYear),
    season_start_year: startYear,
    country_code: comp.country,
    league: comp.apiLeagueId,
    season: startYear,
    commit: apply,
  })

  console.log(`Season: ${res.season_id ?? '(not created — dry run)'}`)
  console.log(`  phase imported: "${res.phase.imported}"`)
  const others = res.phase.all.filter((p) => p.phase !== res.phase.imported)
  if (others.length > 0) {
    console.log('  phases SKIPPED (play-offs are out of scope):')
    for (const p of others) {
      const n = res.phase.skippedByPhase[p.phase] ?? 0
      console.log(`    - "${p.phase}": ${n} fixture(s)` +
        `${p.rounds ? `, ${p.rounds} numbered round(s)` : ''}` +
        `${p.unnumbered ? `, ${p.unnumbered} unnumbered` : ''}`)
    }
  }

  console.log(`\nClubs: ${res.clubs.external_total} from api-football — ${res.clubs.to_insert} to insert, ${res.clubs.existing} already present`)
  for (const c of res.clubs.plan.slice(0, 25)) {
    console.log(`    ${c.status === 'new' ? c.abbreviation : ' — '}  ${c.name}  [api ${c.external_club_id}]`)
  }

  console.log(`\nMatchweeks: ${res.matchweeks.to_insert} to insert, ${res.matchweeks.existing} already present`)
  const mws = res.matchweeks.plan
  if (mws.length > 0) {
    const counts = [...new Set(mws.map((m) => m.fixture_count))].sort((a, b) => a - b)
    console.log(`    range ${mws[0].matchweek_number}–${mws[mws.length - 1].matchweek_number}, fixtures per matchweek: ${counts.join('/')}`)
  }

  console.log(`\nFixtures: ${res.fixtures.external_total} from api-football — ${res.fixtures.to_insert} to insert, ` +
    `${res.fixtures.existing} already present, ${res.fixtures.skipped} skipped`)
  console.log(`  window ${fmtDate(res.fixtures.date_first)} → ${fmtDate(res.fixtures.date_last)}`)

  const sample = res.fixtures.plan.filter((f) => f.status === 'new')
  console.log('\n  sample fixtures:')
  for (const f of [...sample.slice(0, 5), ...(sample.length > 10 ? sample.slice(-5) : [])]) {
    console.log(`    #${String(f.fixture_number).padStart(3, ' ')} MW${String(f.matchweek_number).padStart(2, ' ')}  ${fmtDate(f.kickoff_at)}  ${f.home} vs ${f.away}`)
  }

  const skipped = res.fixtures.plan.filter((f) => f.status === 'skipped')
  if (skipped.length > 0) {
    console.log(`\n  skipped (${skipped.length}):`)
    for (const s of skipped.slice(0, 20)) console.log(`    - ${s.home} vs ${s.away} [${s.provider_round}]: ${s.reason}`)
  }

  // The competition record. Reported LOUDLY and on its own line, because its
  // absence is invisible until somebody reaches the last step of the pool wizard
  // and gets a 409 — which is exactly how the Premier League shipped a complete
  // season nobody could make a pool for.
  console.log('\nCompetition record (`tournaments` placeholder):')
  if (res.placeholder.status === 'existing') {
    console.log(`    EXISTS   ${res.placeholder.name}  [${res.placeholder.tournament_id}]`)
    console.log(`    ${res.placeholder.reason ?? 'adopted'}`)
  } else {
    console.log(res.placeholder.status === 'new'
      ? `    CREATED  ${res.placeholder.name}  [${res.placeholder.tournament_id}]`
      : `    WOULD CREATE  ${res.placeholder.name}`)
    // Printed field by field, because every one of these is DERIVED — from the
    // feed or from the counts — and a dry run that hides them cannot be used to
    // check them. `host_countries` and `logo_url` in particular come off the
    // fixtures response, so a wrong one means the feed shape changed.
    const row = res.placeholder.row
    if (row) {
      const show = ['host_countries', 'num_teams', 'start_date', 'end_date',
                    'prediction_deadline', 'logo_url', 'description'] as const
      for (const k of show) {
        console.log(`      ${k.padEnd(20)} ${String(row[k] ?? '(null)')}`)
      }
    } else {
      console.log('      (no kickoff times — a placeholder cannot be built)')
    }
    if (res.placeholder.status === 'planned') {
      console.log('    Without it `pools/create` returns 409 and the wizard cannot see this league.')
    }
  }

  console.log(apply
    ? '\nApplied — season, clubs, matchweeks, fixtures and the competition record.'
    : '\nNo changes written (dry run). Re-run with --apply.')
}

main().catch((e) => { console.error('FAILED:', e instanceof Error ? e.message : e); process.exit(1) })
