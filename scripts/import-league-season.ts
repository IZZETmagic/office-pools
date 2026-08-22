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
// run — no code. Deliberately small: v1 ships the Premier League only, and an
// entry that has never been run is a claim, not a capability.
const CATALOGUE: Record<string, { name: string; country: string; apiLeagueId: number }> = {
  'premier-league': { name: 'Premier League', country: 'ENG', apiLeagueId: 39 },
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

  console.log(apply ? '\nApplied — season, clubs, matchweeks and fixtures inserted.' : '\nNo changes written (dry run). Re-run with --apply.')
}

main().catch((e) => { console.error('FAILED:', e instanceof Error ? e.message : e); process.exit(1) })
