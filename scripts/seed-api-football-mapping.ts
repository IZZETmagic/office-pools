/**
 * One-time seed: map our teams + group-stage matches to api-football ids.
 *
 * Usage:
 *   npx tsx scripts/seed-api-football-mapping.ts <tournament_id> <league> <season>
 *
 * Example (FIFA World Cup 2026, league id 1):
 *   npx tsx scripts/seed-api-football-mapping.ts \
 *     b1111111-1111-1111-1111-111111111111 1 2026
 *
 * Knockout fixtures are NOT auto-mapped (placeholder teams). After group
 * stage starts and brackets fill, re-run to pick up knockout fixtures by
 * resolved team pair, or map them manually in the super-admin UI.
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * and API_FOOTBALL_KEY in .env.local.
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
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
} catch {
  console.error('Could not read .env.local')
}

import { createClient } from '@supabase/supabase-js'
import { seedTeamMapping, seedFixtureMapping } from '../lib/integrations/apiFootball/seed'

async function main() {
  const [tournamentArg, leagueArg, seasonArg] = process.argv.slice(2)
  const tournamentId = tournamentArg || '00000000-0000-0000-0000-000000000001'
  const league = parseInt(leagueArg ?? '1', 10)
  const season = parseInt(seasonArg ?? '2026', 10)
  if (!Number.isFinite(league) || !Number.isFinite(season)) {
    console.error('league and season must be integers')
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

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

  console.log('Seeding teams…')
  const teamsResult = await seedTeamMapping(supabase, { tournament_id: tournamentId, league, season })
  console.log(`  matched: ${teamsResult.matched.length}`)
  console.log(`  unmatched (ours): ${teamsResult.unmatched_internal.length}`)
  console.log(`  unmatched (api): ${teamsResult.unmatched_external.length}`)
  if (teamsResult.unmatched_internal.length > 0) {
    console.log('  Our teams without an external mapping:')
    for (const t of teamsResult.unmatched_internal) console.log(`    - ${t.country_name} (${t.team_id})`)
  }
  if (teamsResult.unmatched_external.length > 0) {
    console.log('  External teams not matched to any of ours:')
    for (const t of teamsResult.unmatched_external) console.log(`    - ${t.name} (id=${t.id})`)
  }

  console.log('\nSeeding group-stage fixtures…')
  const fxResult = await seedFixtureMapping(supabase, { tournament_id: tournamentId, league, season })
  console.log(`  matched: ${fxResult.matched.length}`)
  console.log(`  unresolved: ${fxResult.unresolved.length}`)
  if (fxResult.unresolved.length > 0) {
    console.log('  Unresolved (map manually in super-admin UI or after bracket fills):')
    for (const u of fxResult.unresolved) console.log(`    - #${u.match_number}: ${u.reason}`)
  }

  console.log('\nDone.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
