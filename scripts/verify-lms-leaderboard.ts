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
//   5. ⚠⚠ THE SEAL. `league_lms_picks` has two SELECT policies (086) — your own
//      always, everyone else's only once the matchweek has LOCKED — and this
//      reader runs on the admin client, which honours neither. So the rule is
//      applied in code, and a mistake there publishes every live pick in the
//      pool. This script re-reads the picks itself and asserts that nothing a
//      viewer must not see came back, from TWO different viewers.
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

    // ---- the truth, read straight from the engine's own table -------------
    const { data: rounds, error: rErr } = await admin
      .from('league_lms_rounds')
      .select('round_id, round_number, last_matchweek')
      .eq('pool_id', pool.pool_id)
      .order('round_number', { ascending: false })
    if (rErr) {
      check(false, 'read lms rounds', rErr.message)
      continue
    }
    const round = (rounds ?? []).find((r) => r.last_matchweek === null) ?? (rounds ?? [])[0]

    const { data: survivorRows, error: sErr } = await admin
      .from('league_lms_survivors')
      .select('entry_id, eliminated_matchweek, is_winner')
      .eq('round_id', round?.round_id ?? '00000000-0000-0000-0000-000000000000')
    if (sErr) {
      check(false, 'read lms survivors', sErr.message)
      continue
    }
    const truth = new Map((survivorRows ?? []).map((s) => [s.entry_id, s]))

    // ---- who to read AS ----------------------------------------------------
    // The seal is per-viewer, so a null viewer exercises the one path no member
    // ever takes. Prefer somebody STILL IN: an eliminated viewer sees every
    // survivor sealed, so rendering as one prints a screen with no club on it.
    const { data: allMembers, error: mErr } = await admin
      .from('pool_members')
      .select('member_id, users(username)')
      .eq('pool_id', pool.pool_id)
    if (mErr) {
      check(false, 'read pool members', mErr.message)
      continue
    }
    const { data: allEntries, error: eErr } = await admin
      .from('pool_entries')
      .select('member_id, entry_id')
      .in('member_id', (allMembers ?? []).map((m) => m.member_id))
      .is('retired_at', null)
    if (eErr) {
      check(false, 'read pool entries', eErr.message)
      continue
    }
    const survivorMembers = new Set(
      (allEntries ?? [])
        .filter((e) => truth.get(e.entry_id)?.eliminated_matchweek === null)
        .map((e) => e.member_id),
    )
    const viewers = [...(allMembers ?? [])].sort(
      (a, b) => Number(survivorMembers.has(b.member_id)) - Number(survivorMembers.has(a.member_id)),
    )
    const viewer = viewers[0]?.member_id ?? null
    const otherViewer = viewers[1]?.member_id ?? null
    const uname = (m: (typeof viewers)[number] | undefined) => {
      const u = (m as { users?: unknown })?.users
      return (
        (Array.isArray(u) ? (u[0] as { username?: string })?.username : (u as { username?: string })?.username) ?? '?'
      )
    }

    const { leaderboard, error: lbErr } = await readLeagueLeaderboard(
      admin,
      pool.pool_id,
      { league_season_id: pool.league_season_id as string, league_mode: pool.league_mode as string },
      viewer,
    )
    if (lbErr || !leaderboard) {
      check(false, 'leaderboard read', lbErr ?? 'null')
      continue
    }

    console.log(
      `  round ${leaderboard.lms?.round_number ?? '—'} · ` +
        `${leaderboard.lms?.standing ?? 0} standing of ${leaderboard.lms?.in_round ?? 0}` +
        `   — as seen by @${uname((viewers ?? [])[0])}`,
    )
    // The chip each row will actually render, resolved the same way the
    // component does — so this output IS the screen, not a description of it.
    for (const r of leaderboard.rows) {
      const s = r.lms
      const chip = !s?.in_round
        ? 'NEXT ROUND'
        : s.eliminated_matchweek !== null
          ? `OUT · MW${s.eliminated_matchweek}`
          : s.pick
            ? `[crest] ${s.pick.club_name}`
            : s.pick_sealed
              ? '🔒 HIDDEN'
              : 'NO PICK'
      const dot = !s?.in_round ? '○' : s.eliminated_matchweek === null ? '●' : '◍'
      console.log(
        `    ${dot} ${(r.entry_name || r.full_name).padEnd(14)}` +
          `${(s?.rounds_won ?? 0) > 0 ? `🏆×${s?.rounds_won} ` : '     '}${chip}`,
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

    // ⚠ The crest is the chip, so a null `crest_url` renders a bare name. It is
    // nullable in the feed, so this is a data check, not a code one — and it is
    // the difference between a badge and a blank on every row.
    const { data: roundPicks } = await admin
      .from('league_lms_picks')
      .select('league_clubs(name, crest_url)')
      .eq('round_id', round?.round_id ?? '00000000-0000-0000-0000-000000000000')
    const clubsSeen = (roundPicks ?? []).map((p) => {
      const c = (p as { league_clubs?: unknown }).league_clubs
      return (Array.isArray(c) ? c[0] : c) as { name?: string; crest_url?: string | null } | null
    })
    const crestless = clubsSeen.filter((c) => !c?.crest_url).length
    check(crestless === 0, 'every club picked in this round has a crest to render', `${crestless} without`)

    // 5. No points claim. There are none in this mode.
    check(
      leaderboard.rows.every((r) => r.total_points === 0),
      'no entry claims points in a mode that has none',
    )

    // ---- 6. THE SEAL -------------------------------------------------------
    const week = leaderboard.lms?.pick_matchweek ?? null
    if (week === null) {
      console.log('  · no matchweek left to pick — seal checks skipped')
    } else {
      const { data: mw } = await admin
        .from('league_matchweeks')
        .select('lock_at')
        .eq('season_id', pool.league_season_id as string)
        .eq('matchweek_number', week)
        .maybeSingle()
      const locked = !!mw?.lock_at && new Date(mw.lock_at).getTime() <= Date.now()
      console.log(`  picks shown for MW${week} — ${locked ? 'LOCKED, public' : 'not locked, sealed'}`)

      check(
        leaderboard.lms?.pick_revealed === locked,
        'the reader agrees with the clock about whether MW' + week + ' has locked',
      )

      const ownEntries = new Set(
        leaderboard.rows.filter((r) => r.member_id === viewer).map((r) => r.entry_id),
      )
      if (locked) {
        // Everything in the round for that week should be on the board.
        const { data: real } = await admin
          .from('league_lms_picks')
          .select('entry_id, league_clubs(name)')
          .eq('matchweek_number', week)
        const realFor = new Map(
          (real ?? [])
            .filter((p) => leaderboard.rows.some((r) => r.entry_id === p.entry_id))
            .map((p) => {
              const c = (p as { league_clubs?: unknown }).league_clubs
              const name = Array.isArray(c)
                ? (c[0] as { name?: string })?.name
                : (c as { name?: string })?.name
              return [p.entry_id, name ?? null]
            }),
        )
        check(
          leaderboard.rows.every((r) =>
            realFor.has(r.entry_id) ? r.lms?.pick?.club_name === realFor.get(r.entry_id) : r.lms?.pick == null,
          ),
          'a locked week shows every club, and each is the right one',
        )
        check(
          leaderboard.rows.every((r) => r.lms?.pick_sealed === false),
          'nothing is marked hidden once the week has locked',
        )
      } else {
        // ⚠⚠ The one that matters. Nobody else's club may be on this board.
        const leaked = leaderboard.rows.filter((r) => r.lms?.pick && !ownEntries.has(r.entry_id))
        check(
          leaked.length === 0,
          'an unlocked week leaks NO rival club',
          leaked.length ? `LEAKED: ${leaked.map((r) => `${r.full_name}→${r.lms?.pick?.club_name}`).join(', ')}` : '',
        )
        check(
          leaderboard.rows.every((r) => (r.member_id === viewer ? r.lms?.pick_sealed === false : true)),
          'your own row is never marked hidden from you',
        )

        // A second viewer must see a DIFFERENT own-row — proof the seal is keyed
        // on the caller and not on something constant.
        if (otherViewer && otherViewer !== viewer) {
          const { leaderboard: other } = await readLeagueLeaderboard(
            admin,
            pool.pool_id,
            { league_season_id: pool.league_season_id as string, league_mode: pool.league_mode as string },
            otherViewer,
          )
          const otherLeak = (other?.rows ?? []).filter(
            (r) => r.lms?.pick && r.member_id !== otherViewer,
          )
          check(otherLeak.length === 0, 'a second viewer leaks no rival club either')
          check(
            (other?.rows ?? []).some((r) => r.member_id === otherViewer && r.lms?.pick_sealed === false),
            'the seal is keyed on the caller, not fixed',
          )
        }
      }
    }
  }

  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} CHECK(S) FAILED.`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
