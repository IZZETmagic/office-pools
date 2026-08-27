// =============================================================
// The leaderboard shows a column only where it means something
// =============================================================
// Two of these were live for weeks and neither failed anything.
//
//   "0 + 1,240 bonus"   on a Table pool. True, and meaningless: the engine
//                       files BOTH per-place points and band bonuses under
//                       `bonus_points`, so the split was always 0 + everything.
//   a Form column       on Table and Last Man Standing — a column of em-dashes
//                       under a heading promising a weekly record, in modes
//                       that have no weekly record.
//
// Neither is a crash, a type error or a failing assertion. They are the shape
// this file guards against: a World Cup assumption rendered confidently in a
// league pool. `npm test` cannot render the component (no jsdom here), so this
// reads the flags as source — it does not prove they WORK, only that nobody has
// quietly widened them back.
//
// The behavioural proof is a five-pool sweep of server-rendered HTML, recorded
// in the commit that introduced these flags.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const source = readFileSync(
  resolve(process.cwd(), 'app/pools/[pool_id]/LeaderboardTab.tsx'),
  'utf8',
)

/** The single-line body of `const <name> = ...` up to the next blank line. */
function flag(name: string): string {
  const start = source.indexOf(`const ${name} =`)
  expect(start, `${name} is gone — renamed or deleted`).toBeGreaterThan(-1)
  return source.slice(start, source.indexOf('\n\n', start))
}

describe('leaderboard column flags', () => {
  it('the base/bonus split is World-Cup only', () => {
    // Any league mode reinstated here brings back "0 + <whole score> bonus".
    expect(flag('showBonus')).toBe('const showBonus = !isLeague')
  })

  it('form is shown only in modes that have weeks', () => {
    const f = flag('showForm')
    expect(f).toMatch(/!isBracketPicker/)
    expect(f).toMatch(/leagueMode === 'pickem'/)
    expect(f).toMatch(/leagueMode === 'showdown'/)
    // The two that must NOT appear: one prediction a season, and a mode with no
    // points to plot.
    expect(f).not.toMatch(/leagueMode === 'table'/)
    expect(f).not.toMatch(/leagueMode === 'last_man_standing'/)
  })

  it('the form column, its header, its legend and the grid move together', () => {
    // A header that renders without its cells is how a table stops lining up
    // with its body — the reason gridCols was made one definition.
    expect(source).toContain('{showForm && <div className="text-center">Form</div>}')
    expect(source).toMatch(/showForm \? 'grid-cols-\[3\.5rem_1fr_8rem_8rem\]' : 'grid-cols-\[3\.5rem_1fr_8rem\]'/)
    // The dot legend is gated too: it described an outcome set Table has not.
    expect(source).toMatch(/\{showForm && \(\s*\n\s*<div className="flex flex-wrap items-center justify-center/)
  })

  it('⚠ isBracketPicker is declared before the flags that read it', () => {
    // showForm touches it in its own initialiser. Declared after, that is a
    // temporal-dead-zone ReferenceError at render, not a type error.
    expect(source.indexOf('const isBracketPicker =')).toBeLessThan(
      source.indexOf('const showForm ='),
    )
  })
})
