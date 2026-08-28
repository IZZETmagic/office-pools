// =============================================================
// Showdown has to survive somebody joining in October
// =============================================================
// Decision 10: a pool can begin mid-season and a straggler picks up at the next
// available matchweek. Pick'em needs nothing for that — every deadline is a
// kickoff. Showdown is the mode with state, because its fairness rests on a
// published round-robin and every join flips the rotation's parity.
//
// Migration 100 changes two things, and both are the kind that fail quietly:
//
//   · a bye was worth 0. Correct for a fixed roster — "the circle method
//     rotates it, so everyone sits out the same number of matchweeks" — and
//     wrong once joins restart the rotation, at which point byes land unevenly
//     and cost ~1.5 points each against expectation.
//
//   · a join redrew the LIVE matchweek, because 095 rebuilt from the first
//     matchweek not yet LOCKED, which is the one members are picking in. Their
//     picks survived; the opponent they were being measured against did not.
//
// The behaviour needs a database, and lives in scripts/verify-showdown. This is
// the always-on half: it reads the migration as text and proves the two rules
// are still expressed, because nothing else fails when they are not — a bye
// silently worth zero looks exactly like a bye worth a point until somebody
// checks the leaderboard against the fixtures.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8')
const migration = read('lib/migrations/100_showdown_survives_a_late_joiner.sql')
const modeInfo = read('lib/leagueModeInfo.ts')
const rulesTab = read('app/pools/[pool_id]/LeagueScoringRulesTab.tsx')

describe('a bye is worth a point', () => {
  it('the settle function pays 1 for a duel with no opponent', () => {
    expect(migration).toMatch(/points_a = CASE WHEN acc\.b IS NULL THEN 1/)
  })

  it('and never pays the absent side anything', () => {
    // entry_b is the padding. It is nobody, so it scores NULL, not a point.
    expect(migration).toMatch(/points_b = CASE WHEN acc\.b IS NULL THEN NULL/)
  })

  it('a loss is still zero — the bye is not just "everything scores"', () => {
    const settle = migration.slice(migration.indexOf('points_a = CASE'))
    expect(settle).toMatch(/WHEN acc\.a > acc\.b THEN 3/)
    expect(settle).toMatch(/ELSE 0 END/)
  })
})

describe('a join never redraws the matchweek people are picking in', () => {
  it('the live matchweek is skipped when it already has a draw', () => {
    expect(migration).toMatch(/v_open_has_duels/)
    expect(migration).toMatch(
      /CASE WHEN v_open_has_duels THEN v_first_open \+ 1 ELSE v_first_open END/,
    )
  })

  it('⚠ but a FIRST generation still gets the live matchweek', () => {
    // The two cases are separated by whether duels already exist. Without that,
    // a pool created mid-season would skip the very matchweek its members can
    // pick in, and sit out a week for no reason.
    const guard = migration.slice(migration.indexOf('SELECT EXISTS ('))
    expect(guard).toMatch(/matchweek_number = v_first_open/)
    expect(guard).toMatch(/ELSE v_first_open END/)
  })

  it('still never rewrites a settled duel', () => {
    // The rule 095 established and 100 must not lose: a result is a result.
    expect(migration).toMatch(/settled_at IS NULL AND matchweek_number >= v_from_mw/)
    expect(migration).toMatch(/FROM league_duels WHERE pool_id = p_pool_id AND settled_at IS NOT NULL/)
  })

  it('still orders the roster by created_at, so existing pairs do not reshuffle', () => {
    expect(migration).toMatch(/ORDER BY pe\.created_at, pe\.entry_id/)
  })
})

describe('the copy matches the engine', () => {
  it('no longer promises everyone plays everyone the same number of times', () => {
    // True of a fixed roster, false the moment somebody joins in October —
    // a straggler necessarily gets fewer duels than the members from August.
    for (const [name, src] of [['leagueModeInfo', modeInfo], ['LeagueScoringRulesTab', rulesTab]] as const) {
      expect(src, name).not.toMatch(/everyone plays everyone the same number of times/)
    }
  })

  it('both surfaces tell the member a bye is worth a point', () => {
    expect(modeInfo).toMatch(/no opponent, so there was no defeat/)
    expect(rulesTab).toMatch(/no opponent, so there was no defeat/)
    expect(rulesTab).toContain('<PointsRow label="No opponent this week" value={1} />')
  })
})
