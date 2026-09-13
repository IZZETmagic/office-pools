import { describe, expect, it } from 'vitest'

import type { MatchForm, FormOutcome } from '../form'
import type { H2HSummary, H2HFixture } from '../h2h'
import { pickHeadline, type HeadlineInput } from '../headline'

// =============================================================
// The headline picker
// =============================================================
// It replaced a hardcoded drought line that fired at three visits without an
// away win. At a measured 33.1% away-win rate that run happens 29.9% of the time
// BY CHANCE — one pairing in three was being handed a base rate dressed as a
// hoodoo, and the sentence was about 2011 on a card about this weekend.
//
// So the two things worth testing hardest are the ORDER (rarest first, because
// the first match wins) and the THRESHOLDS (each must beat chance).
// =============================================================

const ARS = 42
const CHE = 49

function summary(over: Partial<H2HSummary> = {}): H2HSummary {
  return {
    meetings: 10,
    wins: 4,
    draws: 3,
    losses: 3,
    goalsFor: 14,
    goalsAgainst: 12,
    avgGoals: 2.6,
    bothScored: 5,
    commonScore: null,
    atVenue: null,
    venueDrought: null,
    decidedAfterHt: 0,
    decidedAfterHtOf: 0,
    recent: [],
    span: { from: '2019-08-01', to: '2026-05-01' },
    competitions: [],
    excluded: 0,
    ...over,
  }
}

let seq = 0
/** One past meeting. `winner` is which of the two clubs won it. */
function meeting(winner: 'ars' | 'che' | 'draw', arsAtHome = true): H2HFixture {
  seq += 1
  const home = arsAtHome ? ARS : CHE
  const away = arsAtHome ? CHE : ARS
  const arsWon = winner === 'ars'
  const drew = winner === 'draw'
  const homeGoals = drew ? 1 : (arsAtHome ? arsWon : !arsWon) ? 2 : 0
  const awayGoals = drew ? 1 : (arsAtHome ? arsWon : !arsWon) ? 0 : 2
  return {
    fixtureId: seq,
    date: `2026-0${(seq % 9) + 1}-01T15:00:00+00:00`,
    competitionId: 39,
    competition: 'Premier League',
    venueName: 'Emirates Stadium',
    homeExternalId: home,
    awayExternalId: away,
    homeGoals,
    awayGoals,
    htHome: null,
    htAway: null,
  }
}

function form(homeStrip: FormOutcome[], awayStrip: FormOutcome[]): MatchForm {
  const side = (venue: 'home' | 'away', strip: FormOutcome[]) => ({
    club: { clubId: venue, externalClubId: venue === 'home' ? ARS : CHE, name: venue, abbreviation: 'X', crestUrl: null },
    venue,
    played: strip.length,
    won: strip.filter((o) => o === 'W').length,
    drawn: strip.filter((o) => o === 'D').length,
    lost: strip.filter((o) => o === 'L').length,
    goalsFor: 0,
    goalsAgainst: 0,
    goalsForPerGame: 0,
    goalsAgainstPerGame: 0,
    strip,
    overallPlayed: strip.length,
    overallStrip: strip,
  })
  return { home: side('home', homeStrip), away: side('away', awayStrip), seasonPlayed: 6 }
}

function input(over: Partial<HeadlineInput> = {}): HeadlineInput {
  return {
    summary: summary(),
    form: null,
    homeName: 'Arsenal',
    awayName: 'Chelsea',
    homeExternalId: ARS,
    venue: 'the Emirates',
    ...over,
  }
}

describe('nothing is the common case', () => {
  it('an ordinary pairing gets no headline at all', () => {
    // ⚠ THE POINT OF THE WHOLE EXERCISE. Most fixtures have no fact that beats
    // chance, and a card with no gold line on it is the design working.
    expect(pickHeadline(input())).toBeNull()
  })

  it('a pairing with no history and no form gets nothing', () => {
    expect(pickHeadline(input({ summary: summary({ meetings: 0, span: null }) }))).toBeNull()
  })
})

describe('⚠⚠ the drought no longer fires at three visits', () => {
  // This is the regression the picker exists to prevent. 0.669^3 = 29.9%.
  it('three visits is silence', () => {
    const i = input({
      summary: summary({ venueDrought: { side: 'away', visits: 3, lastWinYear: '2019' } }),
    })
    expect(pickHeadline(i)).toBeNull()
  })

  it('five is still silence — the floor is six', () => {
    const i = input({
      summary: summary({ venueDrought: { side: 'away', visits: 5, lastWinYear: '2019' } }),
    })
    expect(pickHeadline(i)).toBeNull()
  })

  it('six speaks, and names the club and the year', () => {
    const i = input({
      summary: summary({ venueDrought: { side: 'away', visits: 6, lastWinYear: '2011' } }),
    })
    const h = pickHeadline(i)
    expect(h?.kind).toBe('drought')
    expect(h?.text).toBe('Chelsea have not won at the Emirates since 2011.')
    expect(h?.note).toBe('6 visits')
  })
})

describe('never won here', () => {
  it('⚠ earns a lower floor than the drought, because "never" is a stronger claim', () => {
    const i = input({
      summary: summary({ venueDrought: { side: 'away', visits: 5, lastWinYear: null } }),
    })
    const h = pickHeadline(i)
    expect(h?.kind).toBe('never_won_here')
    expect(h?.text).toBe('Chelsea have never won at the Emirates.')
  })

  it('but four visits is still a fortnight, not a hoodoo', () => {
    const i = input({
      summary: summary({ venueDrought: { side: 'away', visits: 4, lastWinYear: null } }),
    })
    expect(pickHeadline(i)).toBeNull()
  })

  it('names the HOME club when it is the home club on the run', () => {
    const i = input({
      summary: summary({ venueDrought: { side: 'home', visits: 6, lastWinYear: null } }),
    })
    expect(pickHeadline(i)?.text).toBe('Arsenal have never won at the Emirates.')
  })

  it('falls back when the ground has no name', () => {
    const i = input({
      venue: null,
      summary: summary({ venueDrought: { side: 'away', visits: 6, lastWinYear: null } }),
    })
    expect(pickHeadline(i)?.text).toBe('Chelsea have never won at this ground.')
  })
})

describe('a run of meetings', () => {
  it('⚠⚠ resolves the winner by PROVIDER ID, not by the payload column', () => {
    // The clubs swap ends between meetings, so reading home/away straight
    // through credits roughly half the run to the wrong club — a complete,
    // plausible and entirely wrong sentence.
    const i = input({
      summary: summary({
        recent: [meeting('ars', true), meeting('ars', false), meeting('ars', true)],
      }),
    })
    const h = pickHeadline(i)
    expect(h?.kind).toBe('meeting_streak')
    expect(h?.text).toBe('Arsenal have won the last three meetings.')
  })

  it('⚠ a draw ends the run rather than being skipped', () => {
    // Won, drew, won is not two in a row.
    const i = input({
      summary: summary({
        recent: [meeting('ars'), meeting('draw'), meeting('ars'), meeting('ars')],
      }),
    })
    expect(pickHeadline(i)).toBeNull()
  })

  it('two is not a run', () => {
    const i = input({ summary: summary({ recent: [meeting('che'), meeting('che')] }) })
    expect(pickHeadline(i)).toBeNull()
  })

  it('names the away club when the run is theirs', () => {
    const i = input({
      summary: summary({ recent: [meeting('che'), meeting('che'), meeting('che')] }),
    })
    expect(pickHeadline(i)?.text).toBe('Chelsea have won the last three meetings.')
  })
})

describe('⚠ form — the only candidate about NOW', () => {
  it('a clash outranks a single streak', () => {
    const i = input({ form: form(['W', 'W', 'W', 'W'], ['L', 'L', 'L', 'L']) })
    const h = pickHeadline(i)
    expect(h?.kind).toBe('form_clash')
    expect(h?.text).toBe(
      'Arsenal have won four straight at home. Chelsea have lost four straight away.',
    )
  })

  it('one side alone is a venue streak', () => {
    const i = input({ form: form(['W', 'W', 'W', 'W'], ['W', 'D', 'L', 'W']) })
    const h = pickHeadline(i)
    expect(h?.kind).toBe('venue_streak')
    expect(h?.text).toBe('Arsenal have won their last four at home.')
  })

  it('⚠⚠ reads the strip from the END, because it is oldest first', () => {
    // Reading from the start would report the run a club was on five games ago
    // as if it were current, and it would look entirely plausible.
    const stale = form(['W', 'W', 'W', 'W', 'L'], ['D', 'D', 'D', 'D', 'D'])
    expect(pickHeadline(input({ form: stale }))).toBeNull()

    const current = form(['L', 'W', 'W', 'W', 'W'], ['D', 'D', 'D', 'D', 'D'])
    expect(pickHeadline(input({ form: current }))?.kind).toBe('venue_streak')
  })

  it('three straight is not enough', () => {
    expect(pickHeadline(input({ form: form(['W', 'W', 'W'], ['D', 'D', 'D']) }))).toBeNull()
  })

  it('copes with no form at all', () => {
    expect(pickHeadline(input({ form: null }))).toBeNull()
  })
})

describe('the remaining candidates', () => {
  it('both teams scoring, over a real sample', () => {
    const h = pickHeadline(input({ summary: summary({ meetings: 10, bothScored: 9 }) }))
    expect(h?.kind).toBe('both_scored')
    expect(h?.text).toBe('Both teams have scored in nine of their last ten meetings.')
    expect(h?.note).toBe('9 of 10')
  })

  it('⚠ but not over seven meetings, however lopsided', () => {
    expect(pickHeadline(input({ summary: summary({ meetings: 7, bothScored: 7 }) }))).toBeNull()
  })

  it('a high-scoring pairing states its own figure and claims nothing about the league', () => {
    const h = pickHeadline(input({ summary: summary({ meetings: 9, avgGoals: 4.1 }) }))
    expect(h?.kind).toBe('goals_high')
    expect(h?.text).toBe('These two have averaged 4.1 goals a meeting.')
    // ⚠ No "the league averages…" — that figure is not computed here, and an
    // uncomputed comparison would be the constant baseline the design forbids.
    expect(h?.text).not.toMatch(/league/i)
  })

  it('and a low-scoring one', () => {
    expect(pickHeadline(input({ summary: summary({ meetings: 9, avgGoals: 1.8 }) }))?.kind).toBe(
      'goals_low',
    )
  })

  it('a recurring scoreline needs both a count and a share', () => {
    const h = pickHeadline(
      input({ summary: summary({ meetings: 10, commonScore: { score: '2-1', count: 4 } }) }),
    )
    expect(h?.kind).toBe('common_score')
    expect(h?.text).toBe('It has finished 2–1 in four of their ten meetings.')

    // Three of ten is 30% — on the line — but three of twelve is not.
    expect(
      pickHeadline(
        input({ summary: summary({ meetings: 12, commonScore: { score: '2-1', count: 3 } }) }),
      ),
    ).toBeNull()
  })

  it('a rare pairing, but only across a long span', () => {
    const h = pickHeadline(
      input({
        summary: summary({ meetings: 2, span: { from: '2012-03-01', to: '2026-04-01' } }),
      }),
    )
    expect(h?.kind).toBe('rare_pairing')
    // ⚠ "twice", not "two" — English counts occasions differently from things.
    expect(h?.text).toBe('These two have met twice in 14 years.')
  })

  it('⚠ and "once" for a single meeting', () => {
    const h = pickHeadline(
      input({
        summary: summary({ meetings: 1, span: { from: '2014-03-01', to: '2026-04-01' } }),
      }),
    )
    expect(h?.text).toBe('These two have met once in twelve years.')
  })
})

describe('⚠⚠ order is rarity, and the first match wins', () => {
  it('never-won beats a meeting streak beats form', () => {
    const everything = input({
      form: form(['W', 'W', 'W', 'W'], ['L', 'L', 'L', 'L']),
      summary: summary({
        venueDrought: { side: 'away', visits: 6, lastWinYear: null },
        recent: [meeting('ars'), meeting('ars'), meeting('ars')],
        meetings: 10,
        bothScored: 9,
        avgGoals: 4.2,
        commonScore: { score: '2-1', count: 4 },
      }),
    })
    expect(pickHeadline(everything)?.kind).toBe('never_won_here')
  })

  it('with the drought removed, the meeting streak takes it', () => {
    const i = input({
      form: form(['W', 'W', 'W', 'W'], ['L', 'L', 'L', 'L']),
      summary: summary({
        recent: [meeting('ars'), meeting('ars'), meeting('ars')],
        meetings: 10,
        bothScored: 9,
      }),
    })
    expect(pickHeadline(i)?.kind).toBe('meeting_streak')
  })

  it('⚠ form outranks the drought — it is the only fact about now', () => {
    const i = input({
      form: form(['W', 'W', 'W', 'W'], ['L', 'L', 'L', 'L']),
      summary: summary({ venueDrought: { side: 'away', visits: 8, lastWinYear: '2011' } }),
    })
    expect(pickHeadline(i)?.kind).toBe('form_clash')
  })

  it('every headline carries a denominator', () => {
    // ⚠ "Not won here in 7 visits" and "in 3" are different claims, and the
    // difference is invisible unless the line says so.
    const cases = [
      input({ summary: summary({ venueDrought: { side: 'away', visits: 6, lastWinYear: null } }) }),
      input({ summary: summary({ recent: [meeting('ars'), meeting('ars'), meeting('ars')] }) }),
      input({ form: form(['W', 'W', 'W', 'W'], ['D', 'D', 'D', 'D']) }),
      input({ summary: summary({ meetings: 10, bothScored: 9 }) }),
      input({ summary: summary({ meetings: 9, avgGoals: 4.1 }) }),
    ]
    for (const c of cases) {
      const h = pickHeadline(c)
      expect(h, 'this case should produce a headline').not.toBeNull()
      expect(h!.note.trim().length, `${h!.kind} has no denominator`).toBeGreaterThan(0)
    }
  })
})

describe('⚠ it reports, it never forecasts', () => {
  it('no headline acquires a verb about the future', () => {
    // The same facts can be written as a tip sheet, and this product is
    // explicitly not for bettors. A mechanical check on the copy.
    const banned = /\b(will|should|expect|due|likely|back them|value|tip)\b/i
    const cases = [
      input({ summary: summary({ venueDrought: { side: 'away', visits: 6, lastWinYear: null } }) }),
      input({ summary: summary({ venueDrought: { side: 'away', visits: 8, lastWinYear: '2011' } }) }),
      input({ summary: summary({ recent: [meeting('che'), meeting('che'), meeting('che')] }) }),
      input({ form: form(['W', 'W', 'W', 'W'], ['L', 'L', 'L', 'L']) }),
      input({ form: form(['W', 'W', 'W', 'W'], ['D', 'D', 'D', 'D']) }),
      input({ summary: summary({ meetings: 10, bothScored: 9 }) }),
      input({ summary: summary({ meetings: 9, avgGoals: 4.1 }) }),
      input({ summary: summary({ meetings: 9, avgGoals: 1.5 }) }),
      input({ summary: summary({ meetings: 10, commonScore: { score: '2-1', count: 4 } }) }),
      input({ summary: summary({ meetings: 1, span: { from: '2012-01-01', to: '2026-01-01' } }) }),
    ]
    for (const c of cases) {
      const h = pickHeadline(c)
      expect(h, 'this case should produce a headline').not.toBeNull()
      expect(h!.text, `${h!.kind} reads as a tip`).not.toMatch(banned)
    }
  })
})
