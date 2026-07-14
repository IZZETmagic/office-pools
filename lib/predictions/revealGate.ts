// =============================================================
// Prediction reveal gate — WHICH of another member's predictions may be shown,
// and WHEN.
// =============================================================
// Feature: "members see all predictions after lock"
//   (drafts/2026-07-13_member_predictions_visibility.md).
//
// The one hard rule: a member must never see another member's picks for any
// scope they can still change themselves. A scope becomes revealable only once
// editing for it is closed POOL-WIDE:
//   * full_tournament / bracket_picker — the whole entry, once the pool's
//     prediction_deadline has passed (a single cutoff before match 1).
//   * progressive — per round, once that round is locked (state locked /
//     in_progress / complete, or its round deadline has passed). Earlier rounds
//     reveal while later rounds stay hidden.
//
// Pure functions only — no DB, no ambient clock. `now` is injected so the gate
// is deterministic and unit-testable, and callers own the clock.

export type PredictionMode = 'full_tournament' | 'progressive' | 'bracket_picker'

export interface RevealPool {
  prediction_mode: PredictionMode
  /** ISO timestamp, or null if the pool has no deadline set. */
  prediction_deadline: string | null
}

export interface RevealRoundState {
  round_key: string
  /** 'open' | 'locked' | 'in_progress' | 'complete' (or null). */
  state: string | null
  /** ISO timestamp, or null. */
  deadline: string | null
}

export type RevealResult =
  | { revealed: false }
  | { revealed: true; scope: 'all' }
  | { revealed: true; scope: 'rounds'; roundKeys: string[] }

// A progressive round's picks are immutable pool-wide once its state is one of
// these, or its deadline has passed. (DB pool_round_states.state vocabulary:
// 'open' | 'locked' | 'in_progress' | 'completed'.)
const LOCKED_ROUND_STATES = new Set(['locked', 'in_progress', 'completed'])

/**
 * Decide which of an entry's predictions are revealable to OTHER pool members
 * as of `now`. Do NOT call this for the entry's owner (or a pool admin) — those
 * callers may always read in full and should short-circuit before this gate.
 */
export function computeReveal(
  pool: RevealPool,
  roundStates: RevealRoundState[],
  now: Date,
): RevealResult {
  if (pool.prediction_mode === 'progressive') {
    const roundKeys = (roundStates ?? [])
      .filter((r) => isRoundLocked(r, now))
      .map((r) => r.round_key)
    return roundKeys.length > 0
      ? { revealed: true, scope: 'rounds', roundKeys }
      : { revealed: false }
  }

  // full_tournament & bracket_picker: single pool-wide deadline gate.
  return isDeadlinePassed(pool.prediction_deadline, now)
    ? { revealed: true, scope: 'all' }
    : { revealed: false }
}

/**
 * Filter score predictions to only those whose match sits in a revealed scope.
 * `matchStageById` maps prediction.match_id -> match stage, which equals the
 * progressive round_key. Scope 'all' passes everything through; not-revealed
 * yields nothing.
 */
export function filterRevealedPredictions<T extends { match_id: string }>(
  predictions: T[],
  reveal: RevealResult,
  matchStageById: Map<string, string>,
): T[] {
  if (!reveal.revealed) return []
  if (reveal.scope === 'all') return predictions
  const allowed = new Set(reveal.roundKeys)
  return predictions.filter((p) => allowed.has(matchStageById.get(p.match_id) ?? ''))
}

function isRoundLocked(round: RevealRoundState, now: Date): boolean {
  if (round.state && LOCKED_ROUND_STATES.has(round.state)) return true
  return isDeadlinePassed(round.deadline, now)
}

function isDeadlinePassed(deadline: string | null, now: Date): boolean {
  if (!deadline) return false
  const t = new Date(deadline).getTime()
  if (Number.isNaN(t)) return false
  return now.getTime() >= t
}
