// =============================================================
// Prediction mode — the single declaration, mobile's copy.
// =============================================================
// The Expo app's counterpart to the web app's `lib/predictionMode.ts`, and it
// exists for the same reason that one does: the union
// `'full_tournament' | 'progressive' | 'bracket_picker'` was written inline in
// dozens of files, EVERY one of them omitting `league_pickem` — a value the
// database has accepted since migration 023 and which 17 production pools now
// carry. So a league pool's mode was routinely cast into a union it is not a
// member of, which tells the compiler a league pool is a World Cup pool and
// then scores it like one.
//
// ⚠ DUPLICATED, NOT IMPORTED, and that is forced rather than chosen. `mobile/`
// is a separate npm project whose `@/*` resolves to `mobile/*`; it cannot reach
// the web app's `lib/`. The alternative — leaving every mobile file to write
// the union inline — is the exact inventory both files exist to end.
//
// ⚠ KEEP IN STEP WITH THREE THINGS, in this order of authority:
//   1. `pools_prediction_mode_check` in the database
//   2. the web app's `lib/predictionMode.ts`
//   3. this file
// If you widen the CHECK, widen all three in the same commit.
// =============================================================

/** Every value `pools.prediction_mode` can hold. */
export const PREDICTION_MODES = [
  'full_tournament',
  'progressive',
  'bracket_picker',
  'league_pickem',
] as const;

export type PredictionMode = (typeof PREDICTION_MODES)[number];

/**
 * The three World Cup bracket modes.
 *
 * A real distinction, not a convenience alias: the bracket picker, the podium
 * copy and the World Cup scoring tab genuinely cannot describe a league. Typing
 * them `BracketPredictionMode` makes passing a league pool to them a compile
 * error rather than a wrong answer on screen.
 */
export const BRACKET_PREDICTION_MODES = [
  'full_tournament',
  'progressive',
  'bracket_picker',
] as const;

export type BracketPredictionMode = (typeof BRACKET_PREDICTION_MODES)[number];

/**
 * Level 1 of the league structure (Decision 9).
 *
 * ⚠ A SEPARATE AXIS from `PredictionMode`, not an extension of it. EVERY league
 * pool is `prediction_mode = 'league_pickem'` — that is the column all the
 * league plumbing keys on — and this is what decides whether it is played by
 * picking fixtures, ordering the table, or surviving a week at a time.
 *
 * Nullable in the database and in practice: two production pools carry a season
 * id with a NULL mode, created before migration 077. Anything deciding whether
 * a pool IS a league must read `league_season_id`, never this.
 */
export const LEAGUE_MODES_LIST = [
  'pickem',
  'showdown',
  'last_man_standing',
  'table',
] as const;

export type LeagueMode = (typeof LEAGUE_MODES_LIST)[number];

/** Level 2, and only for the two modes that have weekly picks. */
export const LEAGUE_DEPTHS_LIST = ['results', 'scores'] as const;

export type LeagueDepth = (typeof LEAGUE_DEPTHS_LIST)[number];

export function isPredictionMode(value: unknown): value is PredictionMode {
  return typeof value === 'string' && (PREDICTION_MODES as readonly string[]).includes(value);
}

export function isBracketPredictionMode(value: unknown): value is BracketPredictionMode {
  return (
    typeof value === 'string' &&
    (BRACKET_PREDICTION_MODES as readonly string[]).includes(value)
  );
}

/** True for the one mode whose predictions live in `league_predictions`. */
export function isLeaguePredictionMode(mode: PredictionMode): boolean {
  return mode === 'league_pickem';
}
