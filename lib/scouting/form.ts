// =============================================================
// Form, split by where they are playing
// =============================================================
// The half of a match scout report that ALWAYS has something to say. A pairing
// can have no history — two promoted clubs have never met however late in the
// season it is — but every club has played at home and away, so this is what
// carries the sheet when the head-to-head cannot.
//
// ## ⚠⚠ THE VENUE SPLIT IS THE WHOLE POINT, NOT A REFINEMENT
//
// A fortress-at-home, dreadful-away side is the single most useful thing a
// pick'em player can know, and it is invisible on a league table — which sums
// the two and reports the average of two different teams. "Arsenal at home" and
// "Chelsea away" are the two facts the fixture is actually made of.
//
// ## ⚠⚠ STRICTLY BEFORE THIS KICKOFF
//
// Read on a fixture already played, "form" must mean the games leading INTO it,
// not the most recent in the season — which would include the match being
// looked at and everything after it, shown as though it were the build-up.
// `matchContext.ts` carries the same warning for the phone's version; this is
// the server's, and the boundary is compared on epoch milliseconds because
// `kickoff_at` is `timestamptz` and the feed is free to serve a different
// offset per row.
//
// ⚠ A RESULT IS TWO SCORES, NOT A STATUS. A postponed fixture can carry
// `is_completed` and an abandoned one can carry goals; both numbers present is
// the only claim that a result exists to read.
//
// ⚠ PURE: no client, no DB, no network. The route reads; this counts.
// =============================================================

import type { ClubRef } from './opponent'

/** One played fixture, as much of one as form needs. */
export type FormFixture = {
  fixtureId: string
  kickoffAt: string
  homeClubId: string
  awayClubId: string
  homeGoals: number | null
  awayGoals: number | null
}

export type FormOutcome = 'W' | 'D' | 'L'

/** How many results the strip shows. */
export const FORM_LENGTH = 5

export type VenueForm = {
  club: ClubRef
  /** Which end of THIS fixture they are at — the split that matters. */
  venue: 'home' | 'away'

  /** Games at that venue before this kickoff. */
  played: number
  won: number
  drawn: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  /** Null when nothing has been played at that venue yet. */
  goalsForPerGame: number | null
  goalsAgainstPerGame: number | null
  /** ⚠ OLDEST FIRST, so it reads left to right in the order it happened. */
  strip: FormOutcome[]

  /**
   * The same club across BOTH venues.
   *
   * ⚠ IT IS THE FALLBACK, AND IT HAS TO BE PRESENT RATHER THAN COMPUTED LATER.
   * In August a club has played once at home; a venue split over one game is a
   * fact but not a pattern, and the sheet needs something true to show beside
   * it. The screen decides which to lead with — this supplies both so that
   * decision needs no second read.
   */
  overallPlayed: number
  overallStrip: FormOutcome[]
}

export type MatchForm = {
  home: VenueForm
  away: VenueForm
  /**
   * ⚠ STATED, BECAUSE A THIN SPLIT IS NOT A BROKEN ONE. The sheet says "3 at
   * home" rather than implying a season's worth, and a reader comparing this
   * against anywhere else can see why the numbers are small.
   */
  seasonPlayed: number
}

function outcomeFor(f: FormFixture, clubId: string): FormOutcome | null {
  if (f.homeGoals === null || f.awayGoals === null) return null
  const wasHome = f.homeClubId === clubId
  const goalsFor = wasHome ? f.homeGoals : f.awayGoals
  const goalsAgainst = wasHome ? f.awayGoals : f.homeGoals
  return goalsFor > goalsAgainst ? 'W' : goalsFor < goalsAgainst ? 'L' : 'D'
}

/**
 * Everything one club did before a given kickoff, optionally at one venue only.
 *
 * ⚠ THE VENUE FILTER RUNS BEFORE THE LIMIT. Taking the last five overall and
 * then keeping the home ones yields between zero and five results and calls the
 * answer "last five at home" — which is a different, smaller, wrong claim.
 */
function summariseClub(
  fixtures: FormFixture[],
  clubId: string,
  beforeKickoff: string,
  venue: 'home' | 'away' | null,
): {
  played: number
  won: number
  drawn: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  strip: FormOutcome[]
} {
  const boundary = new Date(beforeKickoff).getTime()

  const theirs = fixtures
    .filter((f) => {
      if (f.homeClubId !== clubId && f.awayClubId !== clubId) return false
      // ⚠ A RESULT IS TWO SCORES. See the header.
      if (f.homeGoals === null || f.awayGoals === null) return false
      if (venue === 'home' && f.homeClubId !== clubId) return false
      if (venue === 'away' && f.awayClubId !== clubId) return false
      const t = new Date(f.kickoffAt).getTime()
      // ⚠ A fixture with an unparseable kickoff is dropped rather than sorted to
      // the front — NaN compares false against everything and would otherwise
      // survive the boundary test by accident.
      return !Number.isNaN(t) && !Number.isNaN(boundary) && t < boundary
    })
    .sort((a, b) => new Date(b.kickoffAt).getTime() - new Date(a.kickoffAt).getTime())

  let won = 0
  let drawn = 0
  let lost = 0
  let goalsFor = 0
  let goalsAgainst = 0

  for (const f of theirs) {
    const wasHome = f.homeClubId === clubId
    goalsFor += (wasHome ? f.homeGoals : f.awayGoals) as number
    goalsAgainst += (wasHome ? f.awayGoals : f.homeGoals) as number
    const o = outcomeFor(f, clubId)
    if (o === 'W') won++
    else if (o === 'D') drawn++
    else if (o === 'L') lost++
  }

  // ⚠ `reverse()` AFTER the slice, so the strip is the five most RECENT shown
  // oldest first. Reversing before slicing would take the five OLDEST.
  const strip = theirs
    .slice(0, FORM_LENGTH)
    .map((f) => outcomeFor(f, clubId))
    .filter((o): o is FormOutcome => o !== null)
    .reverse()

  return { played: theirs.length, won, drawn, lost, goalsFor, goalsAgainst, strip }
}

const perGame = (total: number, played: number): number | null =>
  played === 0 ? null : Math.round((total / played) * 10) / 10

/**
 * The form half of a match scout report.
 *
 * @param fixtures  every fixture in the season. ⚠ Including unplayed ones —
 *                  they are filtered here rather than by the caller, so the
 *                  boundary rule has one owner.
 */
export function buildMatchForm(
  fixtures: FormFixture[],
  opts: {
    homeClub: ClubRef
    awayClub: ClubRef
    /** This fixture's kickoff — the boundary. */
    kickoffAt: string
  },
): MatchForm {
  const { homeClub, awayClub, kickoffAt } = opts

  const build = (club: ClubRef, venue: 'home' | 'away'): VenueForm => {
    const atVenue = summariseClub(fixtures, club.clubId, kickoffAt, venue)
    const overall = summariseClub(fixtures, club.clubId, kickoffAt, null)
    return {
      club,
      venue,
      played: atVenue.played,
      won: atVenue.won,
      drawn: atVenue.drawn,
      lost: atVenue.lost,
      goalsFor: atVenue.goalsFor,
      goalsAgainst: atVenue.goalsAgainst,
      goalsForPerGame: perGame(atVenue.goalsFor, atVenue.played),
      goalsAgainstPerGame: perGame(atVenue.goalsAgainst, atVenue.played),
      strip: atVenue.strip,
      overallPlayed: overall.played,
      overallStrip: overall.strip,
    }
  }

  const seasonPlayed = fixtures.filter(
    (f) => f.homeGoals !== null && f.awayGoals !== null,
  ).length

  return {
    home: build(homeClub, 'home'),
    away: build(awayClub, 'away'),
    seasonPlayed,
  }
}
