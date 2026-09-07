// =============================================================
// The scout report — what usually happens when these two play
// =============================================================
// Built from `/fixtures/headtohead`, which returns every meeting the provider
// holds (back to 2010) with the date, venue, referee, competition, full-time
// score AND half-time score. One call per club pair, and a pair's history only
// changes when they play again — so this is the cheap half of a scouting tab.
//
// ⚠ WHAT IS DELIBERATELY NOT HERE: average possession, shots or xG. Those are
// not in the h2h payload; they need one `/fixtures/statistics` call per historic
// meeting, roughly 8,700 to cover a Premier League season's pairings. And they
// age badly in a way results do not — averaging possession across a 2010 fixture
// averages two squads and two managers that no longer exist.
//
// ⚠ PURE: no client, no DB, no network. The route fetches; this counts.
// =============================================================

/** One previous meeting, normalised off the provider's payload. */
export type H2HFixture = {
  fixtureId: number
  /** ISO kickoff. */
  date: string
  competitionId: number
  competition: string
  venueName: string | null
  homeExternalId: number
  awayExternalId: number
  homeGoals: number
  awayGoals: number
  /** Half-time, when the provider has it. */
  htHome: number | null
  htAway: number | null
}

/**
 * Competitions that are not competitive football.
 *
 * ⚠ AN EXCLUDE LIST, NOT AN INCLUDE LIST, AND IT FAILS OPEN. An include list
 * would silently drop every competition nobody thought to add — the Champions
 * League, the Conference League, a domestic cup in another country — and the
 * record would quietly be wrong with no way to notice. Letting an unknown
 * competition through is the safer error: a stray friendly in the count is a
 * small inaccuracy, a missing European tie is a lie about the fixture.
 *
 * 667 is "Friendlies Clubs"; 26 is the International Champions Cup, a
 * pre-season friendly tournament that is only nominally a trophy.
 */
const NON_COMPETITIVE_LEAGUE_IDS = new Set([667, 26])
const FRIENDLY_NAME = /friendl/i

export function isCompetitive(f: Pick<H2HFixture, 'competitionId' | 'competition'>): boolean {
  if (NON_COMPETITIVE_LEAGUE_IDS.has(f.competitionId)) return false
  return !FRIENDLY_NAME.test(f.competition)
}

/**
 * How many competitive meetings before the tab is worth offering.
 *
 * ⚠ MEASURED AGAINST THE REAL LEAGUE, not picked. Across current Premier League
 * pairings the provider holds 46 meetings for Arsenal v Chelsea and 33 of them
 * in the league — but only 3 for Sunderland v Brighton and 3 for Coventry v
 * Arsenal, one of those competitive. A "scout report" built on one prior meeting
 * is noise wearing the costume of insight, so below this the tab does not
 * appear at all.
 */
export const MIN_MEETINGS = 4

export type H2HSummary = {
  /** Competitive meetings counted. */
  meetings: number
  /** ⚠ From the point of view of THIS fixture's home club, not the older one's. */
  wins: number
  draws: number
  losses: number
  goalsFor: number
  goalsAgainst: number
  /** Both sides' goals per meeting, to one decimal. */
  avgGoals: number
  /** Meetings in which both clubs scored. */
  bothScored: number
  /** The scoreline that has come up most, written from the home club's view. */
  commonScore: { score: string; count: number } | null
  /** The record at this fixture's ground. Null when the venue is unknown. */
  atVenue: { played: number; wins: number; draws: number; losses: number } | null
  /**
   * Meetings level at half time that did not finish level.
   *
   * Only counted over fixtures the provider gave a half-time score for, which
   * is not all of them — `decidedAfterHtOf` is that denominator, so the screen
   * can say "3 of 11" rather than implying it looked at every meeting.
   */
  decidedAfterHt: number
  decidedAfterHtOf: number
  /** Most recent first. */
  recent: H2HFixture[]
  span: { from: string; to: string } | null
  competitions: { id: number; name: string; count: number }[]
  /** Friendlies dropped, reported rather than hidden. */
  excluded: number
}

const RECENT = 5

/**
 * Reduce a pile of meetings to the handful of facts worth showing.
 *
 * ⚠ EVERY FIGURE IS FROM THIS FIXTURE'S HOME CLUB'S POINT OF VIEW, and the two
 * clubs swap ends between meetings — the home club of the match being viewed was
 * away for roughly half its history. So `wins` is that club's wins wherever they
 * were played, and `goalsFor` is their goals, not the goals scored by whoever
 * happened to be at home that day. Reading the payload's home/away columns
 * directly is the obvious mistake and produces a record that is simply someone
 * else's.
 */
export function summariseH2H(
  fixtures: H2HFixture[],
  opts: { homeExternalId: number; venueName?: string | null },
): H2HSummary {
  const played = fixtures.filter(isCompetitive)
  const excluded = fixtures.length - played.length

  // Newest first, so `recent` and `span` read off the same order.
  const ordered = [...played].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  )

  let wins = 0
  let draws = 0
  let losses = 0
  let goalsFor = 0
  let goalsAgainst = 0
  let bothScored = 0
  let decidedAfterHt = 0
  let decidedAfterHtOf = 0

  const scoreTally = new Map<string, number>()
  const compTally = new Map<number, { id: number; name: string; count: number }>()
  const venue = { played: 0, wins: 0, draws: 0, losses: 0 }

  for (const f of ordered) {
    const weWereHome = f.homeExternalId === opts.homeExternalId
    const ours = weWereHome ? f.homeGoals : f.awayGoals
    const theirs = weWereHome ? f.awayGoals : f.homeGoals

    goalsFor += ours
    goalsAgainst += theirs
    if (ours > theirs) wins++
    else if (ours < theirs) losses++
    else draws++
    if (f.homeGoals > 0 && f.awayGoals > 0) bothScored++

    const key = `${ours}-${theirs}`
    scoreTally.set(key, (scoreTally.get(key) ?? 0) + 1)

    const comp = compTally.get(f.competitionId) ?? {
      id: f.competitionId,
      name: f.competition,
      count: 0,
    }
    comp.count++
    compTally.set(f.competitionId, comp)

    // ⚠ Only where the provider actually gave a half-time score; the denominator
    // travels with the number so the screen never implies it saw them all.
    if (f.htHome !== null && f.htAway !== null) {
      decidedAfterHtOf++
      if (f.htHome === f.htAway && f.homeGoals !== f.awayGoals) decidedAfterHt++
    }

    if (opts.venueName && f.venueName === opts.venueName) {
      venue.played++
      if (ours > theirs) venue.wins++
      else if (ours < theirs) venue.losses++
      else venue.draws++
    }
  }

  const n = ordered.length
  const topScore = [...scoreTally.entries()].sort(
    // Count first; on a tie the lower-scoring line wins, so a run of 1-0s beats
    // a coincidence of 4-3s and the "usual" scoreline reads as usual.
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )[0]

  return {
    meetings: n,
    wins,
    draws,
    losses,
    goalsFor,
    goalsAgainst,
    avgGoals: n === 0 ? 0 : Math.round(((goalsFor + goalsAgainst) / n) * 10) / 10,
    bothScored,
    commonScore: topScore ? { score: topScore[0], count: topScore[1] } : null,
    atVenue: opts.venueName && venue.played > 0 ? venue : null,
    decidedAfterHt,
    decidedAfterHtOf,
    recent: ordered.slice(0, RECENT),
    span:
      n === 0
        ? null
        : { from: ordered[n - 1].date, to: ordered[0].date },
    competitions: [...compTally.values()].sort((a, b) => b.count - a.count),
    excluded,
  }
}
