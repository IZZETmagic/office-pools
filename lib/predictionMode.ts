// =============================================================
// Prediction mode — the single declaration.
// =============================================================
// Before this file the union `'full_tournament' | 'progressive' | 'bracket_picker'`
// was declared FOUR times as an exported `PredictionMode` (lib/podium.ts,
// lib/poolModeInfo.ts, lib/predictions/revealGate.ts, and an iCloud duplicate),
// twice more as `PoolMode`, and written inline in 32 more files. Every one of
// those omitted `league_pickem` — a value the database has accepted since
// migration 023 and which one production pool actually carries. So a league
// pool's mode was routinely *cast* into a union it is not a member of, e.g.
//
//     pool.prediction_mode as 'full_tournament' | 'progressive'
//
// which tells the compiler a league pool is a World Cup pool and then scores it
// like one. That is the shape of every silent-wrongness bug in this codebase.
//
// One declaration here; everything else re-exports or imports it. The ESLint
// rules in eslint.config.mjs stop the inventory growing back.
// =============================================================

/**
 * Every value `pools.prediction_mode` can hold.
 *
 * Kept in step with `pools_prediction_mode_check` by hand — there is no
 * generated enum. If you widen the CHECK, widen this in the same commit.
 */
export const PREDICTION_MODES = [
  'full_tournament',
  'progressive',
  'bracket_picker',
  'league_pickem',
] as const

export type PredictionMode = (typeof PREDICTION_MODES)[number]

/**
 * The three World Cup bracket modes.
 *
 * A real distinction, not a convenience alias: the podium resolver, the bracket
 * resolver and the scoring-rules copy genuinely cannot describe a league. Typing
 * them `BracketPredictionMode` means passing a league pool to them is a compile
 * error rather than a wrong answer.
 */
export const BRACKET_PREDICTION_MODES = [
  'full_tournament',
  'progressive',
  'bracket_picker',
] as const

export type BracketPredictionMode = (typeof BRACKET_PREDICTION_MODES)[number]

export function isPredictionMode(value: unknown): value is PredictionMode {
  return typeof value === 'string' && (PREDICTION_MODES as readonly string[]).includes(value)
}

export function isBracketPredictionMode(value: unknown): value is BracketPredictionMode {
  return (
    typeof value === 'string' && (BRACKET_PREDICTION_MODES as readonly string[]).includes(value)
  )
}

/**
 * Narrow an untrusted string to a mode, or THROW.
 *
 * Deliberately not `?? 'full_tournament'`. The main consumer is the prediction
 * reveal gate, where `full_tournament` is the branch that reveals a member's
 * whole entry — so a silent default on an unrecognised mode leaks picks. An
 * unknown mode means the CHECK constraint and this file have drifted apart,
 * which is a bug to surface, not to absorb.
 */
export function parsePredictionMode(value: unknown): PredictionMode {
  if (!isPredictionMode(value)) {
    throw new Error(
      `Unrecognised prediction_mode: ${JSON.stringify(value)}. ` +
        `Expected one of ${PREDICTION_MODES.join(', ')}.`,
    )
  }
  return value
}

/** As `parsePredictionMode`, but also rejects a league pool. Throws. */
export function parseBracketPredictionMode(value: unknown): BracketPredictionMode {
  const mode = parsePredictionMode(value)
  if (!isBracketPredictionMode(mode)) {
    throw new Error(`${mode} is not a bracket mode — this code path cannot score a league.`)
  }
  return mode
}

/**
 * True for modes whose predictions are submitted round-by-round.
 *
 * Kept as an allow-list of the modes that DON'T use rounds would be the wrong
 * polarity — see `usesRounds` in lib/competitionRounds.ts, which owns the
 * behavioural version of this question. This is here only so callers that have
 * a bare mode string and no round context can ask it.
 */
export function isLeagueMode(mode: PredictionMode): boolean {
  return mode === 'league_pickem'
}
