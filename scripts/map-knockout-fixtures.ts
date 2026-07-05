/**
 * Map KNOCKOUT-stage matches to api-football fixture ids by resolved team pair
 * + date. Thin CLI wrapper around lib/integrations/apiFootball/linkKnockoutFixtures
 * (the same logic the sync cron now runs automatically) — kept for manual/one-off
 * use and as a dry-run harness.
 *
 * SAFE BY DEFAULT: dry-run prints the proposed mapping and writes nothing.
 * Pass --commit to actually write matches.external_match_id.
 *
 * Usage:
 *   npx tsx scripts/map-knockout-fixtures.ts <tournament_id> [league] [season]
 *   npx tsx scripts/map-knockout-fixtures.ts <tournament_id> 1 2026 --commit
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
import { linkKnockoutFixtures } from '../lib/integrations/apiFootball/linkKnockoutFixtures'

async function main() {
  const argv = process.argv.slice(2)
  const commit = argv.includes('--commit')
  const positional = argv.filter((a) => !a.startsWith('--'))
  const tournamentId = positional[0]
  const league = parseInt(positional[1] ?? '1', 10)
  const season = parseInt(positional[2] ?? '2026', 10)

  if (!tournamentId) {
    console.error('Usage: npx tsx scripts/map-knockout-fixtures.ts <tournament_id> [league] [season] [--commit]')
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

  // Manual runs consider ALL unlinked knockout matches (no lead-day bound).
  const res = await linkKnockoutFixtures(supabase, { tournamentId, league, season, commit, leadDays: 3650 })

  console.log(commit ? '=== COMMIT MODE — writing external_match_id ===' : '=== DRY RUN — no writes (re-run with --commit to apply) ===')
  console.log(`\n${commit ? 'Linked' : 'Would link'} (${res.linked.length}):`)
  for (const l of res.linked) console.log(`  #${l.match_number}  ${l.label}  ->  fixture ${l.external_match_id}`)
  console.log(`\nAmbiguous — multiple candidate fixtures, NEEDS MANUAL LINK (${res.ambiguous.length}):`)
  for (const a of res.ambiguous) console.log(`  #${a.match_number} ${a.stage}: ${a.label} (${a.candidates} candidates)`)
  console.log(`\nUnresolved — expected for rounds whose teams aren't decided yet (${res.unresolved.length}):`)
  for (const u of res.unresolved) console.log(`  #${u.match_number} ${u.stage}: ${u.reason}`)
  console.log(commit ? `\nWrote ${res.linked.length} external_match_id value(s).` : '\nNothing written. Re-run with --commit once the mapping looks correct.')
  console.log('\nDone.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
