// =============================================================
// The opponent dossier — how somebody picks, from picks already revealed
// =============================================================
// Everything here is derived from `league_predictions` and `league_match_scores`,
// both of which are already written on every pick and every settle. There is no
// provider call, no backfill and no new ingestion behind any figure below —
// which is why this is the cheapest half of scouting and the half nobody else
// has.
//
// ⚠ IT REPORTS WHAT HAPPENED. IT NEVER FORECASTS. The same numbers can be
// written as a tip sheet — "back the home side", "value on the draw" — and this
// product is explicitly not for bettors. "Predicts a draw in 6% of games; 25%
// end level" is the same fact told as what somebody has done rather than as
// what you should do about it.
//
// ⚠⚠ EVERY BASELINE IS MEASURED, NEVER CONSTANT. "The league averages 2.8
// goals" is computed from the same fixtures the picks are counted over, not
// hardcoded. A literal would be wrong for La Liga, wrong for Serie A, and
// silently wrong for the Premier League the moment a season ran high or low —
// and the comparison is the entire point of the section it sits in.
//
// ⚠ ONLY REVEALED PICKS MAY BE COUNTED. A dossier assembled over a matchweek
// that has not reached its lock leaks live picks, which is the whole thing the
// weekly reveal and the sealed Showdown draw exist to prevent. This module
// counts whatever it is handed; the CALLER owns that filter, and
// `readOpponentPicks` is the only sanctioned way to build the input.
//
// ⚠ PURE: no client, no DB, no network, no react-native. The route reads; this
// counts. Keeps it inside the root vitest runner's reach.
// =============================================================

/** A club, as much of one as a dossier needs. */
export type ClubRef = {
  clubId: string
  name: string
  abbreviation: string
  /**
   * ⚠ NULLABLE, AND EVERY CONSUMER MUST DRAW WITHOUT IT. `league_clubs.crest_url`
   * is nullable in the schema and the importer fills it from the provider, so a
   * club can arrive without one — and a row that reserves space for a crest it
   * never gets is a hole beside a name.
   */
  crestUrl: string | null
}

/** The four buckets `league_match_scores.score_type` is constrained to. */
export type ScoreType = 'exact' | 'winner_gd' | 'winner' | 'miss'

/**
 * One revealed pick, with the fixture it was made on.
 *
 * ⚠ `actualHome` / `actualAway` ARE NULL FOR AN UNPLAYED FIXTURE, and a pick on
 * one still counts towards tendency (what they predict) while counting towards
 * nothing that needs a result (whether they were right). The two are separated
 * everywhere below rather than filtered once at the top, because a member who
 * has picked ahead would otherwise have their tendencies computed over a
 * smaller sample than the one the screen claims.
 */
export type PickRow = {
  entry: string
  fixtureId: string
  matchweek: number
  kickoffAt: string
  predictedHome: number
  predictedAway: number
  actualHome: number | null
  actualAway: number | null
  homeClub: ClubRef
  awayClub: ClubRef
  /** From `league_match_scores`. Null until the fixture has been scored. */
  scoreType: ScoreType | null
  points: number | null
}

/**
 * How many samples before a rate may be shown as a percentage.
 *
 * ⚠ THIS IS NOT `h2h.ts`'s `MIN_MEETINGS`, AND THE TWO ARE NOT IN CONFLICT.
 * That one decides whether the head-to-head TAB APPEARS AT ALL, measured
 * against how many meetings the provider actually holds for real Premier League
 * pairings. This one decides whether a number is written as "31%" or as "3 of
 * 8" — a smaller claim, made in more places. They answer different questions and
 * are deliberately separate constants.
 *
 * ⚠ BELOW THIS, EVERY RATE HELPER RETURNS NULL RATHER THAN A SMALL NUMBER.
 * "50% of the time" over two samples is a lie with a decimal point on it, and
 * this product's stated purpose is no bad feelings — a member who loses a pick
 * to a statistic we oversold is exactly that. Returning null forces the screen
 * to say the smaller, true thing instead.
 */
export const MIN_RATE_SAMPLE = 5

/** A rate that knows its own denominator, and refuses to exist without one. */
export type Rate = {
  count: number
  of: number
  /** Null below `MIN_RATE_SAMPLE`. The screen shows the fraction instead. */
  pct: number | null
}

export function rate(count: number, of: number): Rate {
  return {
    count,
    of,
    pct: of >= MIN_RATE_SAMPLE ? Math.round((count / of) * 100) : null,
  }
}

/** How a member leans on one club, and whether it has worked. */
export type ClubLean = {
  club: ClubRef
  /** Games this club played that the member picked on. */
  seen: number
  /** Of those, times they picked this club to WIN. */
  backed: number
  /** Of those they backed, times the club actually won. ⚠ Played fixtures only. */
  backedRight: number
  /** Of those they backed and that have been played. The `backedRight` denominator. */
  backedPlayed: number
  /** Times they picked this club to LOSE. */
  opposed: number
  /** Split of `backed` by where the club was playing. */
  backedHome: Rate
  backedAway: Rate
}

/** What the league itself did over the same fixtures — the comparison baseline. */
export type LeagueBaseline = {
  /** Played fixtures the baseline is measured over. */
  played: number
  goalsPerGame: number | null
  drawRate: Rate
  homeWinRate: Rate
}

export type Fingerprint = {
  /**
   * The scoreline they use most, written home–away.
   *
   * ⚠ ITS SHARE IS A `Rate`, NOT A BARE COUNT PAIR. The phone renders a
   * percentage wherever one exists and the fraction otherwise, and it must not
   * carry its own copy of the floor to decide which — the gate travels with the
   * answer, the same call `MIN_MEETINGS` makes on the head-to-head route.
   */
  signature: { score: string; share: Rate } | null
  /** Their goals per prediction, against what the league actually produced. */
  goalsPerPrediction: number | null
  theirDrawRate: Rate
  theirHomeWinRate: Rate
  /** ⚠ A stated absence is a finding. Most members have never predicted 0–0. */
  hasPredictedNil: boolean
}

export type Reliability = {
  /** Picks they made, of fixtures that were open to them. */
  made: number
  available: number
  missed: number
};

export type OpponentDossier = {
  entry: string
  picks: number
  /** Picks on fixtures that have been scored. The denominator for accuracy. */
  scored: number

  hitRate: Rate
  exactCount: number
  pointsPerFixture: number | null
  /** Matchweek totals, OLDEST FIRST. ⚠ Ordered by kickoff, never by number. */
  form: { matchweek: number; points: number }[]

  mostBacked: ClubLean | null
  mostOpposed: ClubLean | null
  /** The club they back most and are most often wrong about. The best line here. */
  blindSpot: ClubLean | null

  baseline: LeagueBaseline
  fingerprint: Fingerprint
  reliability: Reliability | null

  /** Null when no crowd data was supplied. */
  contrarian: { against: Rate; andRight: Rate } | null

  /**
   * The one-line verdict, composed from the numbers above.
   *
   * ⚠⚠ COMPOSED ON THE SERVER AND SENT AS A STRING, ON PURPOSE. The alternative
   * was the `duelRecord.ts` mirror pattern — a byte-compared copy in
   * `mobile/lib/` with a guard test — and it is the wrong tool for a sentence.
   * A mirror keeps two implementations honest; one owner means there is only
   * ever one. This is the same call `MIN_MEETINGS` makes by travelling with the
   * head-to-head answer rather than being re-declared on the phone.
   *
   * ⚠ DETERMINISTIC. A lookup over thresholds, never a language model: the same
   * dossier must produce the same sentence every time it is read, or a member
   * screenshots one verdict into Banter and the next tap shows another.
   */
  read: string
}

/** Who a prediction says will win. Null is a predicted draw. */
function predictedWinner(p: PickRow): 'home' | 'away' | null {
  if (p.predictedHome > p.predictedAway) return 'home'
  if (p.predictedHome < p.predictedAway) return 'away'
  return null
}

/** Who actually won. Null is a draw; undefined means it has not been played. */
function actualWinner(p: PickRow): 'home' | 'away' | null | undefined {
  if (p.actualHome === null || p.actualAway === null) return undefined
  if (p.actualHome > p.actualAway) return 'home'
  if (p.actualHome < p.actualAway) return 'away'
  return null
}

/**
 * Reduce one member's revealed picks to the dossier.
 *
 * @param picks     every revealed pick by ONE entry. Mixed entries are a caller
 *                  bug and are not defended against — the aggregate would be
 *                  meaningless rather than merely wrong, so it would not be
 *                  caught by looking at it.
 * @param opts.available  fixtures that were open to this entry, for the missed-
 *                  pick count. Omit it and `reliability` is null rather than
 *                  reading zero, because "missed none" and "we did not look" are
 *                  different claims and a 0 renders identically to the true one.
 * @param opts.crowdMajority  fixture id → what the PLATFORM mostly picked.
 *                  ⚠ PLATFORM-WIDE, NEVER POOL-SCOPED. A crowd figure computed
 *                  inside one pool leaks that pool's picks through the back door
 *                  of an aggregate; in a six-member pool an aggregate is not an
 *                  aggregate. See the route.
 */
export function buildOpponentDossier(
  picks: PickRow[],
  opts: {
    available?: number
    crowdMajority?: Map<string, 'home' | 'away' | null>
  } = {},
): OpponentDossier {
  const entry = picks[0]?.entry ?? ''

  // ⚠ BY KICKOFF, NOT BY MATCHWEEK NUMBER. Rounds are played out of numerical
  // order — migration 101 measured a minimum gap of minus 121 days across three
  // real seasons — so a form strip sorted by number shows results in an order
  // they never happened in. `duelRecord.ts` carries the same warning for the
  // same reason.
  const ordered = [...picks].sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt))
  const played = ordered.filter((p) => actualWinner(p) !== undefined)
  const scoredRows = ordered.filter((p) => p.scoreType !== null)

  // ---- accuracy ------------------------------------------------------------
  const hits = scoredRows.filter((p) => p.scoreType !== 'miss').length
  const exact = scoredRows.filter((p) => p.scoreType === 'exact').length
  const pointsTotal = scoredRows.reduce((s, p) => s + (p.points ?? 0), 0)

  // ---- form, by matchweek, in kickoff order --------------------------------
  const weekPoints = new Map<number, number>()
  const weekFirstKickoff = new Map<number, string>()
  for (const p of scoredRows) {
    weekPoints.set(p.matchweek, (weekPoints.get(p.matchweek) ?? 0) + (p.points ?? 0))
    const seen = weekFirstKickoff.get(p.matchweek)
    if (!seen || p.kickoffAt < seen) weekFirstKickoff.set(p.matchweek, p.kickoffAt)
  }
  const form = [...weekPoints.entries()]
    .sort((a, b) =>
      (weekFirstKickoff.get(a[0]) ?? '').localeCompare(weekFirstKickoff.get(b[0]) ?? ''),
    )
    .map(([matchweek, points]) => ({ matchweek, points }))

  // ---- club lean -----------------------------------------------------------
  const leans = buildClubLeans(ordered)

  // ---- the league's own numbers, over the same fixtures ---------------------
  // ⚠ DE-DUPLICATED BY FIXTURE. A member picks each fixture once so this is
  // usually a no-op, but the baseline must describe the LEAGUE rather than this
  // member's pick count, and a caller handing in two pools' worth of the same
  // person's picks would otherwise double every game.
  const uniquePlayed = new Map<string, PickRow>()
  for (const p of played) if (!uniquePlayed.has(p.fixtureId)) uniquePlayed.set(p.fixtureId, p)
  const leagueGames = [...uniquePlayed.values()]

  const leagueGoals = leagueGames.reduce(
    (s, p) => s + (p.actualHome ?? 0) + (p.actualAway ?? 0), 0,
  )
  const leagueDraws = leagueGames.filter((p) => actualWinner(p) === null).length
  const leagueHomeWins = leagueGames.filter((p) => actualWinner(p) === 'home').length

  const baseline: LeagueBaseline = {
    played: leagueGames.length,
    goalsPerGame:
      leagueGames.length === 0
        ? null
        : Math.round((leagueGoals / leagueGames.length) * 10) / 10,
    drawRate: rate(leagueDraws, leagueGames.length),
    homeWinRate: rate(leagueHomeWins, leagueGames.length),
  }

  // ---- fingerprint ---------------------------------------------------------
  const scoreTally = new Map<string, number>()
  for (const p of ordered) {
    const key = `${p.predictedHome}-${p.predictedAway}`
    scoreTally.set(key, (scoreTally.get(key) ?? 0) + 1)
  }
  const topScore = [...scoreTally.entries()].sort(
    // Count first; on a tie the lower-scoring line wins, so a run of 1–0s beats
    // a coincidence of 4–3s and the "usual" scoreline reads as usual. Same
    // tiebreak as `summariseH2H`, deliberately.
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )[0]

  const predictedGoals = ordered.reduce((s, p) => s + p.predictedHome + p.predictedAway, 0)
  const theirDraws = ordered.filter((p) => predictedWinner(p) === null).length
  const theirHomeWins = ordered.filter((p) => predictedWinner(p) === 'home').length

  const fingerprint: Fingerprint = {
    signature: topScore
      ? { score: topScore[0].replace('-', '–'), share: rate(topScore[1], ordered.length) }
      : null,
    goalsPerPrediction:
      ordered.length === 0 ? null : Math.round((predictedGoals / ordered.length) * 10) / 10,
    theirDrawRate: rate(theirDraws, ordered.length),
    theirHomeWinRate: rate(theirHomeWins, ordered.length),
    hasPredictedNil: ordered.some((p) => p.predictedHome === 0 && p.predictedAway === 0),
  }

  // ---- contrarian ----------------------------------------------------------
  let contrarian: OpponentDossier['contrarian'] = null
  if (opts.crowdMajority && opts.crowdMajority.size > 0) {
    const withCrowd = ordered.filter((p) => opts.crowdMajority!.has(p.fixtureId))
    const against = withCrowd.filter(
      (p) => predictedWinner(p) !== opts.crowdMajority!.get(p.fixtureId),
    )
    // ⚠ THE SECOND RATE'S DENOMINATOR IS THE FIRST'S NUMERATOR, not the whole
    // sample. "Right 38% of the time" means right when they broke from the
    // crowd — over all picks it would be a differently-shaped number wearing the
    // same label, and the two are easy to swap by accident.
    const againstPlayed = against.filter((p) => actualWinner(p) !== undefined)
    const againstRight = againstPlayed.filter((p) => predictedWinner(p) === actualWinner(p))
    contrarian = {
      against: rate(against.length, withCrowd.length),
      andRight: rate(againstRight.length, againstPlayed.length),
    }
  }

  const draft: OpponentDossier = {
    entry,
    picks: ordered.length,
    scored: scoredRows.length,
    hitRate: rate(hits, scoredRows.length),
    exactCount: exact,
    pointsPerFixture:
      scoredRows.length === 0
        ? null
        : Math.round((pointsTotal / scoredRows.length) * 10) / 10,
    form,
    mostBacked: pickMostBacked(leans),
    mostOpposed: pickMostOpposed(leans),
    blindSpot: pickBlindSpot(leans),
    baseline,
    fingerprint,
    reliability:
      opts.available === undefined
        ? null
        : {
            made: ordered.length,
            available: opts.available,
            missed: Math.max(0, opts.available - ordered.length),
          },
    contrarian,
    read: '',
  }

  // ⚠ COMPOSED FROM THE FINISHED OBJECT, not alongside it. Every clause reads a
  // field above, so building it here means the sentence can never describe a
  // number the caller is not also being shown.
  return { ...draft, read: describeDossier(draft) }
}

/** Every club this member has had an opinion about, with how it went. */
export function buildClubLeans(picks: PickRow[]): ClubLean[] {
  const byClub = new Map<string, ClubLean & { backedHomeOf: number; backedAwayOf: number }>()

  const ensure = (club: ClubRef) => {
    let l = byClub.get(club.clubId)
    if (!l) {
      l = {
        club,
        seen: 0,
        backed: 0,
        backedRight: 0,
        backedPlayed: 0,
        opposed: 0,
        backedHome: rate(0, 0),
        backedAway: rate(0, 0),
        backedHomeOf: 0,
        backedAwayOf: 0,
      }
      byClub.set(club.clubId, l)
    }
    return l
  }

  for (const p of picks) {
    const winner = predictedWinner(p)
    const actual = actualWinner(p)

    for (const side of ['home', 'away'] as const) {
      const club = side === 'home' ? p.homeClub : p.awayClub
      const l = ensure(club)
      l.seen++

      // ⚠ THE VENUE DENOMINATOR IS EVERY APPEARANCE AT THAT VENUE, not every
      // time they backed them there. "Backs Arsenal at home 9/9" is only a
      // finding because the 9 below the line is how often Arsenal played at
      // home in this sample — counting backed-over-backed would read 9/9 for
      // somebody who backed them once.
      if (side === 'home') l.backedHomeOf++
      else l.backedAwayOf++

      if (winner === side) {
        l.backed++
        if (side === 'home') l.backedHome.count++
        else l.backedAway.count++
        if (actual !== undefined) {
          l.backedPlayed++
          if (actual === side) l.backedRight++
        }
      } else if (winner !== null) {
        // ⚠ A PREDICTED DRAW IS NOT OPPOSITION. `winner !== null` is what keeps
        // "they think this ends level" out of a column that means "they think
        // this club loses" — the two are different opinions and only one of
        // them is about the club.
        l.opposed++
      }
    }
  }

  return [...byClub.values()].map((l) => ({
    club: l.club,
    seen: l.seen,
    backed: l.backed,
    backedRight: l.backedRight,
    backedPlayed: l.backedPlayed,
    opposed: l.opposed,
    backedHome: rate(l.backedHome.count, l.backedHomeOf),
    backedAway: rate(l.backedAway.count, l.backedAwayOf),
  }))
}

/**
 * The club they back most — by SHARE of that club's games, not by raw count.
 *
 * ⚠ A COUNT WOULD JUST NAME WHOEVER PLAYED MOST. Every club plays the same
 * number of league games over a season, but a dossier is read in matchweek six
 * over a partial sample where they do not, and mid-season a member who has seen
 * one club eight times and another four would have the first named however
 * lukewarm they were about it. The floor keeps a 1-of-1 out of the answer.
 */
function pickMostBacked(leans: ClubLean[]): ClubLean | null {
  const eligible = leans.filter((l) => l.seen >= MIN_RATE_SAMPLE && l.backed > 0)
  if (eligible.length === 0) return null
  return eligible.reduce((a, b) =>
    b.backed / b.seen > a.backed / a.seen ||
    (b.backed / b.seen === a.backed / a.seen && b.backed > a.backed)
      ? b
      : a,
  )
}

function pickMostOpposed(leans: ClubLean[]): ClubLean | null {
  const eligible = leans.filter((l) => l.seen >= MIN_RATE_SAMPLE && l.opposed > 0)
  if (eligible.length === 0) return null
  return eligible.reduce((a, b) =>
    b.opposed / b.seen > a.opposed / a.seen ||
    (b.opposed / b.seen === a.opposed / a.seen && b.opposed > a.opposed)
      ? b
      : a,
  )
}

/**
 * The club they keep backing and keep getting wrong.
 *
 * ⚠ IT NEEDS BOTH HALVES, AND THE CONVICTION HALF COMES FIRST. A club backed
 * once and lost once is 0% right and would top any list sorted on accuracy
 * alone — but it is not a blind spot, it is a coin landing badly. The candidate
 * must have been backed enough times to be a habit before being wrong about it
 * means anything.
 *
 * ⚠ AND IT IS MEASURED OVER PLAYED FIXTURES ONLY. Backing a club for next
 * Saturday cannot yet be wrong, and letting an unplayed pick into the
 * denominator would make every member look worse the further ahead they picked.
 */
function pickBlindSpot(leans: ClubLean[]): ClubLean | null {
  const eligible = leans.filter(
    (l) => l.backedPlayed >= MIN_RATE_SAMPLE && l.backedRight / l.backedPlayed < 0.5,
  )
  if (eligible.length === 0) return null
  return eligible.reduce((a, b) =>
    b.backedRight / b.backedPlayed < a.backedRight / a.backedPlayed ? b : a,
  )
}

/**
 * The one-line verdict — a lookup over thresholds, never a language model.
 *
 * ⚠⚠ EVERY CLAUSE IS RELATIVE TO THE MEASURED BASELINE, not to a constant. "A
 * high-scoring optimist" means high FOR THIS LEAGUE, THIS SEASON. Serie A and
 * the Championship do not produce goals at the same rate, and a hardcoded 2.8
 * would call the same member an optimist in one and a pessimist in the other
 * without either of them changing a thing.
 *
 * ⚠ IT REFUSES TO SPEAK OVER A THIN SAMPLE. Below the rate floor every clause
 * is null and the fallback sentence says so plainly, because the alternative is
 * a confident character sketch of somebody who has picked four games. That is
 * the same rule the rates themselves follow, applied to prose.
 *
 * ⚠ AND IT DESCRIBES, IT NEVER ADVISES. "Backs the home side" is an observation
 * about them. "Fade the home side" would be a tip, which is the line this whole
 * module is built not to cross.
 */
export function describeDossier(d: OpponentDossier): string {
  const clauses: string[] = []

  // ---- temperament, against what the league actually produced ---------------
  const theirs = d.fingerprint.goalsPerPrediction
  const league = d.baseline.goalsPerGame
  if (theirs !== null && league !== null && d.baseline.played >= MIN_RATE_SAMPLE) {
    // A fifth of a goal per game is roughly where the difference stops being
    // rounding and starts being a habit — half a goal across a matchweek.
    if (theirs - league >= 0.2) clauses.push('A high-scoring optimist')
    else if (league - theirs >= 0.2) clauses.push('A cautious, low-scoring picker')
  }

  // ---- home lean ------------------------------------------------------------
  const theirHome = d.fingerprint.theirHomeWinRate.pct
  const realHome = d.baseline.homeWinRate.pct
  if (theirHome !== null && realHome !== null && theirHome - realHome >= 10) {
    clauses.push(clauses.length ? 'backs the home side' : 'Backs the home side')
  } else if (theirHome !== null && realHome !== null && realHome - theirHome >= 10) {
    clauses.push(clauses.length ? 'distrusts home advantage' : 'Distrusts home advantage')
  }

  // ---- the draw -------------------------------------------------------------
  // ⚠⚠ TWO CLAUSES, BECAUSE THE GAP AND THE ABSOLUTE ARE DIFFERENT CLAIMS.
  //
  // This originally fired one sentence — "almost never calls a draw" — off the
  // GAP alone, and it read as a lie on the first real dossier: a member calling
  // draws 25% of the time against a league running 45% cleared the threshold and
  // was told they almost never call one. Twenty-five percent is not "almost
  // never" whatever reality is doing beside it, and the card two inches below
  // printed the 25% in full.
  //
  // So the strong wording now needs a genuinely low ABSOLUTE, and the gap alone
  // gets the weaker, accurate sentence.
  const theirDraw = d.fingerprint.theirDrawRate.pct
  const realDraw = d.baseline.drawRate.pct
  if (theirDraw !== null && realDraw !== null && realDraw - theirDraw >= 12) {
    const wording =
      theirDraw <= 10 ? 'almost never calls a draw' : 'under-calls the draw'
    clauses.push(clauses.length ? wording : capitalise(wording))
  } else if (theirDraw !== null && realDraw !== null && theirDraw - realDraw >= 12) {
    // ⚠ THE OTHER DIRECTION EXISTS AND WAS MISSING. Somebody who calls draws far
    // MORE than the league produces is just as readable a habit, and saying
    // nothing about them made the sentence quietly one-sided.
    const wording = 'sees draws everywhere'
    clauses.push(clauses.length ? wording : capitalise(wording))
  }

  // ---- the blind spot, always last ------------------------------------------
  // ⚠ IT IS PHRASED AS A PROBLEM WITH A CLUB, NOT WITH A PERSON. "Has an Arsenal
  // problem" is a fact about football that happens to be about them; "keeps
  // getting Arsenal wrong" is a fact about them that happens to involve
  // football. In a product whose stated purpose is no bad feelings, and whose
  // banter is public, that distinction is the whole difference.
  if (d.blindSpot) {
    const name = d.blindSpot.club.name
    clauses.push(clauses.length ? `and has ${aOrAn(name)} problem` : `Has ${aOrAn(name)} problem`)
  }

  if (clauses.length === 0) {
    // ⚠ A STATED ABSENCE, NOT A BLANK. "Nothing to say yet" reads as news; an
    // empty card reads as broken, which is the same call `matchTabs` makes about
    // a tab that never has anything in it.
    return d.picks === 0
      ? 'No revealed picks yet — nothing to read.'
      : 'Too few revealed picks to read a pattern yet.'
  }

  return `${clauses.join(', ').replace(/, (and )/, ' $1')}.`
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** "an Arsenal", "a Chelsea". Crude, and right for every club name we carry. */
function aOrAn(name: string): string {
  return /^[AEIOU]/i.test(name) ? `an ${name}` : `a ${name}`
}
