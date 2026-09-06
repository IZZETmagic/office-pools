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

// ⚠ TWO FILES, because the authority MOVED. 121 set the values and the ranker's
// ORDER BY; 134 last redefined `league_score_duels` to make a duel against a
// RETIRED opponent a bye. Pointing the whole file at 121 would leave this guard
// green while pinning a definition production no longer runs — the same stale-
// invariant trap the soft-delete guard fell into.
const MIGRATION = '121_a_duel_is_worth_half_a_perfect_week.sql'
const sql = readFileSync(resolve(process.cwd(), 'lib/migrations', MIGRATION), 'utf8')

/** Wherever `league_score_duels` is defined LAST. Update both if it moves again. */
const DUEL_ENGINE = '134_a_member_who_left_is_not_an_opponent.sql'
const duelSql = readFileSync(resolve(process.cwd(), 'lib/migrations', DUEL_ENGINE), 'utf8')

/**
 * The `points_a` CASE from `league_score_duels`, which is the authority.
 *
 *     points_a = CASE WHEN acc.b IS NULL THEN 250
 *                     WHEN acc.a > acc.b THEN 500
 *                     WHEN acc.a = acc.b THEN 250
 *                     ELSE 0 END,
 */
function pointsACase(): { bye: number; win: number; tie: number; loss: number } | null {
  // `acc.b IS NULL OR acc.b_gone` — no opponent, or an opponent who left. Both
  // are a bye, which is the whole point of 134.
  const m = duelSql.match(
    /points_a = CASE WHEN acc\.a_gone THEN \d+\s*\n\s*WHEN acc\.b IS NULL OR acc\.b_gone THEN (\d+)\s*\n\s*WHEN acc\.a > acc\.b THEN (\d+)\s*\n\s*WHEN acc\.a = acc\.b THEN (\d+)\s*\n\s*ELSE (\d+) END/,
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

/**
 * ⚠ THE PHONE HOLDS A SECOND COPY, AND IT CANNOT IMPORT THE FIRST.
 *
 * `mobile/tsconfig.json` maps `@/*` to `mobile/` and nothing reaches outside
 * it, so React Native restates the values in `mobile/lib/duelPoints.ts`. That
 * copy is only safe while something reads both against the migration — which is
 * this, and it is the same arrangement `leagueDepthPolarity.guard.test.ts`
 * already uses to walk `mobile/`.
 *
 * A drift here is invisible in exactly the way the web drift was: the phone
 * reads a settled 500, classifies it with a retired `=== 3`, and shows a member
 * who won their duel a defeat — while the leaderboard on the same screen, whose
 * order comes from SQL, has them climbing.
 */
describe('the phone agrees with the engine about what a duel is worth', () => {
  const c = pointsACase()
  const mobileSrc = readFileSync(resolve(process.cwd(), 'mobile/lib/duelPoints.ts'), 'utf8')

  // Restated rather than shared: the web arm's copies live inside its own
  // `describe`. Kept identical on purpose — if one is loosened the other should
  // be too, deliberately, in the same edit.
  const code = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '')
       .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
  const LITERAL = /\b(points?|pts|mine|theirs|yours|them)\w*\s*===\s*[13]\b/i

  /** `export const NAME = 123` out of the mobile copy. */
  const constant = (name: string): number | null => {
    const m = mobileSrc.match(new RegExp(`export const ${name} = (\\d+)`))
    return m ? +m[1] : null
  }

  it.each([
    ['DUEL_WIN', 'win'],
    ['DUEL_TIE', 'tie'],
    ['DUEL_BYE', 'bye'],
    ['DUEL_LOSS', 'loss'],
  ] as const)('mobile %s matches the engine', (name, key) => {
    expect(constant(name), `${name} is missing from the mobile copy`).not.toBeNull()
    expect(constant(name)).toBe(c![key])
  })

  it('mobile and web hold the same values, so neither can be updated alone', () => {
    expect(constant('DUEL_WIN')).toBe(DUEL_WIN)
    expect(constant('DUEL_TIE')).toBe(DUEL_TIE)
    expect(constant('DUEL_BYE')).toBe(DUEL_BYE)
    expect(constant('DUEL_LOSS')).toBe(DUEL_LOSS)
  })

  it('no mobile file classifies a duel with a literal', () => {
    // Same structural rule as the web arm: reading `points_a`/`points_b` IS
    // classifying a duel, so the file must ask `duelPoints` to do it.
    const found: string[] = []
    const walk = (dir: string) => {
      for (const e of readdirSync(resolve(process.cwd(), dir), { withFileTypes: true })) {
        const p = `${dir}/${e.name}`
        if (e.isDirectory()) {
          if (e.name !== '__tests__' && e.name !== 'node_modules') walk(p)
          continue
        }
        if (!/\.tsx?$/.test(e.name) || e.name === 'duelPoints.ts') continue
        const src = code(readFileSync(resolve(process.cwd(), p), 'utf8'))
        if (/points_[ab]/.test(src) && LITERAL.test(src)) found.push(p)
      }
    }
    ;['mobile/lib', 'mobile/components', 'mobile/app'].forEach(walk)
    expect(found, 'these read a duel points value and classify it with a literal').toEqual([])
  })
})

// =============================================================
// The SUM the engine performs must reach the screen
// =============================================================
// `league_finalize_ranks` ranks on `(total_points + duel_points)` and NO COLUMN
// STORES THAT SUM. So every surface printing a season total beside a rank has
// to add the two itself, and four of them did not: the web leaderboard rendered
// `#1 Alice 800` above `#2 Bob 900` (and the gap line then told Bob he was 100
// points AHEAD of the leader), the Duels tab ranked a second table on duel
// points alone under the heading "The season", the weekly recap email said
// "you're 1st with 800 points", and the phone's Home card read 3,200 where the
// pool's own Showdown board read 5,200.
//
// The tests above pin the SQL. These pin the path from that SQL to the screen —
// the half that was actually broken, and that a green SQL guard said nothing
// about.

describe('duel points reach the display layer', () => {
  const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8')

  it('the league arm of readEntryScoring SELECTS duel_points', () => {
    // It did not. `total_points` is picks only, so the column simply never left
    // the database and every consumer below was summing an absent number.
    const src = read('lib/scoring/readSource.ts')
    // Located by the columns that identify it rather than by their exact order:
    // the LMS rank guard later added `pool_id` to this same select, which broke
    // an order-pinned pattern while the invariant below was never in danger.
    // Keep this locator loose and the duel_points assertion strict.
    const select = src.match(/'entry_id,[^']*total_points[^']*final_rank[^']*'/)
    expect(select, 'the league_entry_totals select changed shape').not.toBeNull()
    expect(select![0]).toContain('duel_points')
  })

  it('EntryScoring carries duel_points, so a consumer cannot silently omit it', () => {
    expect(read('lib/scoring/readSource.ts')).toMatch(/duel_points: number\b/)
  })

  it('seasonTotalPoints adds the two currencies', async () => {
    const { seasonTotalPoints } = await import('../../scoring/readSource')
    expect(seasonTotalPoints({ scored_total_points: 800, duel_points: 1000 })).toBe(1800)
    // Every non-Showdown mode leaves duel_points at 0 — the helper must be a
    // no-op there rather than something callers branch on.
    expect(seasonTotalPoints({ scored_total_points: 900, duel_points: 0 })).toBe(900)
    // A stale API / missing column must degrade to the picking total, not NaN.
    expect(seasonTotalPoints({ scored_total_points: 900 })).toBe(900)
    expect(seasonTotalPoints(null)).toBe(0)
  })

  it('the weekly recap email adds duel points to the total it prints', () => {
    const src = read('lib/league/notify.ts')
    expect(src, 'notify.ts stopped selecting duel_points').toMatch(/duel_points/)
    expect(
      src,
      'the recap is printing the picking half beside a combined rank again',
    ).toMatch(/totalPoints: \(t\?\.total_points \?\? 0\) \+ \(t\?\.duel_points \?\? 0\)/)
  })

  it('the Duels tab does not present its duel-points board as the pool standing', () => {
    // The board itself is legitimate — it is the mode's own record, and the
    // phone shows the same one. Titling it "The season" beside a # column is
    // what made two tabs crown different winners of the same pool.
    const src = read('app/pools/[pool_id]/DuelsTab.tsx')
    const withoutComments = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(withoutComments).not.toMatch(/>\s*The season\s*</)
  })

})

describe('a duel against a member who left is a bye, not a win', () => {
  it('the settle engine knows who has retired', () => {
    // Before 134 the CTE looked only at accuracy. A retiree filed no picks, so
    // they scored 0 and whoever was drawn against them collected 500 — an
    // advantage handed out by an admin action rather than by football.
    expect(duelSql).toMatch(/a_gone/)
    expect(duelSql).toMatch(/b_gone/)
    expect(duelSql).toMatch(/pe\.retired_at IS NOT NULL/)
  })

  it('pays the bye rate, not the win rate, when the opponent has gone', () => {
    const c = pointsACase()
    expect(c, 'the points_a CASE changed shape — re-read it before editing this').not.toBeNull()
    expect(c!.bye).toBe(DUEL_TIE)
    expect(c!.bye).not.toBe(DUEL_WIN)
  })

  it('does not pay a retiree the win rate either', () => {
    // They are off every leaderboard, so their number is bookkeeping — but a
    // restore (Decision 15) can bring the row back into view, and 500 sitting
    // there would be wrong when it did.
    expect(duelSql).toMatch(/points_a = CASE WHEN acc\.a_gone THEN 0/)
    expect(duelSql).toMatch(/WHEN acc\.b_gone THEN 0/)
  })
})

describe('Last Man Standing cannot crown a member who left', () => {
  const lms = readFileSync(
    resolve(process.cwd(), 'lib/migrations', '134_a_member_who_left_is_not_an_opponent.sql'),
    'utf8',
  )

  it('filters retired entries out of standing, the count, and both crownings', () => {
    // Four sites. Miss any one and the round still closes on the wrong field:
    // the standing CTE, v_left, and the two is_winner branches.
    const hits = lms.match(/pe\.entry_id = s\.entry_id AND pe\.retired_at IS NULL/g) ?? []
    expect(hits.length).toBe(4)
  })

  it('does NOT mark a retired entry eliminated', () => {
    // Leaving and being knocked out are different facts, and Decision 15
    // restores a season in full — the survivor row has to keep saying which one
    // happened, so the filter is at read time.
    expect(lms).not.toMatch(/SET eliminated_matchweek = p_matchweek\s*\n\s*FROM pool_entries/)
    expect(lms).toMatch(/is not standing/)
  })
})
