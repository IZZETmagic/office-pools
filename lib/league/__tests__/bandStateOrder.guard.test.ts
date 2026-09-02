// =============================================================
// The band must offer the reveal before it counts down to the week after
// =============================================================
// `DuelsTab` renders ONE band, so it picks a state from an if-chain. Two of
// those branches describe DIFFERENT matchweeks, and that is the trap:
//
//   `open`             the week you are picking for — carries the Reveal button
//   `sealedMatchweek`  the NEXT week after it — carries a countdown
//
// Mid-season there is always a next sealed week, so a chain that tests
// `sealedMatchweek !== null` first can NEVER reach the Reveal button. That is
// not a hypothetical: on 2026-09-01 matchweek 3's draw opened at 10pm and the
// band went straight from counting down to matchweek 3 to counting down to
// matchweek 4. The walkout — the flagship mode's flagship moment — was
// unreachable, and it looked fine, because the countdown it switched to was
// itself correct. It was just counting to the wrong week.
//
// Nothing type-checks this. Both branches compile, both render a valid band,
// and the wrong order is invisible until a reveal actually lands — which
// happens once a week, on a clock, usually when nobody is looking.
//
// ⚠ ORDER IS THE ONLY THING BEING ASSERTED, and it is sufficient: RLS (116)
// withholds a sealed week's duel rows, so `open` is null while the week is
// sealed and the chain falls through to the countdown on its own. No extra
// condition is needed, and adding one would be a fourth copy of the reveal
// rule — three have already drifted (123, 127, and the live mirror still in
// poolCards.ts).

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const src = readFileSync(
  resolve(process.cwd(), 'app/pools/[pool_id]/DuelsTab.tsx'),
  'utf8',
)

/** The band's if-chain, from the in-play branch to its `return null`. */
function bandChain(): string {
  const start = src.indexOf('const bandNode = layout !== ')
  expect(start, 'the band if-chain moved or was renamed').toBeGreaterThan(-1)
  const end = src.indexOf('})()', start)
  expect(end, 'the band if-chain has no closing').toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('the showdown band picks its state in the right order', () => {
  it('checks the open matchweek BEFORE the sealed one', () => {
    const chain = bandChain()
    const openAt = chain.indexOf('if (open) {')
    const sealedAt = chain.indexOf('if (sealedMatchweek !== null) {')

    expect(openAt, 'the `if (open)` branch is gone').toBeGreaterThan(-1)
    expect(sealedAt, 'the `if (sealedMatchweek !== null)` branch is gone').toBeGreaterThan(-1)

    // The whole bug in one comparison.
    expect(
      openAt,
      'the sealed branch runs first, so the Reveal button is unreachable — ' +
        'there is ALWAYS a next sealed matchweek mid-season',
    ).toBeLessThan(sealedAt)
  })

  it('still reaches the in-play branch before either of them', () => {
    // A settled-or-running week outranks both: you do not get offered a reveal
    // for next week while this week's score is still moving.
    const chain = bandChain()
    const inPlayAt = chain.indexOf('if (inPlay) {')
    const openAt = chain.indexOf('if (open) {')

    expect(inPlayAt, 'the `if (inPlay)` branch is gone').toBeGreaterThan(-1)
    expect(inPlayAt).toBeLessThan(openAt)
  })

  it('keeps the Reveal button in the open branch, not the sealed one', () => {
    const chain = bandChain()
    const openAt = chain.indexOf('if (open) {')
    const sealedAt = chain.indexOf('if (sealedMatchweek !== null) {')
    // ⚠ THE LABEL IS NOW JUST "Reveal". It used to read
    // `{revealSeen ? 'Replay' : 'Reveal'}` — the button survived the walkout,
    // relabelled, to keep a route to the share/video path. Ryan removed the
    // video button from the ceremony on 2026-09-01 and the button itself on
    // 2026-09-02, so after the reveal there is no action at all.
    const revealAt = chain.indexOf('>\n                    Reveal\n')

    expect(revealAt, 'the Reveal button is gone').toBeGreaterThan(-1)
    expect(revealAt).toBeGreaterThan(openAt)
    expect(revealAt).toBeLessThan(sealedAt)
  })

  it('replaces the button with the scoreline once the walkout has been seen', () => {
    // Ryan's 2026-09-02 asks, in one place: no Replay after the reveal, and the
    // score sits BETWEEN the two avatars rather than stacked above them. Both
    // land on the same slot, so both are checked here.
    const chain = bandChain()
    expect(chain, 'the between slot is no longer keyed on revealSeen')
      .toMatch(/between=\{revealSeen \? \(/)
    // And what it holds after the walkout is a SCORE, not another button.
    const after = chain.slice(chain.indexOf('between={revealSeen ? ('))
    expect(after.slice(0, after.indexOf(') : (')), 'a button came back after the reveal')
      .not.toMatch(/<button/)
  })
})
