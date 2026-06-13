// One-off: reconcile stored kickoff times/venues against api-football.
//
// The live sync never updates `match_date`, so FIFA reschedules after seeding
// leave stale kickoffs in the DB (every user, every timezone, sees the wrong
// time). This re-pulls the schedule and corrects not-yet-started matches.
//
//   Dry run (default — prints the diff, writes nothing):
//     npx tsx scripts/reconcile-fixture-times-oneoff.ts
//   Apply:
//     npx tsx scripts/reconcile-fixture-times-oneoff.ts --apply
//   Optional positional args: <tournament_id> <league> <season>
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Minimal .env.local loader (no dotenv dependency): KEY=VALUE lines only.
const envFile = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
for (const line of envFile.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

async function main() {
  const apply = process.argv.includes('--apply')
  const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'))
  const tournamentId =
    positional[0] || process.env.API_FOOTBALL_TOURNAMENT_ID || '00000000-0000-0000-0000-000000000001'
  const league = parseInt(positional[1] ?? process.env.API_FOOTBALL_LEAGUE_ID ?? '1', 10)
  const season = parseInt(positional[2] ?? process.env.API_FOOTBALL_SEASON ?? '2026', 10)

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
  const { reconcileMatchSchedules } = await import('../lib/integrations/apiFootball/reconcile')

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

  console.log(`${apply ? 'APPLYING' : 'DRY RUN'} — tournament=${tournamentId} league=${league} season=${season}\n`)

  const res = await reconcileMatchSchedules(supabase, {
    tournament_id: tournamentId,
    league,
    season,
    dryRun: !apply,
  })

  console.log(`checked ${res.checked} not-yet-started matches; ${res.changed.length} need correction\n`)
  for (const c of res.changed) {
    const parts = [`#${c.match_number} ${c.teams}`]
    if (c.time_changed) {
      parts.push(`\n    kickoff ${c.old_kickoff} -> ${c.new_kickoff} (${c.shift_minutes >= 0 ? '+' : ''}${c.shift_minutes}m)`)
    }
    if (c.venue_changed) {
      parts.push(`\n    venue   ${c.old_venue ?? '(none)'} -> ${c.new_venue ?? '(none)'}`)
    }
    console.log('  ' + parts.join(''))
  }
  if (res.skipped.length > 0) {
    console.log(`\n  skipped (${res.skipped.length}):`)
    for (const s of res.skipped) console.log(`    - #${s.match_number}: ${s.reason}`)
  }

  console.log(`\n${apply ? 'Applied.' : 'No changes written (dry run). Re-run with --apply to write.'}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
