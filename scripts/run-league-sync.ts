// =============================================================
// run-league-sync — run the league sync arm once, by hand, and report.
// =============================================================
// The cron will do this every minute once deployed. Running it here first is
// the only way to exercise the whole path — real season, real feed, real RPC —
// before the restructured `/api/cron/sync-fixtures` reaches 623 live pools,
// because that route has no test coverage of its own.
//
// WHAT IT WRITES: status, status_detail, goals, is_completed, completed_at, the
// live triple, and last_synced_at, for fixtures of the seasons it resolves.
// That is provider truth about matches that have already been played, it is
// re-derivable from the feed, and nothing consumes it yet.
//
// WHAT IT CANNOT DO: send anything. `league_fixtures` has no completion trigger
// and is not in the `supabase_realtime` publication, so writing is_completed
// reaches no edge function and no member. Verified 2026-08-22.
//
//   npx tsx scripts/run-league-sync.ts
//
// Prints the run note in exactly the shape the cron will log, plus a before and
// after picture so a run that did nothing is visibly different from a run that
// had nothing to do.
// =============================================================

import { readFileSync } from 'fs'
import { resolve } from 'path'

;(() => {
  const envContent = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
  for (const line of envContent.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i === -1) continue
    const k = t.slice(0, i).trim()
    let v = t.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (!process.env[k]) process.env[k] = v
  }
})()

import { createAdminClient } from '../lib/supabase/server'
import { loadSyncTargets } from '../lib/integrations/apiFootball/syncTargets'
import { syncLeagueFixtures, formatLeagueNoteParts } from '../lib/integrations/apiFootball/syncLeagueFixtures'

const admin = createAdminClient()

async function snapshot(seasonId: string) {
  const { data, error } = await admin
    .from('league_fixtures')
    .select('status, is_completed, last_synced_at, home_goals')
    .eq('season_id', seasonId)
    .range(0, 999)
  if (error) throw new Error(`snapshot: ${error.message}`)
  const rows = data ?? []
  const byStatus: Record<string, number> = {}
  for (const r of rows) byStatus[r.status as string] = (byStatus[r.status as string] ?? 0) + 1
  return {
    total: rows.length,
    completed: rows.filter((r) => r.is_completed).length,
    withGoals: rows.filter((r) => r.home_goals !== null).length,
    everSynced: rows.filter((r) => r.last_synced_at !== null).length,
    byStatus,
  }
}

async function main() {
  const now = Date.now()
  const nowIso = new Date(now).toISOString()
  console.log(`Run at ${nowIso}\n`)

  const errors: string[] = []
  const notes: string[] = []
  const targets = await loadSyncTargets(admin, {
    onError: (s, m) => errors.push(`${s}: ${m}`),
    onNote: (m) => notes.push(m),
  })

  console.log(`Targets resolved: ${targets.length}`)
  for (const t of targets) console.log(`  ${t.kind.padEnd(10)} "${t.name}"`)
  if (errors.length) console.log('Target errors:', errors)
  if (notes.length) for (const n of notes) console.log(`  note: ${n}`)
  console.log()

  const leagues = targets.filter((t) => t.kind === 'league')
  if (leagues.length === 0) {
    console.log('No league target — nothing to do.')
    return
  }

  for (const target of leagues) {
    if (target.kind !== 'league') continue
    const before = await snapshot(target.seasonId)
    console.log(`--- ${target.name} ---`)
    console.log('BEFORE:', JSON.stringify(before))

    const r = await syncLeagueFixtures(admin, target, { now, nowIso })

    console.log(`NOTE  : league "${r.name}" ${formatLeagueNoteParts(r).join(' ')}`)
    if (r.errors.length) {
      console.log('ERRORS:')
      for (const e of r.errors) console.log(`  ${e.stage}: ${e.message}`)
    } else {
      console.log('ERRORS: none')
    }

    const after = await snapshot(target.seasonId)
    console.log('AFTER :', JSON.stringify(after))

    const moved =
      after.completed - before.completed ||
      after.withGoals - before.withGoals ||
      after.everSynced - before.everSynced
    console.log(
      moved
        ? `CHANGED: completed ${before.completed}->${after.completed}, ` +
            `withGoals ${before.withGoals}->${after.withGoals}, ` +
            `everSynced ${before.everSynced}->${after.everSynced}`
        : 'CHANGED: nothing moved',
    )
    console.log()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
