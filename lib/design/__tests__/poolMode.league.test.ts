// =============================================================
// The card pill must never print a raw column value
// =============================================================
// `getModeName` fell back to `return mode` for anything it did not recognise,
// and it recognised only the three bracket modes. Every league pool carries
// `prediction_mode = 'league_pickem'`, so the pill on the pools list, the
// dashboard and the invite page rendered the literal string **league_pickem** —
// a database identifier, shown to members, on the page a stranger lands on when
// they follow an invite.
//
// The fallback is the load-bearing part of these tests. A future fifth league
// mode added to `pools_league_mode_ck` and not to this module must degrade to
// "League", never to its column value.
// =============================================================

import { describe, it, expect } from 'vitest'
import {
  getModeName,
  getModeLongName,
  getModeChip,
  getPoolStripe,
  LEAGUE_MODES,
} from '@/lib/design/poolMode'
import { PREDICTION_MODES } from '@/lib/predictionMode'
import { lightness } from '@/lib/design/oklch'
import { UNTHEMED_COMPETITION, getCompetitionColor, hasCompetitionColor } from '@/lib/design/competitionColor'

describe('league pills', () => {
  it('names all four league games', () => {
    expect(getModeName('league_pickem', 'pickem')).toBe('Pick’em')
    expect(getModeName('league_pickem', 'showdown')).toBe('Showdown')
    expect(getModeName('league_pickem', 'last_man_standing')).toBe('Last Man')
    expect(getModeName('league_pickem', 'table')).toBe('Table')
  })

  it('spells them out where there is room', () => {
    // The invite page. These are the wizard's own labels, so the mode someone
    // is invited into is named the same way the admin chose it.
    expect(getModeLongName('league_pickem', 'pickem')).toBe('Matchweek Pick’em')
    expect(getModeLongName('league_pickem', 'last_man_standing')).toBe('Last Man Standing')
    expect(getModeLongName('league_pickem', 'table')).toBe('Predict the Table')
  })

  it('⚠ never renders the column value, whatever the league mode is', () => {
    // The bug verbatim: no argument, a null argument, or a mode this module has
    // not been taught yet. None may reach a member.
    for (const leagueMode of [undefined, null, '', 'a_mode_added_later']) {
      expect(getModeName('league_pickem', leagueMode)).toBe('League')
      expect(getModeLongName('league_pickem', leagueMode)).toBe('League')
    }
  })

  it('covers every mode the database can hold', () => {
    // Guards the drift this file exists to stop: widen the CHECK, widen the
    // labels. A mode with no label would silently fall to "League".
    for (const m of LEAGUE_MODES) {
      expect(getModeName('league_pickem', m)).not.toBe('League')
      expect(getModeLongName('league_pickem', m)).not.toBe('League')
    }
  })

  it('⚠ gives each league game its OWN pill colour', () => {
    // They used to share one gold pill, which was survivable while the stripe
    // distinguished them. The stripe is the competition now, so this is the
    // only thing telling a Showdown pool from a Last Man Standing one.
    const bases = LEAGUE_MODES.map((m) => getModeChip('league_pickem', m)['--mode-base'])
    expect(new Set(bases).size).toBe(LEAGUE_MODES.length)
  })
})

describe('the stripe', () => {
  // ⚠ THE STRIPE IS THE COMPETITION, NOT THE MODE (Ryan, 2026-08-29). The mode
  // is carried by the pill beside it, which has room for the word. These tests
  // exist mostly to stop the mode creeping back into a five-pixel bar.
  it('is the competition’s brand colour', () => {
    const [, base] = getPoolStripe({ externalLeagueId: 39 })
    expect(base).toBe('#3D195B')  // Premier League purple
  })

  it('lifts the top stop without changing the colour', () => {
    const [top, base] = getPoolStripe({ externalLeagueId: 39 })
    expect(lightness(top)).toBeGreaterThan(lightness(base))
    expect(top).not.toBe(base)
  })

  it('gives two competitions different stripes', () => {
    expect(getPoolStripe({ externalLeagueId: 39 })).not.toEqual(getPoolStripe({ externalLeagueId: 140 }))
  })

  it('gives every competition its own stripe', () => {
    const ids = [1, 2, 39, 61, 78, 135, 140]
    const bases = ids.map((id) => getPoolStripe({ externalLeagueId: id })[1])
    expect(new Set(bases).size).toBe(ids.length)
  })

  it('uses the unthemed slate for a competition nobody has coloured', () => {
    expect(getCompetitionColor(9999)).toBe(UNTHEMED_COMPETITION)
    expect(getCompetitionColor(null)).toBe(UNTHEMED_COMPETITION)
    expect(hasCompetitionColor(9999)).toBe(false)
    expect(hasCompetitionColor(39)).toBe(true)
    expect(getPoolStripe({ externalLeagueId: 9999 })[1]).toBe(UNTHEMED_COMPETITION)
    expect(getPoolStripe({})[1]).toBe(UNTHEMED_COMPETITION)
  })

  it('never returns a malformed colour', () => {
    const HEX = /^#[0-9A-F]{6}$/
    for (const id of [1, 2, 39, 61, 78, 135, 140, 9999, null]) {
      const [top, base] = getPoolStripe({ externalLeagueId: id })
      expect(top).toMatch(HEX)
      expect(base).toMatch(HEX)
    }
  })
})

describe('the bracket modes are untouched', () => {
  it('still names and colours the three World Cup modes', () => {
    expect(getModeName('full_tournament')).toBe('Full')
    expect(getModeName('progressive')).toBe('Progressive')
    expect(getModeName('bracket_picker')).toBe('Bracket')
    // The bracket pill colours are unchanged — they mirror mobile/theme through
    // poolModeColor, and moving them would drift the two apps apart.
    expect(getModeChip('progressive')['--mode-base']).toBe('#059669')
    expect(getModeChip('full_tournament')['--mode-base']).toBe('#3B6EFF')
    expect(getModeChip('bracket_picker')['--mode-base']).toBe('#D97706')
  })

  it('ignores a league mode passed alongside a bracket mode', () => {
    // Defensive: `league_mode` is NULL on a World Cup pool, but a caller that
    // passes both must not have the league branch hijack the label.
    expect(getModeName('full_tournament', 'table')).toBe('Full')
  })

  it('has a label for every value prediction_mode can hold', () => {
    for (const m of PREDICTION_MODES) {
      // 'league_pickem' resolves through its league mode; the rest stand alone.
      const name = getModeName(m, m === 'league_pickem' ? 'pickem' : null)
      expect(name).not.toBe(m)
    }
  })
})
