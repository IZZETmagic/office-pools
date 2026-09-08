// =============================================================
// Both apps agree what a member's duel record is
// =============================================================
// `lib/league/duelRecord.ts` is canonical, `mobile/lib/duelRecord.ts` is a hand
// copy. The phone's version used to live inside `useDuel.ts`'s `duelTable`
// memo, and the two had already drifted in a way nobody would have caught by
// looking: that copy pushed `form` in PAYLOAD order and sliced the last five,
// so a member's results appeared in an order they were never played in whenever
// the season ran out of numerical sequence. Migration 101 measured that
// happening by up to 121 days across three real seasons.
//
// Everything this module decides fails quietly and plausibly:
//
//   · a bye counted as a tie — `DUEL_BYE === DUEL_TIE`, so the points cannot
//     tell them apart and the row still adds up
//   · a form strip in the wrong order — five dots, all real results
//   · a movement arrow measured against the season table instead of the duel
//     board — a real number, describing a different board
//
// So the compare is a BYTE compare below the banner. The imports differ (the
// phone's `DuelRow` comes from `useLeaguePool`) and sit above the compare point.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8')
const MARK = "/** One duel's outcome for one side."

function body(src: string, path: string): string {
  const i = src.indexOf(MARK)
  expect(i, `${path}: the file was restructured`).toBeGreaterThan(-1)
  return src.slice(i)
}

describe('the mobile copy of duelRecord mirrors the web', () => {
  it('is byte-identical below the banner', () => {
    expect(
      body(read('mobile/lib/duelRecord.ts'), 'mobile/lib/duelRecord.ts')
        === body(read('lib/league/duelRecord.ts'), 'lib/league/duelRecord.ts'),
      'mobile/lib/duelRecord.ts has drifted from lib/league/duelRecord.ts. Every ' +
        'failure this module has is a plausible-looking row rather than an error.',
    ).toBe(true)
  })

  it('still names itself as the copy', () => {
    expect(read('mobile/lib/duelRecord.ts')).toContain('THIS IS THE COPY')
    expect(read('lib/league/duelRecord.ts')).toContain('THIS FILE IS CANONICAL')
  })

  it('the phone no longer keeps its own record inside the hook', () => {
    // ⚠ The point of the mirror is that there is no THIRD copy. `useDuel`'s
    // `duelTable` was the one this replaced; if a hand-rolled loop comes back
    // there, the guard above goes on passing while the app disagrees with it.
    const useDuel = read('mobile/lib/useDuel.ts')
    expect(useDuel, 'useDuel should call buildDuelRecords, not rebuild the record')
      .toContain('buildDuelRecords')
    expect(useDuel).not.toMatch(/r\.form\.push\(/)
  })
})
