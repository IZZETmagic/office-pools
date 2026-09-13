import type { H2HSummary } from './h2h'
import type { MatchForm, FormOutcome } from './form'

// =============================================================
// The one line on the pairing card worth reading aloud
// =============================================================
// ## ⚠⚠ WHY THIS REPLACED THE DROUGHT LINE
//
// The card used to end with a hardcoded sentence: "Chelsea have not won at the
// Emirates since 2011." It fired whenever a club had visited three times without
// winning, which sounds like a hoodoo and is not one.
//
// Measured against production: an away win happens 33.1% of the time, so a club
// goes three visits without one **29.9% of the time by pure chance**. Roughly one
// pairing in three produced that sentence, and it was reporting a base rate as if
// it were a pattern — the exact overselling `h2h.ts` exists to avoid, with a
// dramatic sentence attached.
//
// It was also a fact about 2011 on a card whose job is a pick this weekend.
//
// ## HOW THIS WORKS
//
// A ranked list of candidates, each with a threshold chosen so the sentence only
// appears when it BEATS CHANCE. The first one that fires wins; if none do, the
// card shows no headline at all, which is the correct answer most of the time.
//
// ## ⚠ THE MEASURED BASE RATES THE THRESHOLDS ARE SET AGAINST
//
//   home win 39.1% · draw 27.8% · away win 33.1%
//   both teams scored 56.2% · average goals 3.00
//
// (169 played league fixtures, 2026-09-12. They match the historical norms for
// top-flight football, so they are a sound reference rather than a local quirk.)
//
// ## ⚠⚠ A THRESHOLD IS NOT A BASELINE, AND THIS FILE CLAIMS NEITHER
//
// The design note's rule — every baseline is MEASURED, never a constant — is
// about figures the screen COMPARES against: "the league averages 2.8" must be
// computed. Nothing here compares. The numbers below decide WHEN a sentence is
// worth showing; every sentence then states only what actually happened, with
// its own denominator. `GOALS_HIGH` is a trigger, not a claim.
//
// ## ⚠ IT REPORTS, IT NEVER FORECASTS
//
// "Arsenal have won the last four meetings" is a memory. "Arsenal are due" is a
// tip, and this product is explicitly not for bettors. Nothing here may acquire
// a verb about the future.
//
// ⚠ PURE: no client, no DB, no network. The route reads; this chooses.
// =============================================================

/** Which candidate fired. Kept on the payload for tests and for later telemetry. */
export type HeadlineKind =
  | 'never_won_here'
  | 'meeting_streak'
  | 'form_clash'
  | 'venue_streak'
  | 'drought'
  | 'both_scored'
  | 'goals_high'
  | 'goals_low'
  | 'common_score'
  | 'rare_pairing'

export type ScoutHeadline = {
  /**
   * The sentence, composed SERVER-SIDE.
   *
   * ⚠ THE PHONE MUST NOT COMPOSE ITS OWN. Same call `describeDossier` makes: one
   * owner is why web and RN cannot drift into two characterisations of one
   * fixture, and why a member who screenshots this sees what everybody sees.
   */
  text: string
  /**
   * Its denominator — "7 visits", "last 5 meetings".
   *
   * ⚠ NEVER OMITTED. "Not won here in 7 visits" and "in 3" are different claims
   * and the difference is invisible unless the line carries it.
   */
  note: string
  kind: HeadlineKind
}

// ---- thresholds, each with the chance of firing by luck ---------------------

/** Never won at this ground. 0.669^5 ≈ 13%. "Never" earns a lower floor. */
const NEVER_WON_VISITS = 5
/** Not won here since a year. 0.669^6 ≈ 9% — twice the old floor of three. */
const DROUGHT_VISITS = 6
/** One club winning N meetings in a row. ~36% a meeting, so 3 ≈ 5%. */
const MEETING_STREAK = 3
/** A club winning N straight at their own end. 0.391^4 ≈ 2%. */
const VENUE_WIN_STREAK = 4
/** A club LOSING N straight at the other end. 0.391^4 ≈ 2%. */
const VENUE_LOSS_STREAK = 4
/** Both scored in ≥80% of meetings, over at least this many. Base rate 56%. */
const BTS_MEETINGS = 8
const BTS_SHARE = 0.8
/** Goals per meeting worth remarking on either way. League runs 3.0. */
const GOALS_HIGH = 4
const GOALS_LOW = 2
const GOALS_MEETINGS = 6
/** One scoreline recurring. Needs both a count and a share. */
const SCORE_COUNT = 3
const SCORE_SHARE = 0.3
const SCORE_MEETINGS = 8
/** They have met, but barely, across a long span. */
const RARE_MAX_MEETINGS = 2
const RARE_MIN_YEARS = 5

export type HeadlineInput = {
  summary: H2HSummary
  /** ⚠ May be absent — a fixture can have history and no form, and vice versa. */
  form: MatchForm | null
  homeName: string
  awayName: string
  /** Which club is at home in THIS fixture, by the provider's id. */
  homeExternalId: number
  venue: string | null
}

/**
 * The strongest true thing about this fixture, or nothing.
 *
 * ⚠ NOTHING IS THE COMMON CASE AND IT IS NOT A FAILURE. Most fixtures have no
 * fact that beats chance, and a card with no gold line on it is the design
 * working — see the `Finding` component, which is allowed at most one a card and
 * expects to be absent.
 */
export function pickHeadline(input: HeadlineInput): ScoutHeadline | null {
  for (const candidate of CANDIDATES) {
    const hit = candidate(input)
    if (hit) return hit
  }
  return null
}

type Candidate = (i: HeadlineInput) => ScoutHeadline | null

/**
 * ⚠⚠ ORDER IS RARITY, AND IT IS THE WHOLE DESIGN. The first match wins, so a
 * fixture that qualifies for three candidates shows the least likely one. Moving
 * a row up here means claiming it is more remarkable than everything above it.
 */
const CANDIDATES: Candidate[] = [
  neverWonHere,
  meetingStreak,
  formClash,
  venueStreak,
  drought,
  bothScored,
  goalsExtreme,
  commonScore,
  rarePairing,
]

/** "Chelsea have never won at the Emirates." */
function neverWonHere(i: HeadlineInput): ScoutHeadline | null {
  const d = i.summary.venueDrought
  if (!d || d.lastWinYear !== null) return null
  if (d.visits < NEVER_WON_VISITS) return null

  const who = d.side === 'home' ? i.homeName : i.awayName
  return {
    text: `${who} have never won at ${ground(i)}.`,
    note: visits(d.visits),
    kind: 'never_won_here',
  }
}

/** "Arsenal have won the last four meetings." */
function meetingStreak(i: HeadlineInput): ScoutHeadline | null {
  // ⚠ `recent` IS MOST RECENT FIRST — see `H2HSummary`. The form strips are the
  // other way round, which is exactly the kind of thing that reverses a streak
  // silently, so neither is assumed.
  const run = leadingRun(i.summary.recent, (m) => {
    const homeWon = m.homeGoals > m.awayGoals
    const awayWon = m.awayGoals > m.homeGoals
    if (!homeWon && !awayWon) return null
    // ⚠ WHO WAS HOME THAT DAY IS NOT THIS FIXTURE'S HOME CLUB. The clubs swap
    // ends between meetings, so the winner is resolved by provider id.
    const winnerIsThisHome =
      (homeWon && m.homeExternalId === i.homeExternalId) ||
      (awayWon && m.awayExternalId === i.homeExternalId)
    return winnerIsThisHome ? 'home' : 'away'
  })

  if (!run || run.length < MEETING_STREAK) return null

  const who = run.value === 'home' ? i.homeName : i.awayName
  return {
    text: `${who} have won the last ${word(run.length)} meeting${run.length === 1 ? '' : 's'}.`,
    note: `of ${i.summary.meetings}`,
    kind: 'meeting_streak',
  }
}

/**
 * "Arsenal have won four straight at home. Chelsea have lost four straight away."
 *
 * ⚠ THE CARD'S ONLY FACT ABOUT NOW. Everything else on it is history — this is
 * the one candidate a member can act on this weekend, which is why it outranks
 * the drought it replaced.
 */
function formClash(i: HeadlineInput): ScoutHeadline | null {
  if (!i.form) return null
  const h = trailingRun(i.form.home.strip, 'W')
  const a = trailingRun(i.form.away.strip, 'L')
  if (h < VENUE_WIN_STREAK || a < VENUE_LOSS_STREAK) return null

  return {
    text:
      `${i.homeName} have won ${word(h)} straight at home. ` +
      `${i.awayName} have lost ${word(a)} straight away.`,
    note: 'this season',
    kind: 'form_clash',
  }
}

/** One side of the clash, when only one qualifies. */
function venueStreak(i: HeadlineInput): ScoutHeadline | null {
  if (!i.form) return null

  const h = trailingRun(i.form.home.strip, 'W')
  if (h >= VENUE_WIN_STREAK) {
    return {
      text: `${i.homeName} have won their last ${word(h)} at home.`,
      note: 'this season',
      kind: 'venue_streak',
    }
  }

  const a = trailingRun(i.form.away.strip, 'L')
  if (a >= VENUE_LOSS_STREAK) {
    return {
      text: `${i.awayName} have lost their last ${word(a)} away.`,
      note: 'this season',
      kind: 'venue_streak',
    }
  }

  return null
}

/** "Chelsea have not won at the Emirates since 2011." */
function drought(i: HeadlineInput): ScoutHeadline | null {
  const d = i.summary.venueDrought
  if (!d || d.lastWinYear === null) return null
  if (d.visits < DROUGHT_VISITS) return null

  const who = d.side === 'home' ? i.homeName : i.awayName
  return {
    text: `${who} have not won at ${ground(i)} since ${d.lastWinYear}.`,
    note: visits(d.visits),
    kind: 'drought',
  }
}

/** "Both teams have scored in nine of their last eleven meetings." */
function bothScored(i: HeadlineInput): ScoutHeadline | null {
  const { bothScored: b, meetings } = i.summary
  if (meetings < BTS_MEETINGS) return null
  if (b / meetings < BTS_SHARE) return null

  return {
    text: `Both teams have scored in ${word(b)} of their last ${word(meetings)} meetings.`,
    note: `${b} of ${meetings}`,
    kind: 'both_scored',
  }
}

/** "These two have averaged 4.1 goals a meeting." */
function goalsExtreme(i: HeadlineInput): ScoutHeadline | null {
  const { avgGoals, meetings } = i.summary
  if (meetings < GOALS_MEETINGS) return null
  if (avgGoals < GOALS_HIGH && avgGoals > GOALS_LOW) return null

  return {
    // ⚠ IT STATES THE FIGURE AND CLAIMS NOTHING ABOUT THE LEAGUE. The trigger
    // knows the league runs about 3.0; the sentence does not say so, because
    // that average is not computed here and an uncomputed comparison would be
    // the constant-baseline the design note forbids.
    text: `These two have averaged ${avgGoals.toFixed(1)} goals a meeting.`,
    note: `over ${meetings}`,
    kind: avgGoals >= GOALS_HIGH ? 'goals_high' : 'goals_low',
  }
}

/** "It has finished 2–1 in four of their eleven meetings." */
function commonScore(i: HeadlineInput): ScoutHeadline | null {
  const s = i.summary.commonScore
  const { meetings } = i.summary
  if (!s || meetings < SCORE_MEETINGS) return null
  if (s.count < SCORE_COUNT || s.count / meetings < SCORE_SHARE) return null

  return {
    text: `It has finished ${s.score.replace('-', '–')} in ${word(s.count)} of their ${word(meetings)} meetings.`,
    note: `${s.count} of ${meetings}`,
    kind: 'common_score',
  }
}

/** "These two have met twice in thirteen years." */
function rarePairing(i: HeadlineInput): ScoutHeadline | null {
  const { meetings, span } = i.summary
  if (meetings === 0 || meetings > RARE_MAX_MEETINGS || !span) return null

  const years = new Date(span.to).getFullYear() - new Date(span.from).getFullYear()
  if (years < RARE_MIN_YEARS) return null

  return {
    // ⚠ "ONCE" AND "TWICE", NOT "one" AND "two". English counts occasions
    // differently from things, and "have met two in fourteen years" is the kind
    // of sentence that makes a whole card look machine-written.
    text: `These two have met ${meetings === 1 ? 'once' : 'twice'} in ${word(years)} years.`,
    note: `${span.from.slice(0, 4)}–${span.to.slice(0, 4)}`,
    kind: 'rare_pairing',
  }
}

// ---- helpers ---------------------------------------------------------------

function ground(i: HeadlineInput): string {
  return i.venue ?? 'this ground'
}

function visits(n: number): string {
  return `${n} visit${n === 1 ? '' : 's'}`
}

/**
 * How many entries at the END of a strip share a value.
 *
 * ⚠ THE END, BECAUSE A FORM STRIP IS OLDEST FIRST. Reading it from the start
 * would report the run a club was on five games ago as if it were current — and
 * it would look entirely plausible.
 */
function trailingRun(strip: FormOutcome[], want: FormOutcome): number {
  let n = 0
  for (let k = strip.length - 1; k >= 0; k--) {
    if (strip[k] !== want) break
    n++
  }
  return n
}

/**
 * How many entries at the START of a list share a classification.
 *
 * ⚠ THE START, BECAUSE `recent` IS MOST RECENT FIRST — the opposite of a form
 * strip. A `null` from `classify` (a draw, here) ends the run rather than being
 * skipped: a club that won, drew, then won has not won two in a row.
 */
function leadingRun<T, V>(
  items: T[],
  classify: (item: T) => V | null,
): { value: V; length: number } | null {
  if (items.length === 0) return null
  const first = classify(items[0])
  if (first === null) return null

  let n = 1
  for (let k = 1; k < items.length; k++) {
    if (classify(items[k]) !== first) break
    n++
  }
  return { value: first, length: n }
}

/**
 * Small numbers as words.
 *
 * ⚠ A SENTENCE, NOT A TABLE. "won the last 4 meetings" reads as data; "won the
 * last four meetings" reads as something somebody said. The figures on the rest
 * of the card are numerals precisely because they ARE a table.
 */
const WORDS = [
  'no',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
]

function word(n: number): string {
  // ⚠ NUMERALS ABOVE TWELVE, DELIBERATELY. "Fourteen" is fine and "twenty-three"
  // is not — past a point the word is harder to read than the figure, and this
  // is a sentence, not a spelling exercise.
  return WORDS[n] ?? String(n)
}
