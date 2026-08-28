// =============================================================
// Last Man Standing: you cannot back a club that is not playing
// =============================================================
// ⚠ THIS CLOSED AN EXPLOIT, not a cosmetic gap.
//
// `league_lms_settle` (087) survives an entry when there is no COMPLETED
// fixture for its club that matchweek, commented "no completed fixture: not
// beaten". Right for a postponement — and it fires identically for a club with
// no fixture AT ALL. So picking a club that was not playing was a guaranteed
// survival. Once Decision 10's re-homing lands, blank matchweeks become normal,
// and in one of those every member could take a non-playing club and nobody
// would ever go out. The mode would stop being a game.
//
// It is blocked at the DOOR rather than unpicked at the end, and that asymmetry
// is deliberate: re-homing can move a fixture out of a matchweek AFTER somebody
// has picked it, and punishing them for a fixture change they could not see
// would be tightening the wrong half. So the pick is refused, and the settle
// branch stays generous.
//
// The behaviour needs a database. This is the always-on half: the guards are
// read as text, because a silent-skip trigger that loses a clause fails by
// accepting a pick it should refuse, and nothing anywhere goes red.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8')
const m103 = read('lib/migrations/103_one_open_matchweek_and_a_club_that_plays.sql')
const m087 = read('lib/migrations/087_last_man_standing_engine.sql')
const tab = read('app/pools/[pool_id]/SurvivorTab.tsx')

describe('the pick is refused at the door', () => {
  it('the club must have a fixture in that matchweek', () => {
    const guard = m103.slice(m103.indexOf('enforce_lms_pick_before_lock'))
    expect(guard).toMatch(/INTO v_plays/)
    expect(guard).toMatch(/f\.home_club_id = NEW\.club_id OR f\.away_club_id = NEW\.club_id/)
    expect(guard).toMatch(/IF NOT v_plays THEN\s*\n\s*RETURN NULL;/)
  })

  it('⚠ and settle stays generous, so a moved fixture cannot eliminate anybody', () => {
    // If this branch is ever tightened to match the pick guard, a member whose
    // club was re-homed out of the matchweek after they picked would go out for
    // something they could not see.
    expect(m087).toMatch(/THEN true\s+-- no completed fixture: not beaten/)
    // 103 may DISCUSS the settle function in its header — it must not redefine it.
    expect(m103).not.toMatch(/FUNCTION public\.league_lms_settle/)
  })
})

describe('one definition of the open matchweek', () => {
  it('both pick guards call the function rather than inlining the rule', () => {
    // Migration 101 changed `league_open_matchweek` to order by lock time, and
    // there were FOUR copies of that rule. The two guards inlined it, so after
    // 101 the function would open matchweek 29 while the guards still only
    // accepted picks for 28 — every pick refused, silently.
    for (const fn of ['enforce_league_prediction_before_lock', 'enforce_lms_pick_before_lock']) {
      const body = m103.slice(m103.indexOf(fn))
      expect(body, fn).toMatch(/league_open_matchweek\(v_season\)/)
    }
  })

  it('neither guard still orders matchweeks by number', () => {
    expect(m103).not.toMatch(/ORDER BY m\.matchweek_number/)
  })
})

describe('the picker says why a club cannot be tapped', () => {
  it('a club with no fixture is disabled', () => {
    expect(tab).toMatch(/const notPlaying = fixture === null/)
    expect(tab).toMatch(/disabled=\{spent \|\| notPlaying \|\| saving !== null\}/)
  })

  it('and is labelled, because a blank space reads as a loading state', () => {
    expect(tab).toContain('not playing this week')
  })

  it('the rule is stated under the grid, not only enforced', () => {
    // What you have left to spend IS the game, so the constraint is the
    // interesting part rather than an error to discover by tapping.
    expect(tab).toMatch(/Clubs with no game this matchweek can&apos;t be picked/)
  })
})
