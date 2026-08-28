// =============================================================
// L11: the write half of a moved kickoff
// =============================================================
// The mapper decides what to send (leagueMappers.test.ts). This is everything
// downstream of that decision, and all of it fails SILENTLY:
//
//   · a column missing from the sync's PROJECTION reads as `undefined`, not as
//     an error, so a "first move only" guard fires on every move forever;
//   · a column missing from the RPC's DISTINCT FROM predicate makes the write
//     succeed and then go unreported;
//   · a guard missing from the RPC lets the feed restate a played match.
//
// None of those turn anything red. They just quietly do the wrong thing to the
// one event the feature exists to catch, so they are asserted here as text.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8')
const sync = read('lib/integrations/apiFootball/syncLeagueFixtures.ts')
const m105 = read('lib/migrations/105_the_sync_may_move_a_kickoff.sql')
const m053 = read('lib/migrations/053_l3_matchweek_window_and_sync_rpc.sql')

describe('the sync reads back what it needs to compare', () => {
  it('⚠ selects original_kickoff_at', () => {
    // THE BUG THIS FILE EXISTS FOR. The mapper stamps the original only when the
    // row does not already carry one — and the projection did not ask for the
    // column, so it never did. Every move was a first move, and the true
    // original would have been overwritten by the previous postponement.
    expect(sync).toMatch(/PROJECTION[\s\S]{0,400}original_kickoff_at/)
  })

  it('and kickoff_at, which is what "has this moved" is measured against', () => {
    expect(sync).toMatch(/PROJECTION[\s\S]{0,400}kickoff_at/)
  })
})

describe('the RPC writes the move', () => {
  it('accepts both timestamps behind their own set_ flags', () => {
    for (const field of [
      'set_kickoff          boolean',
      'kickoff_at           timestamptz',
      'set_original_kickoff boolean',
      'original_kickoff_at  timestamptz',
    ]) {
      expect(m105, field).toContain(field)
    }
  })

  it('assigns them', () => {
    expect(m105).toMatch(/kickoff_at\s+= v\.n_kickoff_at/)
    expect(m105).toMatch(/original_kickoff_at = v\.n_original_kickoff_at/)
  })

  it('⚠ compares kickoff_at too, or the move is written and never reported', () => {
    // A postponement moves NOTHING else: same status, same empty score. Left out
    // of the predicate it files as "no change", and `changed` — which is what
    // scoring, standings and the applied-count all read — never mentions it.
    // Anchored on the code, not on prose: the header DISCUSSES the predicate,
    // and an earlier `indexOf` lands in the commentary rather than the SQL.
    const pred = m105.slice(m105.indexOf('AND (f.status'), m105.indexOf('RETURNING f.fixture_id'))
    expect(pred).toContain('IS DISTINCT FROM')
    expect(pred).toMatch(/f\.kickoff_at, f\.original_kickoff_at/)
    expect(pred).toMatch(/v\.n_kickoff_at, v\.n_original_kickoff_at/)
  })

  it('returns the kickoff, so the caller can confirm it landed', () => {
    const ret = m105.slice(m105.indexOf('RETURNING'))
    expect(ret).toMatch(/f\.kickoff_at/)
  })
})

describe('the two guards the database owns', () => {
  it('a completed fixture is never moved', () => {
    // Both branches, because moving the original alone would be as wrong.
    // Matched with its CASE so the header's own mention of the guard does not
    // count as an implementation of it — a migration that only TALKS about a
    // rule reads identically to one that applies it.
    const guards = m105.match(/COALESCE\(r\.set_\w+, false\) AND NOT f\.is_completed/g) ?? []
    expect(guards.length).toBe(2)
  })

  it('the original is COALESCEd, so the FIRST one recorded stands', () => {
    expect(m105).toMatch(/COALESCE\(f\.original_kickoff_at, r\.original_kickoff_at\)/)
  })

  it('a manual_override row is still untouchable', () => {
    // An admin who pinned a kickoff outranks the feed. Unchanged from 053, and
    // asserted here because 105 rewrites the whole function.
    expect(m105).toMatch(/WHERE NOT f\.manual_override/)
  })

  it('⚠ 105 does not also claim to write matchweek_id', () => {
    // Moving the fixture between matchweeks is re-homing, and it is a separate
    // decision with a floor on how small a round may get. Writing it here would
    // re-home one fixture at a time with no view of the round it left.
    const upd = m105.slice(m105.indexOf('UPDATE league_fixtures f'), m105.indexOf('RETURNING'))
    expect(upd).not.toMatch(/matchweek_id\s*=/)
  })
})

describe('the deadline follows the fixture without any code in 104', () => {
  it('the window trigger already fires on kickoff_at', () => {
    // This is why 105 does not touch league_matchweeks. If the UPDATE OF list
    // ever loses kickoff_at, a moved fixture stops moving its deadline and the
    // failure is invisible — the matchweek simply locks on a match nobody is
    // playing.
    expect(m053).toMatch(
      /AFTER UPDATE OF kickoff_at, is_completed, matchweek_id ON league_fixtures/,
    )
  })

  it('and 101 only re-derives a lock that has not already passed', () => {
    // The half that keeps a reschedule from reopening a matchweek people have
    // finished picking in, or slamming shut one they have not.
    const m101 = read('lib/migrations/101_the_matchweek_window_follows_the_clock.sql')
    expect(m101).toMatch(/WHEN mw\.lock_at IS NULL OR mw\.lock_at > now\(\)/)
  })
})
