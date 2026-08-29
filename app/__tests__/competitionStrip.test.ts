// =============================================================
// The landing strip and the pool card must name the same colour
// =============================================================
// They did not. `app/competitions.ts` had the Premier League as a blue
// (#667EEA -> #3B6EFF) chosen when the World Cup was the only real competition
// and nothing else in the app had an opinion; every pool card meanwhile
// rendered it in the club's purple. Two files, each internally consistent, each
// disagreeing with the other — and nothing to notice, because no code path
// reads both.
//
// This is that missing path.
// =============================================================

import { describe, it, expect } from 'vitest'
import { COMPETITIONS } from '@/app/competitions'
import { getPoolStripe } from '@/lib/design/poolMode'
import { LEAGUE_ID, getCompetitionColor } from '@/lib/design/competitionColor'

const byKey = (k: string) => COMPETITIONS.find((c) => c.key === k)!

describe('the Premier League', () => {
  it('uses the club’s purple, not the old placeholder blue', () => {
    expect(byKey('premier-league').stripe[1]).toBe('#3D195B')
    expect(byKey('premier-league').stripe).not.toContain('#3B6EFF')
  })

  it('⚠ is IDENTICAL to what a pool card renders', () => {
    // The assertion that would have caught the drift. Not "both are purple" —
    // byte-identical, because the strip derives from the same function.
    expect(byKey('premier-league').stripe).toEqual(
      getPoolStripe({ externalLeagueId: LEAGUE_ID.premierLeague }),
    )
  })
})

describe('the strip as a whole', () => {
  it('gives every competition a two-stop gradient of real hexes', () => {
    for (const c of COMPETITIONS) {
      expect(c.stripe).toHaveLength(2)
      for (const stop of c.stripe) expect(stop).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
  })

  it('never falls back to the unthemed slate', () => {
    // A derived row whose league id was wrong would render the "nobody has
    // coloured this" grey, which on a marketing page reads as a bug rather
    // than as a signal.
    for (const c of COMPETITIONS) {
      expect(c.stripe[1]).not.toBe(getCompetitionColor(null))
    }
  })

  it('keeps the rows that have no provider id authored here', () => {
    // Six Nations and the NFL are not football competitions in the fixtures
    // provider, so nothing else in the app defines a colour for them. Pinned so
    // a future "derive everything" pass does not quietly grey them out.
    expect(byKey('six-nations').stripe).toEqual(['#F97362', '#EF4444'])
    expect(byKey('nfl').stripe).toEqual(['#A78BFA', '#7C3AED'])
  })
})
