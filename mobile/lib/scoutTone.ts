// =============================================================
// The scout report's colour grammar — as a vocabulary, not as colours
// =============================================================
// Pure logic, no theme and no JSX, so it can be unit-tested and so the KIT is
// the only place in scouting that knows what a colour is. Same shape as
// `matchStatus.ts` → `MatchStatusBadge`: the role vocabulary lives here where a
// test can reach it, the hex lives in the component.
//
// ## ⚠⚠ WHY THIS EXISTS: FIVE MEANINGS PER COLOUR, COUNTED
//
// Scouting shipped across three surfaces written separately, and each colour
// choice was locally reasonable. Counted across `MatchScoutSheet`, `ScoutingTab`
// and `Dossier` before this file:
//
//   gold   — the drought line, signature figures, the AWAY CLUB in the crowd
//            bar, the reality mark on a comparison, and the exact-score count
//   green  — a win, the HOME CLUB's wins in the pairing bar, every player
//            rating pill regardless of the rating, and "and right"
//   red    — a loss, the AWAY CLUB's wins in the pairing bar, the blind spot,
//            missed picks, and the crowd card's PRIVACY NOTE
//
// So in the pairing bar green meant Arsenal and red meant Chelsea — a value
// judgement the card is explicitly not making — and one scroll later gold had
// stopped being "the finding" and become Chelsea. Red was carrying a privacy
// reassurance in the same sheet that used red for a defeat.
//
// The rule this file enforces: A COLOUR MEANS EXACTLY ONE THING. If a card needs
// a sixth meaning it does not get a colour, it gets a label.
// =============================================================

/**
 * Every job a colour is allowed to do in a scout report.
 *
 * ⚠ THE NAMES ARE THE POINT. A component takes a tone, never a hex, so a reader
 * of the component sees the MEANING and the guard test can prove no scouting
 * file outside the kit reaches for `theme.colors` directly.
 */
export type ScoutTone =
  // ---- outcome: the football happened, and this is how it went -------------
  | 'win'
  | 'draw'
  | 'loss'
  // ---- side: which of the two clubs. One encoding, every split, everywhere --
  | 'home'
  | 'level'
  | 'away'
  // ---- emphasis: how to read it, not what it says --------------------------
  /** The one line on this card worth reading aloud. At most one per card. */
  | 'finding'
  /** The sample is thin. A caveat, and never also a statistic. */
  | 'caveat'
  // ---- comparison: the subject against what actually happens ---------------
  /** Whoever the report is about — their number, their bar. */
  | 'subject'
  /** What the league actually did. The mark the subject is measured against. */
  | 'reality'
  // ---- everything else -----------------------------------------------------
  | 'neutral';

/**
 * Below this many observations a rate must not be written as a percentage.
 *
 * ⚠ THE SAME FIVE AS `MIN_RATE_SAMPLE` IN `lib/scouting/opponent.ts`, and not by
 * coincidence — it is the point below which a percentage stops being supportable.
 * It is restated rather than imported because `lib/scouting` is web-side and this
 * runs on the phone; `MatchScoutSheet` already carried this constant privately
 * with a comment saying so.
 *
 * ⚠ THIS IS NOT `h2h.ts`'s `MIN_MEETINGS`. That one decides whether a whole TAB
 * is worth offering. This one decides whether a number may wear a percent sign.
 * Conflating them once emptied the club-bias card entirely.
 */
export const THIN_SAMPLE = 5;

/**
 * Whether a sample is too thin to carry a percentage.
 *
 * ⚠ THIN DOES NOT MEAN HIDDEN. Ryan, 2026-09-11: say the sample is thin and show
 * the numbers anyway. A fraction over a stated caveat is information; withholding
 * it was paternalism. What this gates is the PERCENT SIGN, not the figure.
 */
export function isThinSample(n: number): boolean {
  return n < THIN_SAMPLE;
}

/**
 * How a past meeting went, from the scoreline AS PLAYED.
 *
 * ⚠ WHOSE WIN IT WAS DEPENDS ON WHO WAS HOME THAT DAY, which is not necessarily
 * this fixture's home club — clubs swap ends between meetings. The tone follows
 * the scoreline as printed, so it can never disagree with the numbers beside it.
 */
export function outcomeTone(homeGoals: number, awayGoals: number): ScoutTone {
  if (homeGoals === awayGoals) return 'draw';
  return homeGoals > awayGoals ? 'win' : 'loss';
}

/** One segment of a three-way split, ready to draw. */
export type SplitShare = {
  tone: ScoutTone;
  /** Flex weight — the RAW COUNT, so the bar is exact whatever the labels round to. */
  flex: number;
  /** Whole percent, or null when nothing has happened at all. */
  pct: number | null;
};

/**
 * Home / draw / away, as shares of one whole.
 *
 * ## ⚠⚠ COUNTS IN, PERCENTAGES OUT, AND THE DIVISION HAPPENS ONCE
 *
 * Rounding three shares independently lets them total 99 or 101 and leaves a gap
 * in the bar. The flex weights are the raw counts, so the bar is exact whatever
 * the labels round to.
 *
 * ⚠ A SPLIT BAR IS ONLY HONEST WHERE THE PARTS REALLY ARE ONE WHOLE. Both users
 * of this qualify: every meeting is exactly one of won/drawn/lost, and every pick
 * is exactly one of home/draw/away. Do not reach for it on the stats tab, where
 * possession and shots are not shares of anything.
 *
 * ⚠ ALL-ZERO YIELDS NULL PERCENTAGES, NOT `NaN` OR A CONFIDENT 0%. A fixture
 * nobody has picked and a pairing never played are real states, and "0%" three
 * times is a claim about a denominator that does not exist.
 */
export function splitShares(home: number, draw: number, away: number): SplitShare[] {
  const total = home + draw + away;
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : null);
  return [
    { tone: 'home', flex: home, pct: pct(home) },
    { tone: 'level', flex: draw, pct: pct(draw) },
    { tone: 'away', flex: away, pct: pct(away) },
  ];
}

/**
 * A form-strip letter.
 *
 * ⚠ DECLARED HERE RATHER THAN IMPORTED FROM `api.ts`. It is structurally
 * identical to `ScoutFormOutcome` on the payload and assigns to it freely, but
 * this module is under `mobile/**` — vitest runs it in node with no access to
 * `mobile/node_modules`, so it may not import anything that reaches
 * `react-native`. A pure module that pulls in the API surface stops being
 * testable, and the failure is an unresolved import rather than anything useful.
 */
export type ScoutFormLetter = 'W' | 'D' | 'L';

/**
 * Form letters to tones.
 *
 * ⚠ THIS IS THE ONE PLACE `W`/`D`/`L` BECOMES A COLOUR, and it is the only place
 * in scouting where green means "good" — a result that happened, from the point
 * of view of the side being described. Everywhere else green is off limits.
 */
export function formTone(outcome: ScoutFormLetter): ScoutTone {
  return outcome === 'W' ? 'win' : outcome === 'D' ? 'draw' : 'loss';
}
