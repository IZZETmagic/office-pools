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
import { readFileSync, readdirSync } from 'fs'
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

describe('no consumer classifies a duel with a bare literal', () => {
  // `headToHead` did exactly this — `mine === 3` / `mine === 1` — and survived
  // the 121 sweep because it lives in `duels.ts` rather than in the tab that
  // renders it. From the first settled duel it would have scored EVERY meeting
  // as a loss, with no error and a plausible-looking 0-0-N on screen.
  //
  // ⚠ THE SCAN STRIPS COMMENTS, and that is not incidental. The first version of
  // this test failed on the ⚠ note left INSIDE `headToHead` recording what the
  // old code was — a ban on `=== 3` cannot tell "this is how it works" from
  // "this is what it used to do". That is the THIRD guard in one day to fail on
  // its own documentation (the `t-display` allowlist, the copy guard, and
  // migration 122's rejected-design note were the others). Every text-scan
  // guard in this repo should strip comments by default; a guard that punishes
  // explanation just gets the explanation deleted.
  const code = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '')
       .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
  const duels = code(readFileSync(resolve(process.cwd(), 'lib/league/duels.ts'), 'utf8'))

  it('headToHead asks duelResult rather than comparing to 3 and 1', () => {
    const from = duels.indexOf('export function headToHead')
    expect(from, 'headToHead was renamed or removed').toBeGreaterThan(-1)
    const fn = duels.slice(from, from + duels.slice(from).indexOf('\n}'))
    expect(fn).toMatch(/duelResult\(/)
    expect(fn, 'a win is not 3 any more').not.toMatch(/=== 3\b/)
    expect(fn, 'a tie is not 1 any more').not.toMatch(/=== 1\b/)
  })

  /**
   * ⚠ WIDENED 2 SEPTEMBER, because pinning one function missed the next one.
   *
   * `lib/league/poolCards.ts` builds the DASHBOARD card's Showdown record and
   * kept `=== 3` / `=== 1` right through the 121 sweep — this guard did not
   * look at it, because it was written to pin `headToHead`. Checked in
   * production that day: nine settled duels carrying 500/250/0, so every one of
   * them was counted as a defeat on the surface most members open first, beside
   * a Duel pts tile that read the stored 500 correctly.
   *
   * So the rule is structural now: ANY file that reads `points_a` or `points_b`
   * is classifying a duel, and must ask `duelPoints` to do it. That is a rule a
   * new call site cannot slip past by being somewhere nobody thought to pin.
   */
  /** A duel's points compared against the values migration 121 retired. */
  const LITERAL = /\b(points?|pts|mine|theirs|yours|them)\w*\s*===\s*[13]\b/i

  const READERS = [
    'lib/league/poolCards.ts',
    'lib/league/duels.ts',
    'lib/league/duelVerdict.ts',
    'app/pools/[pool_id]/DuelsTab.tsx',
  ]

  it.each(READERS)('%s classifies through duelPoints, not a literal', (rel) => {
    const src = code(readFileSync(resolve(process.cwd(), rel), 'utf8'))
    expect(src, `${rel} no longer reads points_a — drop it from READERS`).toMatch(/points_[ab]/)
    expect(src, `${rel} must import from duelPoints`).toMatch(/from '(@\/lib\/league\/)?\.?\.?\/?duelPoints'/)
    // ⚠ SCOPED TO A POINTS-SHAPED NAME, not to the digits. A blanket ban on
    // `=== 1` fails on `rows.length === 1 ? 'week' : 'weeks'`, and a guard that
    // punishes pluralisation gets switched off. The bug shape is a comparison
    // whose LEFT side is the duel's points — `mine === 3`, `mineP === 3`.
    expect(src, `${rel} still classifies a duel with a literal`).not.toMatch(LITERAL)
  })

  it('every file that reads points_a is in READERS', () => {
    // The list above is only a guard while it is complete. A new consumer must
    // land here rather than quietly becoming the third copy.
    const roots = ['lib/league', 'lib/remotion', 'app/pools/[pool_id]']
    const found: string[] = []
    const walk = (dir: string) => {
      for (const e of readdirSync(resolve(process.cwd(), dir), { withFileTypes: true })) {
        const p = `${dir}/${e.name}`
        if (e.isDirectory()) { if (e.name !== '__tests__') walk(p); continue }
        if (!/\.tsx?$/.test(e.name) || e.name === 'duelPoints.ts') continue
        const src = code(readFileSync(resolve(process.cwd(), p), 'utf8'))
        // A file that only shapes a row for a video (`lib/remotion/*Props.ts`)
        // passes the number through without ever asking what it means, so it is
        // a reader without being a classifier. It is caught by the literal test
        // below rather than forced to import the module.
        if (/points_[ab]/.test(src) && LITERAL.test(src)) found.push(p)
      }
    }
    roots.forEach(walk)
    expect(found, 'these read a duel points value and classify it with a literal').toEqual([])
  })
})
