// =============================================================
// DOES THIS MEMBER STILL OWE A PREDICTION?
// =============================================================
// One answer, four readers: the Pools tab card's footer pill, that tab's
// Pending / Submitted filter, its smart sort, and the Home tab's "pools needing
// predictions" count. They were already reading one flag — the bug was that the
// flag could only ever say one thing.
//
// ⚠ A LEAGUE POOL'S ANSWER COMES FROM THE SERVER, AND THE PHONE CANNOT DERIVE
// IT. `pool_entries.has_submitted_predictions` is a World Cup column and NO
// league flow writes it — measured on production 2026-09-20: 63 league entries
// across all four modes, ZERO of them true. So the World Cup branch below
// returned `true` for every league pool for ever, and the card's amber
// "Predictions needed" could not change no matter what anybody picked.
//
// It sat beside a Picks ring that DID flip to a tick, because the ring already
// read the server's `madePicks`. One card, two answers to the same question.
// Last Man Standing is where you see it, because that mode is a single tap:
// pick your club and the row says done and not-done at once. Pick'em hid it for
// as long as you were mid-slate, where amber still looked plausible.
//
// The answer was already on the wire and already parsed — `has_submitted` on
// the home-scoring route's `pools[]`, `hasSubmitted` in lib/api — and nothing
// read it. The web card has read its equivalent since it was written:
// `league ? league.hasSubmitted : anySubmitted`.
//
// ⚠ NO REACT NATIVE IMPORTS. Metro and the root vitest both reach this file,
// which is the only way the rule gets asserted at all — the decision used to
// live inside an 800-line hook that pulls in Supabase and cannot be imported by
// a test. See lib/resultsSections.ts for the same move.
// =============================================================

export type NeedsPredictionsInput = {
  /** How many entries this member holds in the pool. */
  entryCount: number;
  /** `pools.prediction_mode` — the World Cup's game, or `league_pickem`. */
  predictionMode: string | null;
  /**
   * The server's answer, for a league pool: `has_submitted` on the
   * home-scoring route.
   *
   * ⚠ NULL IS NOT `false`. Null means there are no league facts — a World Cup
   * pool, or an API older than the field — and only that falls through to the
   * local count. A league pool that genuinely still owes a pick sends `false`,
   * and that is an answer.
   */
  leagueHasSubmitted: boolean | null;
  /**
   * Progressive pools only: whether any OPEN round is still unsubmitted. The
   * entry-level flag is true from the first round onwards, so it cannot answer
   * this.
   */
  progressiveUnsubmitted: boolean;
  /** `pool_entries.has_submitted_predictions` on the member's best entry. */
  entryHasSubmitted: boolean;
};

export function poolNeedsPredictions(p: NeedsPredictionsInput): boolean {
  // Zero entries (an admin who deleted all of theirs) means there is literally
  // nothing to predict, so the card treatment and the filter must skip the pool
  // rather than light it up with nothing to click into.
  if (p.entryCount === 0) return false;
  if (p.leagueHasSubmitted !== null) return !p.leagueHasSubmitted;
  if (p.predictionMode === 'progressive') return p.progressiveUnsubmitted;
  return !p.entryHasSubmitted;
}

// -------------------------------------------------------------------------
// THE PROGRESSIVE BRANCH'S INPUT
// -------------------------------------------------------------------------
// `poolNeedsPredictions` above takes `progressiveUnsubmitted` as a given. This
// is where that boolean is actually decided, and it is the subtle half: the
// entry-level flag is useless for a progressive pool because it flips true on
// the first submission and stays true for ever, so the real question is
// per-round — does the member's best entry owe anything in a round that is
// OPEN right now?
//
// Lived in the middle of the fetch as two Maps and three loops, where nothing
// could reach it. It is pure given its two row sets, and those row sets are
// exactly what the wave-collapse work will change the shape of — so it is worth
// having an oracle before that happens rather than after.
// -------------------------------------------------------------------------

export type ProgressiveRoundsInput = {
  /** The pools to answer for. A pool absent from the result was never asked. */
  progressivePoolIds: readonly string[];
  /** Pool id → the entry the card speaks for. See lib/bestEntry.ts. */
  bestEntryByPool: Readonly<Record<string, string>>;
  /** `pool_round_states` rows already filtered to `state = 'open'`. */
  openRounds: readonly { pool_id: string; round_key: string }[];
  /** `entry_round_submissions` rows for the best entries. */
  submissions: readonly { entry_id: string; round_key: string; has_submitted: boolean }[];
};

export function deriveProgressiveNeedsPredictions(
  input: ProgressiveRoundsInput,
): Record<string, boolean> {
  const openRoundsByPool = new Map<string, Set<string>>();
  for (const r of input.openRounds) {
    const set = openRoundsByPool.get(r.pool_id) ?? new Set<string>();
    set.add(r.round_key);
    openRoundsByPool.set(r.pool_id, set);
  }

  // ⚠ Only rows that say `true` count as submitted. A row saying `false` is a
  // round the member has started and not filed, which is precisely the case
  // this exists to catch — treating its presence as an answer would report the
  // opposite of the truth.
  const submittedByEntry = new Map<string, Set<string>>();
  for (const s of input.submissions) {
    if (!s.has_submitted) continue;
    const set = submittedByEntry.get(s.entry_id) ?? new Set<string>();
    set.add(s.round_key);
    submittedByEntry.set(s.entry_id, set);
  }

  const result: Record<string, boolean> = {};
  for (const poolId of input.progressivePoolIds) {
    const openRounds = openRoundsByPool.get(poolId);
    // No round is open, so nothing is owed RIGHT NOW — which is the question.
    // A member can be behind on a closed round and still correctly be told
    // there is nothing to do.
    if (!openRounds || openRounds.size === 0) {
      result[poolId] = false;
      continue;
    }
    const submitted = submittedByEntry.get(input.bestEntryByPool[poolId]) ?? new Set<string>();
    result[poolId] = [...openRounds].some((roundKey) => !submitted.has(roundKey));
  }
  return result;
}
