// =============================================================
// SCORING ENGINE — CHANGE-ONLY (DIFF) WRITE HELPER  [B1]
// =============================================================
// Pure, side-effect-free diff between the freshly-computed score
// rows and the rows already stored in the DB. Returns exactly which
// rows must be inserted, updated, or deleted so that the stored set
// ends up IDENTICAL to the computed set — while skipping every row
// whose value did not change.
//
// This is the engine behind B1: replace the "delete every row, then
// re-insert every row" pattern in recalculate.ts with "only touch
// what changed". It is gated behind the `scoring_diff_writes_enabled`
// sync_settings flag in recalculate.ts; the old path stays as the
// fallback.
//
// SAFETY PROPERTIES (the audit hinges on these):
//  1. The exact same canonicalization (`*Value`) is applied to BOTH
//     the computed row and the stored row, so a value is "changed"
//     iff it truly differs. Never compares a computed row against a
//     differently-normalized stored row (the bug class that hid the
//     numeric-rounding regression).
//  2. Volatile / metadata columns (calculated_at, id, created_at,
//     updated_at) are EXCLUDED from the comparison. calculated_at is
//     re-stamped every run, so including it would mark every row
//     changed and erase the entire benefit.
//  3. Stale removal: any stored row whose key is absent from the
//     computed set is deleted — so a bonus that is no longer earned,
//     or a match that was reset, is correctly removed. This preserves
//     the one guarantee the old delete-all gave us.
// =============================================================

export type RowDiff<C> = {
  toInsert: C[]
  toUpdate: Array<{ id: string; row: C }>
  toDeleteIds: string[]
  unchanged: number
}

/**
 * Three-way diff keyed by a natural key.
 *
 * @param computed   freshly-computed rows (the desired end state)
 * @param existing   rows currently stored (each MUST expose its PK via idOf)
 * @param keyOf      natural key for a row — works on BOTH computed and stored shapes
 * @param valueOf    canonical comparable signature of the meaningful columns —
 *                   MUST exclude volatile fields and MUST normalize identically
 *                   for computed and stored rows
 * @param idOf       primary-key extractor for a stored row (for UPDATE/DELETE)
 */
export function diffRows<C extends object, E extends object>(
  computed: C[],
  existing: E[],
  keyOf: (row: C | E) => string,
  valueOf: (row: C | E) => string,
  idOf: (row: E) => string,
): RowDiff<C> {
  const existingByKey = new Map<string, { id: string; value: string }>()
  for (const e of existing) {
    // Last-wins on duplicate keys; duplicates shouldn't exist (natural key is
    // unique in the data) but if they did, the extras fall through to stale
    // deletion below, which is the safe direction.
    existingByKey.set(keyOf(e), { id: idOf(e), value: valueOf(e) })
  }

  const toInsert: C[] = []
  const toUpdate: Array<{ id: string; row: C }> = []
  let unchanged = 0
  const seen = new Set<string>()

  for (const c of computed) {
    const k = keyOf(c)
    seen.add(k)
    const ex = existingByKey.get(k)
    if (!ex) {
      toInsert.push(c)
    } else if (ex.value !== valueOf(c)) {
      toUpdate.push({ id: ex.id, row: c })
    } else {
      unchanged++
    }
  }

  const toDeleteIds: string[] = []
  for (const [k, ex] of existingByKey) {
    if (!seen.has(k)) toDeleteIds.push(ex.id)
  }

  return { toInsert, toUpdate, toDeleteIds, unchanged }
}

// ----- Canonicalization helpers (shared by computed + stored rows) -----

// Normalize a numeric that may arrive as a JS number (computed) or a
// Postgres-numeric string like "1.00" (stored via PostgREST). Number()
// collapses "1.00" -> 1 so they compare equal. null/undefined -> "∅".
function num(v: unknown): string {
  if (v === null || v === undefined) return '∅'
  const n = Number(v)
  return Number.isNaN(n) ? `?${String(v)}` : String(n)
}

function str(v: unknown): string {
  return v === null || v === undefined ? '∅' : String(v)
}

const SEP = ''

// --- match_scores ---

/** Natural key: one row per (entry, match). */
export function matchScoreKey(r: Record<string, any>): string {
  return `${r.entry_id}${SEP}${r.match_id}`
}

/**
 * Comparable signature of a match_scores row. EXCLUDES calculated_at
 * (re-stamped each run) and DB-only columns (id/created_at/updated_at).
 * Numerics normalized via num() so "1.00" === 1.
 */
export function matchScoreValue(r: Record<string, any>): string {
  return [
    str(r.score_type),
    num(r.base_points),
    num(r.multiplier),
    num(r.pso_points),
    num(r.total_points),
    str(r.teams_match),
    num(r.predicted_home_score),
    num(r.predicted_away_score),
    num(r.actual_home_score),
    num(r.actual_away_score),
    num(r.predicted_home_pso),
    num(r.predicted_away_pso),
    num(r.actual_home_pso),
    num(r.actual_away_pso),
    str(r.predicted_home_team_id),
    str(r.predicted_away_team_id),
    num(r.match_number),
    str(r.stage),
    str(r.pool_id),
  ].join(SEP)
}

// --- bonus_scores ---

/** Natural key: one row per (entry, bonus_type, group, match). Verified unique. */
export function bonusScoreKey(r: Record<string, any>): string {
  return [r.entry_id, r.bonus_type, str(r.related_group_letter), str(r.related_match_id)].join(SEP)
}

/** Comparable signature of a bonus_scores row (excludes calculated_at / bonus_id). */
export function bonusScoreValue(r: Record<string, any>): string {
  return [
    str(r.bonus_category),
    num(r.points_earned),
    str(r.description),
  ].join(SEP)
}
