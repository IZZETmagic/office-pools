// =============================================================
// The gap line, and the mirror that keeps both platforms saying it
// =============================================================
// The rule is four lines long, which is exactly why it is worth pinning: every
// one of its edges produces a sentence rather than an error, and a wrong
// sentence on a leaderboard is read as fact.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

import { ladderGap, ladderGapLabel, type LadderGapRow } from '../ladderGap'

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8')

function body(src: string, path: string): string {
  const i = src.indexOf("/** What to say on the viewer")
  expect(i, `${path}: the file was restructured`).toBeGreaterThan(-1)
  return src.slice(i)
}

describe('the mobile copy of ladderGap mirrors the web', () => {
  it('is byte-identical below the banner', () => {
    expect(
      body(read('mobile/lib/ladderGap.ts'), 'mobile/lib/ladderGap.ts')
        === body(read('lib/league/ladderGap.ts'), 'lib/league/ladderGap.ts'),
      'mobile/lib/ladderGap.ts has drifted. The two apps would tell the same member ' +
        'two different things about the same gap.',
    ).toBe(true)
  })

  it('still names itself as the copy', () => {
    expect(read('mobile/lib/ladderGap.ts')).toContain('THIS IS THE COPY')
    expect(read('lib/league/ladderGap.ts')).toContain('THIS FILE IS THE CANONICAL ONE')
  })
})

describe('ladderGap', () => {
  const board: LadderGapRow[] = [
    { name: 'Priya', value: 1400 },
    { name: 'Sarah', value: 1250 },
    { name: 'Dev', value: 1250 },
  ]

  it('measures against the row ABOVE, never the leader', () => {
    // Dev is 150 off the top and 0 off the rung above. The number that means
    // something is the one he can act on.
    expect(ladderGap(board, 2)).toEqual({ kind: 'level', name: 'Sarah' })
  })

  it('names the gap and the person for anybody behind', () => {
    expect(ladderGap(board, 1)).toEqual({ kind: 'behind', by: 150, name: 'Priya' })
  })

  it('gives the leader their lead over second', () => {
    expect(ladderGap(board, 0)).toEqual({ kind: 'leading', by: 150 })
  })

  it('calls a tie at the top LEVEL, not a lead of zero', () => {
    // ⚠ Being first on a tiebreak is not a lead. "Leading by 0" states the
    // opposite of what happened.
    const tied: LadderGapRow[] = [{ name: 'A', value: 900 }, { name: 'B', value: 900 }]
    expect(ladderGap(tied, 0)).toEqual({ kind: 'level', name: 'B' })
  })

  it('says nothing in a pool of one', () => {
    expect(ladderGap([{ name: 'A', value: 900 }], 0)).toBeNull()
  })

  it('says nothing when the gap runs the wrong way', () => {
    // ⚠ The Table board's ORDER is the engine's `current_rank` while the VALUE
    // is computed from the stored columns — a client holding a half-refreshed
    // payload can see the two disagree. "−100 behind" is worse than silence.
    const skewed: LadderGapRow[] = [{ name: 'A', value: 800 }, { name: 'B', value: 900 }]
    expect(ladderGap(skewed, 1)).toBeNull()
    expect(ladderGap(skewed, 0)).toBeNull()
  })

  it('is bounds-safe', () => {
    expect(ladderGap(board, -1)).toBeNull()
    expect(ladderGap(board, 9)).toBeNull()
  })
})

describe('ladderGapLabel', () => {
  it('names the currency, because the two boards are not the same points', () => {
    expect(ladderGapLabel({ kind: 'behind', by: 250, name: 'Priya' }, 'duel pts'))
      .toBe('250 duel pts behind Priya')
    expect(ladderGapLabel({ kind: 'leading', by: 1500 }, 'pts'))
      .toBe('Leading by 1,500 pts')
    expect(ladderGapLabel({ kind: 'level', name: 'Dev' }, 'pts'))
      .toBe('Level with Dev')
  })

  it('carries no adverb and no consolation', () => {
    // The recap sheet's rule, on a second surface: a line that softens a loss
    // teaches people to distrust the ones that do not.
    const said = [
      ladderGapLabel({ kind: 'behind', by: 250, name: 'A' }, 'pts'),
      ladderGapLabel({ kind: 'leading', by: 250 }, 'pts'),
      ladderGapLabel({ kind: 'level', name: 'A' }, 'pts'),
    ].join(' ')
    expect(said).not.toMatch(/only|just|barely|unlucky|so close|nearly/i)
  })
})
