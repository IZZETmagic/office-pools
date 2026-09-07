// =============================================================
// Showdown opens the same way on both apps
// =============================================================
// Ryan, 2026-09-07, on bringing the browser into line with the phone. The tab
// order is the most visible half of that, and the least likely to be checked:
// each app's strip looks completely reasonable on its own, so a divergence is
// only ever noticed by somebody holding both at once.
//
// ⚠ ONLY THE HEAD IS ASSERTED, AND THAT IS THE WHOLE AGREEMENT. The web keeps
// surfaces the phone has no room for — Results, the league Table, Banter — so
// comparing the full lists would fail on a difference that is deliberate. What
// must agree is what Showdown LEADS with, because that is what makes it read as
// the same mode.
//
// ⚠ NEITHER SIDE IS READ AS TEXT. Both are real modules, imported and called.
// The guard this repo just retired (`bandStateOrder`) compared two `indexOf`
// positions in a component's source, which is why it could only ever protect
// the one chain it was pointed at.

import { describe, it, expect } from 'vitest'

import { SHOWDOWN_LEAD_TABS, withShowdownFirst } from '../showdownTabs'
import { getVisiblePoolTabs } from '../../../mobile/lib/poolTabs'

/** A plain member of a Showdown pool, which is the case that has to match. */
const rnTabs = getVisiblePoolTabs(false, false, false, true, 'showdown')

describe('the web and the phone open Showdown the same way', () => {
  it('leads with the same three tabs, in the same order', () => {
    expect(rnTabs.slice(0, 3)).toEqual(SHOWDOWN_LEAD_TABS.map((t) => t.rn))
  })

  it('leads with the duel, because the mode is named after it', () => {
    // Stated separately from the sequence above so a failure says WHICH promise
    // broke. "Showdown opens on the duel" is a product decision; the two after
    // it are an ordering.
    expect(rnTabs[0]).toBe('duel')
    expect(SHOWDOWN_LEAD_TABS[0].key).toBe('duels')
  })
})

describe('withShowdownFirst', () => {
  const DEFAULT = [
    { key: 'community', label: 'Banter' },
    { key: 'leaderboard', label: 'Leaderboard' },
    { key: 'results', label: 'Results' },
  ]

  it('renders the leaderboard ONCE, in Showdown’s position', () => {
    // The bug this exists to prevent: a plain prepend leaves the caller's own
    // leaderboard in place, so the strip carries two pills with the same label
    // three apart, both of them working.
    const out = withShowdownFirst(true, DEFAULT)
    expect(out.filter((t) => t.key === 'leaderboard')).toHaveLength(1)
    expect(out.map((t) => t.key)).toEqual([
      'duels', 'leaderboard', 'room', 'community', 'results',
    ])
  })

  it('leaves every other mode exactly as it was', () => {
    expect(withShowdownFirst(false, DEFAULT)).toEqual(DEFAULT)
  })
})
