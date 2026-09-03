// =============================================================
// VERIFY — the Last Man Standing round, as the picker and the wall read it
// =============================================================
// READ-ONLY. Checks what `GET /api/pools/:id/lms` assembles, against production.
//
//   npx tsx scripts/verify-lms-round.ts
//
// The route itself needs a session, so this exercises the same helpers with the
// same arguments rather than calling it. Four things it exists to catch:
//
//   1. ⚠ A CLUB WITH NO FIXTURE MUST BE UNPICKABLE. Backing a club that is not
//      playing is a free pass — you cannot be beaten by a match nobody played —
//      and the grid can only grey those tiles if the fixture map omits them.
//      `league_fixtures` has NO `matchweek_number` column, so the naive filter
//      returns zero rows at HTTP 200 and EVERY club reads "not playing".
//   2. The wall's columns cover only weeks the round actually reaches. A round
//      can open on the week AFTER the one in play (106 re-homing), and a column
//      for an earlier week is empty for everybody — which reads as a matchweek
//      the whole pool failed to pick in.
//   3. `used_in_matchweek` is the club-once-per-round rule made visible. The
//      database enforces it as a unique violation; a member finding out by
//      tapping a crest and being refused is the screen this replaces.
//   4. ⚠⚠ RLS IS STILL ON `league_lms_picks`. The route reads that table with
//      the CALLER's client precisely so the database does the gating — which
//      only works while the policies exist. An anonymous read must come back
//      empty, and empty is what a dropped policy would NOT produce.
// =============================================================

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { readLmsState } from '../lib/league/lms'
import { readSeasonClubs } from '../lib/league/table'
import { inPlayMatchweekId, openMatchweekId, readMatchweekFixtureByClub } from '../lib/league/read'

config({ path: '.env.local' })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!url || !key || !anonKey) {
  console.error('Missing SUPABASE env in .env.local')
  process.exit(1)
}
const admin = createClient(url, key)
const anon = createClient(url, anonKey)

let failures = 0
function check(ok: boolean, label: string, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

async function main() {
  const { data: pools, error } = await admin
    .from('pools')
    .select('pool_id, pool_name, league_season_id')
    .eq('league_mode', 'last_man_standing')
  if (error) throw error
  if (!pools?.length) {
    console.log('No Last Man Standing pools — nothing to verify.')
    return
  }

  for (const pool of pools) {
    console.log(`\n=== ${pool.pool_name}`)
    const seasonId = pool.league_season_id as string

    const [state, clubsRes] = await Promise.all([
      // Admin here reads EVERY pick, which is the opposite of what the route
      // does — deliberately, so the checks below can compare what a member
      // would see against the whole truth.
      readLmsState(admin, pool.pool_id, []),
      readSeasonClubs(admin, seasonId),
    ])
    if (state.error) {
      check(false, 'read lms state', state.error)
      continue
    }
    if (clubsRes.error) {
      check(false, 'read season clubs', clubsRes.error)
      continue
    }
    if (!state.round) {
      console.log('  no open round — nothing to pick')
      continue
    }

    const { data: weeks, error: wErr } = await admin
      .from('league_matchweeks')
      .select(
        'matchweek_id, matchweek_number, fixture_count, completed_fixture_count, lock_at, first_kickoff_at, ranks_snapshot_at',
      )
      .eq('season_id', seasonId)
    if (wErr) {
      check(false, 'read matchweeks', wErr.message)
      continue
    }
    const now = Date.now()
    const open = (weeks ?? []).find((w) => w.matchweek_id === openMatchweekId(weeks ?? [], now)) ?? null
    const inPlay = (weeks ?? []).find((w) => w.matchweek_id === inPlayMatchweekId(weeks ?? [], now)) ?? null
    const first = state.round.first_matchweek

    console.log(
      `  round ${state.round.round_number} from MW${first} · ` +
        `open=${open?.matchweek_number ?? '—'} in play=${inPlay?.matchweek_number ?? '—'}`,
    )

    // 2. Columns only cover weeks the round reaches.
    const allPicks = [...state.myPicks, ...state.revealedPicks]
    const inRound = (n: number | null | undefined) => n != null && n >= first
    const columns = [
      ...new Set([
        ...allPicks.map((p) => p.matchweek_number),
        ...(inRound(inPlay?.matchweek_number) ? [inPlay!.matchweek_number] : []),
        ...(inRound(open?.matchweek_number) ? [open!.matchweek_number] : []),
      ]),
    ].sort((a, b) => a - b)
    console.log(`  wall columns: ${columns.map((c) => `MW${c}`).join(' ') || '(none)'}`)
    check(
      columns.every((c) => c >= first),
      'no wall column predates the round',
    )

    // 3. Used clubs, per entry, are exactly that entry's picks in the round.
    const byEntry = new Map<string, Set<string>>()
    for (const p of allPicks) {
      const s = byEntry.get(p.entry_id) ?? new Set<string>()
      s.add(p.club_id)
      byEntry.set(p.entry_id, s)
    }
    const doubleSpent = [...byEntry.entries()].filter(([entryId, clubs]) => {
      const picks = allPicks.filter((p) => p.entry_id === entryId)
      return picks.length !== clubs.size
    })
    check(
      doubleSpent.length === 0,
      'nobody has spent the same club twice in this round',
      doubleSpent.length ? `${doubleSpent.length} entries` : '',
    )

    // 1. ⚠ The fixture map. This is the one that fails silently.
    if (open && inRound(open.matchweek_number)) {
      const { byClub, error: fxErr } = await readMatchweekFixtureByClub(
        admin,
        seasonId,
        open.matchweek_number,
      )
      if (fxErr) {
        check(false, 'read matchweek fixtures', fxErr)
      } else {
        const playing = byClub.size
        console.log(`  MW${open.matchweek_number}: ${playing} of ${clubsRes.clubs.length} clubs have a game`)
        check(
          playing > 0,
          'the fixture map is not empty',
          'every club reading "not playing" is the no-matchweek_number-column bug',
        )
        // Two clubs per fixture, so an even count — and never more clubs than
        // the season has.
        check(playing % 2 === 0, 'clubs with a game come in pairs', `${playing}`)
        check(playing <= clubsRes.clubs.length, 'no club is playing that is not in the season')
        check(
          [...byClub.values()].every((f) => !!f.opponentName),
          'every fixture names its opponent — "v" and "at" need a name to attach to',
        )
      }
    } else {
      console.log('  no open matchweek in this round — the picker says so rather than showing a grid')
    }

    // 4. ⚠⚠ The seal is the database's, so prove the database still has it.
    const { data: anonPicks, error: anonErr } = await anon
      .from('league_lms_picks')
      .select('entry_id, club_id')
      .eq('round_id', state.round.round_id)
    check(
      !anonErr && (anonPicks ?? []).length === 0,
      'RLS still hides league_lms_picks from an unauthenticated read',
      anonErr ? `errored: ${anonErr.message}` : `${(anonPicks ?? []).length} rows came back`,
    )
    // The same read on admin DOES return rows — otherwise the check above passes
    // for the boring reason that there is nothing to hide.
    check(
      allPicks.length > 0,
      'there were picks to hide in the first place',
      `${allPicks.length} in the round`,
    )
  }

  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} CHECK(S) FAILED.`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
