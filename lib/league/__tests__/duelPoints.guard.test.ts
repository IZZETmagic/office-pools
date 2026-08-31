// =============================================================
// The duel's point values must match the engine that writes them
// =============================================================
// `lib/league/duelPoints.ts` does not compute anything — SQL does. It exists so
// the front end can turn a stored number back into "won" / "tied" / "lost", and
// that only works while the two agree.
//
// Getting it wrong is silent in the worst way: `DuelsTab` would read a settled
// 500 and classify it as a loss, so a member who WON their duel is shown a
// defeat while the leaderboard — which reads the same row through SQL — has
// them going up. Nothing errors. This exact class of split already produced the
// "false win tick" bug on the team sheet.
//
// So the values are read out of the migration itself rather than restated here.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

import { DUEL_WIN, DUEL_TIE, DUEL_BYE, DUEL_LOSS, duelResult } from '../duelPoints'

const MIGRATION = '121_a_duel_is_worth_half_a_perfect_week.sql'
const sql = readFileSync(resolve(process.cwd(), 'lib/migrations', MIGRATION), 'utf8')

/**
 * The `points_a` CASE from `league_score_duels`, which is the authority.
 *
 *     points_a = CASE WHEN acc.b IS NULL THEN 250
 *                     WHEN acc.a > acc.b THEN 500
 *                     WHEN acc.a = acc.b THEN 250
 *                     ELSE 0 END,
 */
function pointsACase(): { bye: number; win: number; tie: number; loss: number } | null {
  const m = sql.match(
    /points_a = CASE WHEN acc\.b IS NULL THEN (\d+)\s*\n\s*WHEN acc\.a > acc\.b THEN (\d+)\s*\n\s*WHEN acc\.a = acc\.b THEN (\d+)\s*\n\s*ELSE (\d+) END/,
  )
  return m ? { bye: +m[1], win: +m[2], tie: +m[3], loss: +m[4] } : null
}

describe('duel point values match league_score_duels', () => {
  const c = pointsACase()

  it('the CASE was found and parsed — a rewrite must fail here, not pass silently', () => {
    expect(c, `could not parse the points_a CASE out of ${MIGRATION}`).not.toBeNull()
  })

  it('a win is what the engine writes for a win', () => expect(DUEL_WIN).toBe(c!.win))
  it('a tie is what the engine writes for a tie', () => expect(DUEL_TIE).toBe(c!.tie))
  it('a bye is what the engine writes for a bye', () => expect(DUEL_BYE).toBe(c!.bye))
  it('a loss is what the engine writes for a loss', () => expect(DUEL_LOSS).toBe(c!.loss))

  it('a bye is worth exactly a tie, so nothing may tell them apart by value', () => {
    // Migration 100: "no opponent, so no defeat". If these ever diverge, every
    // caller that separates a bye structurally becomes wrong instead of merely
    // redundant — so it is a deliberate assertion, not a coincidence.
    expect(DUEL_BYE).toBe(DUEL_TIE)
  })
})

describe('duelResult', () => {
  it('classifies the three outcomes the engine can write', () => {
    expect(duelResult(DUEL_WIN)).toBe('won')
    expect(duelResult(DUEL_TIE)).toBe('tied')
    expect(duelResult(DUEL_LOSS)).toBe('lost')
  })

  it('is null for an unsettled duel rather than guessing a loss', () => {
    // points_b is NULL on a bye and on anything not yet settled. Reading that
    // as 0 would paint a defeat onto a duel nobody has played.
    expect(duelResult(null)).toBeNull()
  })

  it('survives the values being raised again without a code change', () => {
    // Thresholds are >=, not ==, so a future migration that pays 600/300 still
    // classifies correctly even if this file is updated a commit later.
    expect(duelResult(600)).toBe('won')
    expect(duelResult(300)).toBe('tied')
  })
})

describe('the SQL and the ranker still agree about what duel points are for', () => {
  it('league_finalize_ranks ADDS duel points rather than ranking ahead of them', () => {
    // The whole point of raising 3 to 500. If someone restores the cascade, the
    // number stops meaning anything and this test says so.
    expect(sql).toMatch(/\(t\.total_points \+ t\.duel_points\)\s+DESC/)
    expect(sql, 'the old cascade rung is back').not.toMatch(/ORDER BY t\.rounds_won\s+DESC,\s*\n\s*t\.duel_points\s+DESC/)
  })

  it('total_points survives as the next rung, so the weekly score is still the tiebreak', () => {
    expect(sql).toMatch(/\(t\.total_points \+ t\.duel_points\)\s+DESC,\s*\n\s*t\.total_points\s+DESC/)
  })
})
