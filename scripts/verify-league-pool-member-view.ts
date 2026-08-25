// =============================================================
// verify-league-pool-member-view — would a member actually see a working pool?
// =============================================================
// L-A step 5 says "click through both pools in a browser, as the member". This
// is the half of that check which can be run without a member's credentials:
// it drives the SAME adapters the pool page drives (lib/league/read.ts) with a
// real pool id and a real entry id, and asserts the member would see fixtures,
// clubs, matchweeks and a correct open/locked split.
//
// It does NOT replace the browser pass — it cannot see a render error, a
// layout break, or a button that does nothing. It DOES catch the class of bug
// that made this pool empty for eight days: the read returning nothing.
//
//   npx tsx scripts/verify-league-pool-member-view.ts
//   npx tsx scripts/verify-league-pool-member-view.ts --pool PTQPZ797
//
// Exits 1 on any failure so it can gate a deploy.
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
import { readLeaguePoolView, readLeaguePredictions } from '../lib/league/read'

const admin = createAdminClient()
const arg = process.argv.indexOf('--pool')
const ONLY = arg > -1 ? process.argv[arg + 1] : null

let failures = 0
function check(label: string, ok: boolean, detail = '') {
  console.log(`    ${ok ? '✓' : '✗'} ${label}${detail ? `  — ${detail}` : ''}`)
  if (!ok) failures++
}

async function main() {
  console.log(`\n${'='.repeat(70)}`)
  console.log('  Would a member see a working league pool?')
  console.log('='.repeat(70))

  let q = admin
    .from('pools')
    .select('pool_id, pool_code, pool_name, league_season_id, tournament_id, archived_at, prediction_deadline')
    .eq('prediction_mode', 'league_pickem')
    .order('created_at', { ascending: true })
  if (ONLY) q = q.eq('pool_code', ONLY)

  const { data: pools, error } = await q
  if (error) {
    console.error(`  ✗ could not list league pools: ${error.message}`)
    process.exit(1)
  }
  if (!pools?.length) {
    console.error('  ✗ no league pools found')
    process.exit(1)
  }

  for (const pool of pools) {
    console.log(`\n  ${pool.pool_code} — ${pool.pool_name}`)
    console.log(`  ${'-'.repeat(66)}`)

    // The gate that made this pool empty for eight days.
    check('league_season_id is set', !!pool.league_season_id)
    check('not archived (visible in lists)', pool.archived_at === null,
      pool.archived_at ? `archived_at = ${pool.archived_at}` : '')
    if (!pool.league_season_id) {
      console.log('    (skipping the rest — every league branch is gated on that column)')
      continue
    }

    // The reveal gate: league_pickem is not 'progressive', so computeReveal
    // falls to the single pool-wide deadline. A past deadline reveals every
    // member's entire entry to everyone, all season.
    const deadlinePassed = pool.prediction_deadline
      ? new Date(pool.prediction_deadline).getTime() < Date.now()
      : false
    check('reveal gate closed (deadline still in the future)', !deadlinePassed,
      pool.prediction_deadline ?? 'no deadline')

    // Drive the real adapter the pool page drives.
    const { view, error: viewErr } = await readLeaguePoolView(admin, {
      poolId: pool.pool_id,
      seasonId: pool.league_season_id,
      tournamentId: pool.tournament_id ?? '',
    })
    check('readLeaguePoolView returned without error', !viewErr, viewErr ?? '')
    if (!view) {
      check('readLeaguePoolView returned a view', false)
      continue
    }

    check('teams are visible', view.teams.length > 0, `${view.teams.length} clubs`)
    check('fixtures are visible', view.matches.length > 0, `${view.matches.length} fixtures`)
    check('matchweeks are visible', view.roundStates.length > 0, `${view.roundStates.length} matchweeks`)

    // The open/locked split is the whole weekly rhythm. Getting it wrong in
    // either direction is a real bug: everything locked = nobody can play;
    // everything open = members pick matches that have already kicked off.
    //
    // State is DERIVED by matchweekToRoundState and lives on `state`, not on a
    // stored lock column — a league pool holds zero pool_round_states rows.
    const by = (s: string) => view.roundStates.filter((r) => r.state === s).length
    const open = by('open')
    const locked = by('locked')
    const completed = by('completed')
    check('at least one matchweek is still open to pick', open > 0, `${open} open`)
    check(
      'a matchweek that has already been played is not still open',
      open + locked + completed === view.roundStates.length && completed + locked > 0,
      `${completed} completed · ${locked} locked · ${open} open`,
    )

    // Decision 16: STRICTLY one matchweek open at a time, opening automatically
    // as the previous one locks. This used to be a `note` recording the gap —
    // the adapter deliberately opened every future matchweek. The matchweek
    // rhythm phase closed it, so it is a hard check now.
    check(
      'exactly one matchweek is open — decision 16',
      open === 1 || (open === 0 && completed === view.roundStates.length),
      open === 1 ? '1 open' : `${open} open — the rhythm is broken`,
    )

    // Entries reach a pool through pool_members — pool_entries has no pool_id.
    const { data: members } = await admin
      .from('pool_members')
      .select('member_id')
      .eq('pool_id', pool.pool_id)
    const memberIds = (members ?? []).map((m) => m.member_id)
    const { data: entries } = await admin
      .from('pool_entries')
      .select('entry_id, entry_name')
      .in('member_id', memberIds.length ? memberIds : ['00000000-0000-0000-0000-000000000000'])

    check('the pool has at least one entry', (entries?.length ?? 0) > 0, `${entries?.length ?? 0} entries`)

    for (const e of entries ?? []) {
      const { predictions, error: predErr } = await readLeaguePredictions(admin, e.entry_id)
      check(
        `readLeaguePredictions works for "${e.entry_name ?? e.entry_id.slice(0, 8)}"`,
        !predErr,
        predErr ?? `${predictions.length} picks`,
      )
    }

    // Containment: the load-bearing constraint. A league entry must never
    // acquire the two columns that open the World Cup scoring selectors.
    const { data: doors } = await admin
      .from('pool_entries')
      .select('entry_id, has_submitted_predictions, point_adjustment')
      .in('member_id', memberIds.length ? memberIds : ['00000000-0000-0000-0000-000000000000'])
    const touched = (doors ?? []).filter((d) => d.has_submitted_predictions || d.point_adjustment)
    check('World Cup scoring doors untouched', touched.length === 0,
      touched.length ? `${touched.length} entr(y/ies) have them set` : '')

    // Stray World-Cup-shaped rows for a league entry would score nothing and
    // confuse every audit.
    const entryIds = (entries ?? []).map((e) => e.entry_id)
    if (entryIds.length) {
      const { count: strayWc } = await admin
        // A VERIFIER reads the raw table on purpose: routing through lib/ would ask
        // the abstraction whether a row exists, and the point is to check what is
        // physically there regardless of what the abstraction reports.
        // eslint-disable-next-line no-restricted-syntax
        .from('predictions')
        .select('prediction_id', { count: 'exact', head: true })
        .in('entry_id', entryIds)
      check('no stray World Cup predictions', (strayWc ?? 0) === 0, `${strayWc ?? 0} rows`)

      const { count: rs } = await admin
        // A VERIFIER reads the raw table on purpose: routing through lib/ would ask
        // the abstraction whether a row exists, and the point is to check what is
        // physically there regardless of what the abstraction reports.
        // eslint-disable-next-line no-restricted-syntax
        .from('pool_round_states')
        .select('pool_id', { count: 'exact', head: true })
        .eq('pool_id', pool.pool_id)
      check('no stale pool_round_states', (rs ?? 0) === 0, `${rs ?? 0} rows`)
    }
  }

  console.log(`\n${'='.repeat(70)}`)
  if (failures) {
    console.log(`  ${failures} check(s) FAILED`)
    console.log('='.repeat(70) + '\n')
    process.exit(1)
  }
  console.log('  All checks passed.')
  console.log('  ⚠ Still owed: a human clicking through in a browser as a member.')
  console.log('='.repeat(70) + '\n')
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e))
  process.exit(1)
})
