// =============================================================
// run-league-reconcile — the daily schedule reconcile, by hand.
// =============================================================
// The counterpart to `run-league-sync.ts`, and the reason it exists: the
// per-minute sync only looks within ~3h of the kickoff it already holds, so a
// game moved months out is invisible to it until the ORIGINAL kickoff arrives —
// by which point the matchweek has locked and re-homing refuses the move.
//
//   npx tsx scripts/run-league-reconcile.ts          # DRY by default
//   npx tsx scripts/run-league-reconcile.ts --apply  # actually write
//
// Dry by default deliberately: this is the one arm that rewrites the SCHEDULE,
// and seeing what it would do costs the same single api-football call.
// =============================================================

import { readFileSync } from 'fs'
import { resolve } from 'path'

;(() => {
  const env = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
  for (const line of env.split('\n')) {
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
import {
  reconcileLeagueSchedule,
  formatLeagueReconcileNote,
} from '../lib/integrations/apiFootball/reconcileLeagueSchedule'

async function main() {
  const apply = process.argv.includes('--apply')
  const admin = createAdminClient()

  console.log(`Run at ${new Date().toISOString()} — ${apply ? 'APPLYING' : 'DRY RUN'}\n`)

  const { data: seasons, error } = await admin
    .from('league_seasons')
    .select('season_id, competition_name, external_league_id, external_season')
    .range(0, 999)
  if (error) throw new Error(error.message)

  for (const s of (seasons ?? []) as Array<{
    season_id: string; competition_name: string
    external_league_id: number; external_season: number
  }>) {
    console.log(`--- ${s.competition_name} ---`)
    const r = await reconcileLeagueSchedule(admin, {
      seasonId: s.season_id,
      externalLeagueId: s.external_league_id,
      externalSeason: s.external_season,
      dryRun: !apply,
    })
    console.log(`NOTE  : ${formatLeagueReconcileNote(r)}`)

    if (r.detected.length === 0) {
      console.log('MOVES : none — every future kickoff matches the feed')
    } else {
      for (const m of r.detected) {
        const d = m.shiftMinutes
        const human =
          Math.abs(d) >= 1440 ? `${(d / 1440).toFixed(1)} days` : `${(d / 60).toFixed(1)} hours`
        console.log(
          `MOVE  : ${m.externalFixtureId}  ${m.oldKickoff} -> ${m.newKickoff}  (${d > 0 ? '+' : ''}${human})`,
        )
      }
    }
    if (r.unmatched.length > 0) console.log(`UNMATCHED: ${r.unmatched.join(', ')}`)
    if (r.errors.length > 0) {
      for (const e of r.errors) console.log(`ERROR : [${e.stage}] ${e.message}`)
    }
    console.log()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
