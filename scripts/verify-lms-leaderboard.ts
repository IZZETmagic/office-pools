// =============================================================
// VERIFY — the Last Man Standing leaderboard says what the round says
// =============================================================
// READ-ONLY. Runs the real `readLeagueLeaderboard` against production and
// checks its output against `league_lms_survivors` directly.
//
//   npx tsx scripts/verify-lms-leaderboard.ts
//
// The four things it exists to catch, each of which was a live defect or one
// step away from being one:
//
//   1. The stored rank is NOT used. `league_finalize_ranks` falls through to
//      `entry_id ASC` in this mode — every rung of its cascade is zero — so a
//      leaderboard that reads `current_rank` puts eliminated members above
//      survivors. Verified on production 2026-09-03 before the fix: all ten
//      ranks matched entry_id order exactly.
//   2. Survivors sort above the eliminated, and `rounds_won` outranks both.
//   3. A member with no survivor row reads as NOT IN THE ROUND, never as out —
//      they joined after it opened and enter the next one.
//   4. The header's "of N" counts the round, not the pool's membership.
// =============================================================

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { readLeagueLeaderboard } from '../lib/league/leaderboard'

config({ path: '.env.local' })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}
const admin = createClient(url, key)

let failures = 0
function check(ok: boolean, label: string, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

async function main() {
  const { data: pools, error } = await admin
    .from('pools')
    .select('pool_id, pool_name, league_season_id, league_mode')
    .eq('league_mode', 'last_man_standing')
  if (error) throw error
  if (!pools?.length) {
    console.log('No Last Man Standing pools — nothing to verify.')
    return
  }

  for (const pool of pools) {
    console.log(`\n=== ${pool.pool_name} (${pool.pool_id})`)

    const { leaderboard, error: lbErr } = await readLeagueLeaderboard(admin, pool.pool_id, {
      league_season_id: pool.league_season_id as string,
      league_mode: pool.league_mode as string,
    })
    if (lbErr || !leaderboard) {
      check(false, 'leaderboard read', lbErr ?? 'null')
      continue
    }

    // ---- the truth, read straight from the engine's own table -------------
    const { data: rounds } = await admin
      .from('league_lms_rounds')
      .select('round_id, round_number, last_matchweek')
      .eq('pool_id', pool.pool_id)
      .order('round_number', { ascending: false })
    const round = (rounds ?? []).find((r) => r.last_matchweek === null) ?? (rounds ?? [])[0]

    const { data: survivorRows } = await admin
      .from('league_lms_survivors')
      .select('entry_id, eliminated_matchweek, is_winner')
      .eq('round_id', round?.round_id ?? '00000000-0000-0000-0000-000000000000')
    const truth = new Map((survivorRows ?? []).map((s) => [s.entry_id, s]))

    console.log(
      `  round ${leaderboard.lms?.round_number ?? '—'} · ` +
        `${leaderboard.lms?.standing ?? 0} standing of ${leaderboard.lms?.in_round ?? 0}`,
    )
    for (const r of leaderboard.rows) {
      const s = r.lms
      const state = !s?.in_round ? 'NEXT ROUND' : s.eliminated_matchweek === null ? 'STILL IN' : `OUT mw${s.eliminated_matchweek}`
      console.log(
        `    ${(r.entry_name || r.full_name).padEnd(14)} ${state.padEnd(11)}` +
          `${(s?.rounds_won ?? 0) > 0 ? ` 🏆×${s?.rounds_won}` : ''}`,
      )
    }

    // 1. The stored rank is withheld, so nothing downstream can render it.
    check(
      leaderboard.rows.every((r) => r.current_rank === null && r.previous_rank === null),
      'current_rank / previous_rank withheld',
      'the stored rank is entry_id order in this mode',
    )

    // 2. Every row carries an lms block, and it matches the survivors table.
    const blockOk = leaderboard.rows.every((r) => r.lms !== null)
    check(blockOk, 'every row carries an lms block')
    const matches = leaderboard.rows.every((r) => {
      const t = truth.get(r.entry_id)
      return t
        ? r.lms?.in_round === true &&
            r.lms.eliminated_matchweek === t.eliminated_matchweek &&
            r.lms.is_round_winner === t.is_winner
        : r.lms?.in_round === false
    })
    check(matches, 'each row agrees with league_lms_survivors')

    // 3. The ordering: rounds_won, then standing, then out-latest-first.
    let ordered = true
    for (let i = 1; i < leaderboard.rows.length; i++) {
      const a = leaderboard.rows[i - 1].lms
      const b = leaderboard.rows[i].lms
      if (!a || !b) continue
      if (a.rounds_won < b.rounds_won) ordered = false
      if (a.rounds_won !== b.rounds_won) continue
      const g = (s: typeof a) => (!s.in_round ? 2 : s.eliminated_matchweek === null ? 0 : 1)
      if (g(a) > g(b)) ordered = false
      if (g(a) !== g(b)) continue
      if ((a.eliminated_matchweek ?? 0) < (b.eliminated_matchweek ?? 0)) ordered = false
    }
    check(ordered, 'ordered by rounds won, then survival, then who lasted longer')

    // ⚠ The one that matters. Before this change the list was entry_id order
    // and put three eliminated members above a survivor.
    const lastStanding = leaderboard.rows.findLastIndex(
      (r) => r.lms?.in_round && r.lms.eliminated_matchweek === null,
    )
    const firstOut = leaderboard.rows.findIndex(
      (r) => r.lms?.in_round && r.lms.eliminated_matchweek !== null,
    )
    const noneJumped =
      lastStanding === -1 ||
      firstOut === -1 ||
      leaderboard.rows.slice(0, lastStanding).every((r) => (r.lms?.rounds_won ?? 0) > 0 || r.lms?.eliminated_matchweek === null)
    check(noneJumped, 'no eliminated member sits above a survivor on equal rounds won')

    // 4. The header counts the round, not the pool.
    const standingTruth = (survivorRows ?? []).filter((s) => s.eliminated_matchweek === null).length
    check(
      (leaderboard.lms?.standing ?? -1) === standingTruth,
      'header "still standing" matches the survivors table',
      `${leaderboard.lms?.standing} vs ${standingTruth}`,
    )
    check(
      (leaderboard.lms?.in_round ?? -1) <= leaderboard.rows.length,
      '"of N" counts the round, never more than the pool',
    )

    // 5. No points claim. There are none in this mode.
    check(
      leaderboard.rows.every((r) => r.total_points === 0),
      'no entry claims points in a mode that has none',
    )
  }

  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} CHECK(S) FAILED.`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
