/**
 * verify-start-matchweek.ts — migration 143, against PRODUCTION.
 *
 * READ-ONLY. Every check is a SELECT; nothing here writes, and nothing here
 * needs a scratch pool. That is deliberate: the thing being verified is a
 * column and two floors, and both can be read.
 *
 *   npx tsx scripts/verify-start-matchweek.ts
 *
 * ⚠ RUN IT AFTER APPLYING 143 AND AGAIN AFTER DEPLOYING. The column existing
 * proves the migration landed; the create route honouring it proves the deploy
 * did, and those are two different days in this repo.
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { openMatchweekId, type MatchweekRow } from '../lib/league/read'
import { startMatchweekOptions } from '../lib/league/startMatchweek'

config({ path: '.env.local' })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing SUPABASE env in .env.local')
  process.exit(1)
}
const admin = createClient(url, key)

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    passed++
    console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ''}`)
  } else {
    failed++
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

async function main() {
  console.log('\n=== 143: the pool says when it starts ===\n')

  // ---- 1. the column exists and is readable -------------------------------
  const { data: pools, error: poolErr } = await admin
    .from('pools')
    .select('pool_id, pool_name, league_mode, league_season_id, league_start_matchweek')
    .not('league_season_id', 'is', null)
  if (poolErr) {
    console.error(`\n🔴 could not read pools.league_start_matchweek: ${poolErr.message}`)
    console.error('   If this is "column does not exist", migration 143 has not been applied.')
    process.exit(1)
  }
  check('pools.league_start_matchweek is readable', true, `${pools?.length ?? 0} league pools`)

  // ---- 2. the CHECK that table mode never carries one ---------------------
  const tableWithStart = (pools ?? []).filter(
    (p) => p.league_mode === 'table' && p.league_start_matchweek !== null,
  )
  check(
    'no table pool carries a start matchweek (Decision 11 — a full-time table has no start week)',
    tableWithStart.length === 0,
    tableWithStart.map((p) => p.pool_name).join(', ') || 'none',
  )

  // ---- 3. every stored start is a real matchweek in its own season --------
  const withStart = (pools ?? []).filter((p) => p.league_start_matchweek !== null)
  for (const p of withStart) {
    const { data: mw } = await admin
      .from('league_matchweeks')
      .select('matchweek_number, lock_at, fixture_count')
      .eq('season_id', p.league_season_id!)
      .eq('matchweek_number', p.league_start_matchweek!)
      .maybeSingle()
    check(
      `${p.pool_name}: starts at a matchweek its season actually has`,
      !!mw,
      `MW ${p.league_start_matchweek}`,
    )
    // ⚠ Not "unlocked" — by now it may well have been played, which is the
    // normal state of a pool that is under way. What must hold is that it was
    // never floored into an EMPTY week: an empty matchweek never opens, so a
    // pool floored into one waits for an invitation that never comes.
    check(
      `${p.pool_name}: its start matchweek has fixtures`,
      (mw?.fixture_count ?? 0) > 0,
      `${mw?.fixture_count ?? 0} fixtures`,
    )
  }

  // ---- 4. an LMS round never precedes its pool's start ---------------------
  // This is the defect 143 exists for, stated as an invariant. `league_lms_settle`
  // refuses a matchweek earlier than the round's own start (097), so a round
  // that begins before the pool does is a pool playing weeks it never chose.
  const lmsPools = (pools ?? []).filter((p) => p.league_mode === 'last_man_standing')
  for (const p of lmsPools) {
    const { data: rounds } = await admin
      .from('league_lms_rounds')
      .select('round_number, first_matchweek, last_matchweek')
      .eq('pool_id', p.pool_id)
      .order('round_number')
    const r1 = (rounds ?? []).find((r) => r.round_number === 1)
    if (p.league_start_matchweek === null) {
      check(`${p.pool_name}: (no start matchweek — created before 143)`, true,
        `round 1 starts MW ${r1?.first_matchweek ?? '—'}`)
      continue
    }
    check(
      `${p.pool_name}: round 1 does not start before the pool does`,
      (r1?.first_matchweek ?? 0) >= p.league_start_matchweek,
      `round 1 MW ${r1?.first_matchweek} vs pool MW ${p.league_start_matchweek}`,
    )
  }

  // ---- 5. no Showdown duel is scheduled before its pool started -----------
  const showdownPools = (pools ?? []).filter(
    (p) => p.league_mode === 'showdown' && p.league_start_matchweek !== null,
  )
  for (const p of showdownPools) {
    const { data: early } = await admin
      .from('league_duels')
      .select('duel_id, matchweek_number')
      .eq('pool_id', p.pool_id)
      .lt('matchweek_number', p.league_start_matchweek!)
    check(
      `${p.pool_name}: no duel before matchweek ${p.league_start_matchweek}`,
      (early ?? []).length === 0,
      `${(early ?? []).length} early duels`,
    )
  }

  // ---- 6. the floor, run against real matchweeks --------------------------
  // The TS rule and the data together, rather than either alone. A pool whose
  // start has not arrived must be owed its START week, never an earlier one.
  const seasonIds = [...new Set((pools ?? []).map((p) => p.league_season_id!))]
  for (const seasonId of seasonIds) {
    const { data: weeks } = await admin
      .from('league_matchweeks')
      .select('matchweek_id, matchweek_number, lock_at, first_kickoff_at, fixture_count, completed_fixture_count, ranks_snapshot_at')
      .eq('season_id', seasonId)
    const rows = (weeks ?? []) as unknown as MatchweekRow[]
    const now = Date.now()

    const unfloored = rows.find((r) => r.matchweek_id === openMatchweekId(rows, now))
    for (const p of (pools ?? []).filter((x) => x.league_season_id === seasonId && x.league_start_matchweek !== null)) {
      const floored = rows.find(
        (r) => r.matchweek_id === openMatchweekId(rows, now, p.league_start_matchweek),
      )
      check(
        `${p.pool_name}: the open matchweek respects the floor`,
        floored === undefined || floored.matchweek_number >= p.league_start_matchweek!,
        `open ${floored?.matchweek_number ?? 'none'} (unfloored ${unfloored?.matchweek_number ?? 'none'}), floor ${p.league_start_matchweek}`,
      )
    }

    // ---- 7. the chooser would offer something --------------------------
    // A wizard opened right now on this season must have at least one option,
    // or the create route's own 409 is the honest answer and the screen should
    // be saying so rather than showing an empty card.
    const opts = startMatchweekOptions(
      rows
        .filter((r) => r.fixture_count > 0)
        .map((r) => ({ number: r.matchweek_number, label: null, lockAt: r.lock_at as string })),
      now,
    )
    check(
      `season ${seasonId.slice(0, 8)}: the start-matchweek chooser has options`,
      opts.length > 0,
      opts.map((o) => `MW${o.number} (${o.closesIn})`).join(', ') || 'NONE — the wizard would refuse',
    )
  }

  console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed\n`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
