// =============================================================
// The opponent dossier
// =============================================================
// The module reduces one member's picks to a set of claims about how they pick,
// and almost every one of those claims can be wrong in a way that renders
// perfectly. The tests below are grouped by the mistake they are guarding
// against rather than by the function they call:
//
//   · a rate shown over a sample too small to support it
//   · a baseline that is a constant rather than a measurement
//   · a denominator that is the wrong set (backed-over-backed, right-over-all)
//   · a predicted draw counted as opposition to both clubs
//   · a fixture that has not been played counted as one somebody got wrong
//   · a form strip ordered by matchweek number rather than by kickoff
// =============================================================

import { describe, expect, it } from 'vitest'

import {
  buildClubLeans,
  buildOpponentDossier,
  MIN_RATE_SAMPLE,
  rate,
  type ClubRef,
  type PickRow,
} from '../opponent'

const ARS: ClubRef = { clubId: 'ars', name: 'Arsenal', abbreviation: 'ARS' }
const CHE: ClubRef = { clubId: 'che', name: 'Chelsea', abbreviation: 'CHE' }
const MUN: ClubRef = { clubId: 'mun', name: 'Manchester United', abbreviation: 'MUN' }

let seq = 0

function pick(over: Partial<PickRow> = {}): PickRow {
  seq += 1
  return {
    entry: 'e1',
    fixtureId: `f${seq}`,
    matchweek: 1,
    kickoffAt: `2026-09-${String(seq).padStart(2, '0')}T15:00:00+00:00`,
    predictedHome: 2,
    predictedAway: 1,
    actualHome: 2,
    actualAway: 1,
    homeClub: ARS,
    awayClub: CHE,
    scoreType: 'exact',
    points: 100,
    ...over,
  }
}

/** n identical picks — the quickest way to get above or below the rate floor. */
function many(n: number, over: Partial<PickRow> = {}): PickRow[] {
  return Array.from({ length: n }, () => pick(over))
}

describe('the rate floor', () => {
  it('withholds a percentage below the floor and still reports the fraction', () => {
    const r = rate(1, MIN_RATE_SAMPLE - 1)
    expect(r.pct).toBeNull()
    expect(r.count).toBe(1)
    expect(r.of).toBe(MIN_RATE_SAMPLE - 1)
  })

  it('releases the percentage exactly at the floor, not one above it', () => {
    expect(rate(1, MIN_RATE_SAMPLE).pct).toBe(20)
  })

  it('never shows a hit rate over a handful of scored picks', () => {
    // ⚠ THE FAILURE THIS CATCHES reads as "50% hit rate" beside two games. It is
    // not a crash and it is not implausible — it is simply a claim the sample
    // cannot support, which is the entire class this floor exists for.
    const d = buildOpponentDossier(many(2, { scoreType: 'exact' }))
    expect(d.hitRate.pct).toBeNull()
    expect(d.hitRate.count).toBe(2)
  })
})

describe('the baseline is measured, not assumed', () => {
  it('computes goals per game from the fixtures in hand', () => {
    // Six played fixtures, eighteen goals. Nothing about 2.8 anywhere.
    const d = buildOpponentDossier(many(6, { actualHome: 2, actualAway: 1 }))
    expect(d.baseline.goalsPerGame).toBe(3)
    expect(d.baseline.played).toBe(6)
  })

  it('measures the draw and home-win rates off the same fixtures', () => {
    const d = buildOpponentDossier([
      ...many(3, { actualHome: 1, actualAway: 1 }),
      ...many(5, { actualHome: 2, actualAway: 0 }),
      ...many(2, { actualHome: 0, actualAway: 1 }),
    ])
    expect(d.baseline.drawRate.count).toBe(3)
    expect(d.baseline.homeWinRate.count).toBe(5)
    expect(d.baseline.drawRate.of).toBe(10)
  })

  it('excludes unplayed fixtures from the baseline but not from tendency', () => {
    // ⚠ THE SPLIT THAT MATTERS. A pick made for next Saturday says something
    // about how they pick and nothing about the league's goals per game. Folding
    // the two would either shrink the tendency sample or invent a 0-0 result.
    const d = buildOpponentDossier([
      ...many(5, { actualHome: 3, actualAway: 1 }),
      ...many(4, { actualHome: null, actualAway: null, scoreType: null, points: null }),
    ])
    expect(d.baseline.played).toBe(5)
    expect(d.baseline.goalsPerGame).toBe(4)
    expect(d.picks).toBe(9)
    expect(d.fingerprint.theirDrawRate.of).toBe(9)
  })

  it('reports a null baseline rather than zero when nothing has been played', () => {
    const d = buildOpponentDossier(
      many(6, { actualHome: null, actualAway: null, scoreType: null, points: null }),
    )
    expect(d.baseline.goalsPerGame).toBeNull()
    expect(d.pointsPerFixture).toBeNull()
  })
})

describe('club lean', () => {
  it('counts a backing for the side they picked to win, at both ends', () => {
    const leans = buildClubLeans([pick({ predictedHome: 2, predictedAway: 1 })])
    const ars = leans.find((l) => l.club.clubId === 'ars')!
    const che = leans.find((l) => l.club.clubId === 'che')!
    expect(ars.backed).toBe(1)
    expect(che.backed).toBe(0)
    expect(che.opposed).toBe(1)
  })

  it('does NOT treat a predicted draw as opposition to either club', () => {
    // ⚠ "They think this ends level" and "they think this club loses" are
    // different opinions and only one of them is about the club. Counting a
    // draw as opposition would make every member look hostile to everybody.
    const leans = buildClubLeans([pick({ predictedHome: 1, predictedAway: 1 })])
    expect(leans.every((l) => l.opposed === 0)).toBe(true)
    expect(leans.every((l) => l.backed === 0)).toBe(true)
    expect(leans.every((l) => l.seen === 1)).toBe(true)
  })

  it('measures the venue split against appearances, not against backings', () => {
    // ⚠⚠ THE DENOMINATOR BUG. Arsenal appear at home five times and are backed
    // three of them. Counting backed-over-backed reads 3/3 — "backs Arsenal at
    // home every single time" — which is the exact sentence the mockup puts on
    // screen, and it would be false.
    const leans = buildClubLeans([
      ...many(3, { homeClub: ARS, awayClub: CHE, predictedHome: 2, predictedAway: 0 }),
      ...many(2, { homeClub: ARS, awayClub: CHE, predictedHome: 0, predictedAway: 2 }),
    ])
    const ars = leans.find((l) => l.club.clubId === 'ars')!
    expect(ars.backedHome.count).toBe(3)
    expect(ars.backedHome.of).toBe(5)
  })

  it('keeps home and away leanings apart', () => {
    const leans = buildClubLeans([
      ...many(5, { homeClub: ARS, awayClub: CHE, predictedHome: 3, predictedAway: 0 }),
      ...many(5, { homeClub: CHE, awayClub: ARS, predictedHome: 3, predictedAway: 0 }),
    ])
    const ars = leans.find((l) => l.club.clubId === 'ars')!
    expect(ars.backedHome).toEqual({ count: 5, of: 5, pct: 100 })
    expect(ars.backedAway).toEqual({ count: 0, of: 5, pct: 0 })
  })

  it('names the most-backed club by share, not by how often they played', () => {
    // ⚠ Chelsea are backed 5 times of 5; Arsenal 6 of 12. A count picks Arsenal
    // and would name whoever the fixture list happened to show most.
    const d = buildOpponentDossier([
      ...many(6, { homeClub: ARS, awayClub: MUN, predictedHome: 2, predictedAway: 0 }),
      ...many(6, { homeClub: ARS, awayClub: MUN, predictedHome: 0, predictedAway: 2 }),
      ...many(5, { homeClub: CHE, awayClub: MUN, predictedHome: 2, predictedAway: 0 }),
    ])
    expect(d.mostBacked?.club.clubId).toBe('che')
  })

  it('keeps a club seen once out of the most-backed answer', () => {
    const d = buildOpponentDossier([
      ...many(6, { homeClub: ARS, awayClub: MUN, predictedHome: 2, predictedAway: 0 }),
      ...many(1, { homeClub: CHE, awayClub: MUN, predictedHome: 2, predictedAway: 0 }),
    ])
    expect(d.mostBacked?.club.clubId).toBe('ars')
  })
})

describe('the blind spot', () => {
  it('needs conviction before it needs failure', () => {
    // ⚠ A club backed once and lost once is 0% right and tops any list sorted on
    // accuracy alone. It is a coin landing badly, not a blind spot.
    const d = buildOpponentDossier([
      ...many(1, { homeClub: MUN, awayClub: CHE, predictedHome: 2, predictedAway: 0,
        actualHome: 0, actualAway: 1 }),
    ])
    expect(d.blindSpot).toBeNull()
  })

  it('finds the club backed often and got wrong more than half the time', () => {
    const d = buildOpponentDossier([
      // Backed United six times, right twice.
      ...many(2, { homeClub: MUN, awayClub: CHE, predictedHome: 2, predictedAway: 0,
        actualHome: 2, actualAway: 0 }),
      ...many(4, { homeClub: MUN, awayClub: CHE, predictedHome: 2, predictedAway: 0,
        actualHome: 0, actualAway: 1 }),
    ])
    expect(d.blindSpot?.club.clubId).toBe('mun')
    expect(d.blindSpot?.backedRight).toBe(2)
    expect(d.blindSpot?.backedPlayed).toBe(6)
  })

  it('does not count an unplayed backing as one they got wrong', () => {
    // ⚠ Six backings, five of them for fixtures that have not kicked off. Letting
    // those into the denominator reads "right 1 of 6" — a member looks worse the
    // further ahead they pick, which is the opposite of true.
    const d = buildOpponentDossier([
      ...many(1, { homeClub: MUN, awayClub: CHE, predictedHome: 2, predictedAway: 0,
        actualHome: 2, actualAway: 0 }),
      ...many(5, { homeClub: MUN, awayClub: CHE, predictedHome: 2, predictedAway: 0,
        actualHome: null, actualAway: null, scoreType: null, points: null }),
    ])
    expect(d.blindSpot).toBeNull()
  })
})

describe('fingerprint', () => {
  it('reports a stated absence rather than leaving it out', () => {
    const d = buildOpponentDossier(many(6, { predictedHome: 2, predictedAway: 1 }))
    expect(d.fingerprint.hasPredictedNil).toBe(false)
  })

  it('breaks a signature tie towards the lower-scoring line', () => {
    // Same tiebreak as summariseH2H: a run of 1–0s beats a coincidence of 4–3s,
    // so "the usual scoreline" reads as usual.
    const d = buildOpponentDossier([
      ...many(3, { predictedHome: 1, predictedAway: 0 }),
      ...many(3, { predictedHome: 4, predictedAway: 3 }),
    ])
    expect(d.fingerprint.signature?.score).toBe('1–0')
  })

  it('measures their draw rate over every pick, played or not', () => {
    const d = buildOpponentDossier([
      ...many(2, { predictedHome: 1, predictedAway: 1 }),
      ...many(8, { predictedHome: 2, predictedAway: 1 }),
    ])
    expect(d.fingerprint.theirDrawRate).toEqual({ count: 2, of: 10, pct: 20 })
  })
})

describe('contrarian', () => {
  it('is null when no crowd data was supplied', () => {
    expect(buildOpponentDossier(many(6)).contrarian).toBeNull()
  })

  it('scores "and right" over the times they broke, not over every pick', () => {
    // ⚠⚠ THE DENOMINATOR SWAP. Two of ten picks go against the crowd and one of
    // those two came in. That is 50% — right when they broke. Measured over all
    // ten it is 10%, a differently-shaped number wearing the same label.
    const rows = [
      ...many(8, { predictedHome: 2, predictedAway: 0, actualHome: 2, actualAway: 0 }),
      pick({ predictedHome: 0, predictedAway: 2, actualHome: 0, actualAway: 2 }),
      pick({ predictedHome: 0, predictedAway: 2, actualHome: 3, actualAway: 0 }),
    ]
    const crowd = new Map(rows.map((r) => [r.fixtureId, 'home' as const]))
    const d = buildOpponentDossier(rows, { crowdMajority: crowd })
    expect(d.contrarian?.against.count).toBe(2)
    expect(d.contrarian?.against.of).toBe(10)
    expect(d.contrarian?.andRight.count).toBe(1)
    expect(d.contrarian?.andRight.of).toBe(2)
  })

  it('only counts fixtures the crowd map actually covers', () => {
    const rows = many(10, { predictedHome: 2, predictedAway: 0 })
    const crowd = new Map(rows.slice(0, 6).map((r) => [r.fixtureId, 'away' as const]))
    const d = buildOpponentDossier(rows, { crowdMajority: crowd })
    expect(d.contrarian?.against.of).toBe(6)
  })
})

describe('reliability', () => {
  it('is null when the caller did not supply the available count', () => {
    // ⚠ "Missed none" and "we did not look" render identically as a 0, and only
    // one of them is a claim we can make.
    expect(buildOpponentDossier(many(6)).reliability).toBeNull()
  })

  it('counts what they did not pick', () => {
    const d = buildOpponentDossier(many(58), { available: 60 })
    expect(d.reliability).toEqual({ made: 58, available: 60, missed: 2 })
  })

  it('never reports a negative miss count', () => {
    const d = buildOpponentDossier(many(10), { available: 4 })
    expect(d.reliability?.missed).toBe(0)
  })
})

describe('form', () => {
  it('orders matchweeks by kickoff, never by number', () => {
    // ⚠ Matchweek 8 was played BEFORE matchweek 7 — migration 101 measured gaps
    // of minus 121 days across three real seasons. Sorting on the number shows a
    // member's results in an order they never happened in.
    const d = buildOpponentDossier([
      pick({ matchweek: 7, kickoffAt: '2026-11-20T15:00:00+00:00', points: 10 }),
      pick({ matchweek: 8, kickoffAt: '2026-10-01T15:00:00+00:00', points: 20 }),
    ])
    expect(d.form.map((f) => f.matchweek)).toEqual([8, 7])
  })

  it('sums a matchweek across its fixtures', () => {
    const d = buildOpponentDossier([
      pick({ matchweek: 3, points: 40 }),
      pick({ matchweek: 3, points: 60 }),
    ])
    expect(d.form).toEqual([{ matchweek: 3, points: 100 }])
  })
})

describe('the read', () => {
  /** n picks predicting `ph`–`pa`, over fixtures that actually finished `ah`–`aa`. */
  function reading(
    n: number,
    predicted: [number, number],
    actual: [number, number],
  ) {
    return buildOpponentDossier(
      many(n, {
        predictedHome: predicted[0],
        predictedAway: predicted[1],
        actualHome: actual[0],
        actualAway: actual[1],
      }),
    ).read
  }

  it('says nothing about somebody with no revealed picks', () => {
    expect(buildOpponentDossier([]).read).toBe('No revealed picks yet — nothing to read.')
  })

  it('refuses to characterise a thin sample', () => {
    // ⚠ THE FAILURE THIS CATCHES is a confident character sketch of somebody who
    // has picked four games. Prose follows the same floor as the rates.
    expect(buildOpponentDossier(many(3)).read).toBe(
      'Too few revealed picks to read a pattern yet.',
    )
  })

  it('calls somebody an optimist relative to the league, not to a constant', () => {
    // Predicts 4 goals a game in a league producing 2 — optimist.
    expect(reading(10, [3, 1], [1, 1])).toContain('high-scoring optimist')
    // ⚠⚠ THE SAME PREDICTION in a league producing 6 is the opposite verdict.
    // A hardcoded 2.8 would call this member an optimist in both.
    expect(reading(10, [3, 1], [4, 2])).toContain('cautious, low-scoring picker')
  })

  it('notices somebody who will not call a draw', () => {
    // Every pick a home win; nearly every game actually drawn.
    const rows = [
      ...many(8, { predictedHome: 2, predictedAway: 0, actualHome: 1, actualAway: 1 }),
      ...many(2, { predictedHome: 2, predictedAway: 0, actualHome: 2, actualAway: 0 }),
    ]
    expect(buildOpponentDossier(rows).read).toContain('never calls a draw')
  })

  it('phrases the blind spot as a problem with the club, not with the person', () => {
    // ⚠ "Has an Arsenal problem" is a fact about football that happens to be
    // about them. Banter is public; the distinction is the whole difference.
    const d = buildOpponentDossier(
      many(6, { homeClub: ARS, awayClub: CHE, predictedHome: 2, predictedAway: 0,
        actualHome: 0, actualAway: 1 }),
    )
    expect(d.read).toContain('an Arsenal problem')
    expect(d.read).not.toContain('wrong')
  })

  it('is deterministic — the same dossier reads the same way twice', () => {
    // A member screenshots a verdict into Banter; the next tap must agree.
    const rows = many(12, { predictedHome: 3, predictedAway: 1, actualHome: 1, actualAway: 0 })
    expect(buildOpponentDossier(rows).read).toBe(buildOpponentDossier(rows).read)
  })

  it('ends as one sentence however many clauses fire', () => {
    const rows = many(12, { homeClub: MUN, awayClub: CHE,
      predictedHome: 3, predictedAway: 1, actualHome: 0, actualAway: 1 })
    const read = buildOpponentDossier(rows).read
    expect(read.endsWith('.')).toBe(true)
    expect(read.split('.').filter(Boolean)).toHaveLength(1)
  })
})

describe('the draw clause says what it means', () => {
  /** Their draw rate against the league's, over a sample big enough to read. */
  function drawRead(theirDrawsOf20: number, realDrawsOf20: number) {
    const rows: PickRow[] = []
    for (let i = 0; i < 20; i++) {
      const theyCallDraw = i < theirDrawsOf20
      const itWasDrawn = i < realDrawsOf20
      rows.push(
        pick({
          predictedHome: theyCallDraw ? 1 : 2,
          predictedAway: 1,
          actualHome: itWasDrawn ? 1 : 2,
          actualAway: 1,
        }),
      )
    }
    return buildOpponentDossier(rows).read
  }

  it('does NOT say "almost never" about somebody calling a quarter of them', () => {
    // ⚠⚠ THE BUG THIS CLOSES, caught on the first real dossier on a device.
    // 25% against a league running 45% clears the gap threshold — but the card
    // two inches below prints "25%", and "almost never" beside it is a lie.
    const read = drawRead(5, 9)
    expect(read).not.toContain('almost never')
    expect(read).toContain('under-calls the draw')
  })

  it('still says "almost never" when they genuinely almost never do', () => {
    expect(drawRead(1, 9)).toContain('almost never calls a draw')
  })

  it('reads the other direction too', () => {
    // Somebody calling draws far MORE than the league produces is just as
    // readable a habit; saying nothing made the sentence one-sided.
    expect(drawRead(14, 2)).toContain('sees draws everywhere')
  })

  it('says nothing about the draw when they track reality', () => {
    const read = drawRead(5, 5)
    expect(read).not.toContain('draw')
  })
})

describe('the signature scoreline carries a rate, not a bare pair', () => {
  it('withholds its percentage below the floor, like every other rate', () => {
    // ⚠ THE PHONE MUST NOT OWN THIS DECISION. It renders a percentage where one
    // exists and the fraction otherwise; if the share arrived as two loose
    // counts, the phone would need its own copy of the floor to choose — and a
    // second copy of a threshold is how two surfaces end up disagreeing.
    const d = buildOpponentDossier(many(3, { predictedHome: 2, predictedAway: 1 }))
    expect(d.fingerprint.signature?.share.pct).toBeNull()
    expect(d.fingerprint.signature?.share).toMatchObject({ count: 3, of: 3 })
  })

  it('reports the share over every pick, not over the scorelines used', () => {
    // 6 of 10 picks are 2–1. The denominator is the picks, not the number of
    // DISTINCT scorelines, which would read 60% as "1 of 2".
    const d = buildOpponentDossier([
      ...many(6, { predictedHome: 2, predictedAway: 1 }),
      ...many(4, { predictedHome: 3, predictedAway: 0 }),
    ])
    expect(d.fingerprint.signature).toMatchObject({
      score: '2–1',
      share: { count: 6, of: 10, pct: 60 },
    })
  })
})
