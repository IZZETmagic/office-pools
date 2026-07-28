// Import a full league season (teams + fixtures) from api-football.
//
// The mirror image of scripts/seed-api-football-mapping.ts: instead of mapping a
// hand-authored bracket to api-football ids, this PULLS a flat round-robin league
// (e.g. the Premier League) and inserts teams + all fixtures with their external
// ids already set. The live sync then works unchanged.
//
// Prereqs:
//   1. Apply migration lib/migrations/024_multi_competition_league_support.sql
//   2. Create the tournaments row to import into (see the INSERT in the PR notes),
//      and copy its tournament_id.
//
// Usage:
//   Dry run (default — fetches, builds the plan, writes NOTHING):
//     npx tsx scripts/import-league-season.ts <tournament_id> <league> <season>
//   Apply:
//     npx tsx scripts/import-league-season.ts <tournament_id> <league> <season> --apply
//
//   Premier League 2025/26 example (api-football: league 39, season 2025):
//     npx tsx scripts/import-league-season.ts <pl_tournament_id> 39 2025
//
// Idempotent: re-running only inserts teams/fixtures not already present.
// Requires NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, API_FOOTBALL_KEY
// in .env.local.

import { readFileSync } from 'fs'
import { resolve } from 'path'

// Minimal .env.local loader (no dotenv dependency): KEY=VALUE lines only.
try {
  const envFile = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
  for (const line of envFile.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
  }
} catch {
  console.error('Could not read .env.local')
}

function fmtDate(iso: string | null): string {
  if (!iso) return '(none)'
  // Compact, timezone-explicit: 2025-08-15 19:00Z
  return iso.replace('T', ' ').replace(/:\d{2}\.\d+Z$/, 'Z').replace(/:00Z$/, 'Z')
}

async function main() {
  const apply = process.argv.includes('--apply')
  const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'))
  const tournamentId = positional[0]
  const league = parseInt(positional[1] ?? '', 10)
  const season = parseInt(positional[2] ?? '', 10)

  if (!tournamentId || !Number.isFinite(league) || !Number.isFinite(season)) {
    console.error('Usage: npx tsx scripts/import-league-season.ts <tournament_id> <league> <season> [--apply]')
    process.exit(1)
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }
  if (!process.env.API_FOOTBALL_KEY) {
    console.error('Missing API_FOOTBALL_KEY')
    process.exit(1)
  }

  const { createClient } = await import('@supabase/supabase-js')
  const { importLeagueSeason } = await import('../lib/integrations/apiFootball/importLeagueSeason')

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

  console.log(`${apply ? 'APPLYING' : 'DRY RUN'} — tournament=${tournamentId} league=${league} season=${season}\n`)

  const res = await importLeagueSeason(supabase, {
    tournament_id: tournamentId,
    league,
    season,
    commit: apply,
  })

  // --- Teams ---------------------------------------------------------------
  console.log(
    `Teams: ${res.teams.external_total} from api-football — ${res.teams.to_insert} to insert, ${res.teams.existing} already present`
  )
  for (const t of res.teams.plan) {
    const tag = t.status === 'existing' ? '  (exists)' : `  ${t.code}`
    console.log(`  ${tag}  ${t.name}  [api ${t.external_team_id}]`)
  }

  // --- Matches -------------------------------------------------------------
  console.log(
    `\nFixtures: ${res.matches.external_total} from api-football — ${res.matches.to_insert} to insert` +
      `, ${res.matches.existing} already present` +
      (res.matches.skipped ? `, ${res.matches.skipped} skipped` : '')
  )
  if (res.matches.round_min != null) {
    console.log(`  matchweeks ${res.matches.round_min}–${res.matches.round_max}`)
  }
  console.log(`  window ${fmtDate(res.matches.date_first)} → ${fmtDate(res.matches.date_last)}`)

  const newOnes = res.matches.plan.filter((m) => m.status === 'new')
  const preview = [...newOnes.slice(0, 5), ...(newOnes.length > 10 ? newOnes.slice(-5) : newOnes.slice(5))]
  console.log('\n  sample fixtures:')
  let lastShown = -1
  for (const m of preview) {
    if (m.match_number - lastShown > 1 && lastShown !== -1) console.log('    …')
    lastShown = m.match_number
    const wk = m.round_number != null ? `MW${String(m.round_number).padStart(2, ' ')}` : 'MW--'
    console.log(`    #${String(m.match_number).padStart(3, ' ')} ${wk}  ${fmtDate(m.match_date)}  ${m.home} vs ${m.away}`)
  }

  const skipped = res.matches.plan.filter((m) => m.status === 'skipped')
  if (skipped.length > 0) {
    console.log(`\n  skipped (${skipped.length}):`)
    for (const s of skipped.slice(0, 20)) console.log(`    - ${s.home} vs ${s.away} [${s.external_match_id}]: ${s.reason}`)
  }

  console.log(
    `\n${apply ? 'Applied — teams + fixtures inserted.' : 'No changes written (dry run). Re-run with --apply to insert.'}`
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
