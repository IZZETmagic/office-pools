// =============================================================
// The "needs more players" card on Home (Ryan, 2026-10-09)
// =============================================================
// One card, for one pool: the first one you run that is small and hasn't started. Its × closes it
// for THAT pool, for good on this phone. Another pool that qualifies can still have the card, and
// closing that one closes it for that one too.
//
// Disclosure gate: "If a pool you run has fewer than 4 members before it starts, we suggest
// inviting friends. Close it and we won't suggest it for that pool again."
//
// ⚠ PURE ON PURPOSE: vitest runs this without React Native (see vitest.config.ts). The SecureStore
// half lives in `useInviteCard.ts`.
// =============================================================

/** Below this many members, a pool you run gets the card. */
export const INVITE_CARD_MEMBER_TARGET = 4;

/** The parts of a Home pool the choice reads. `PoolSummary` satisfies it. */
export type InviteCandidate = {
  poolId: string;
  role: string;
  memberCount: number;
  hasScoringStarted: boolean;
  predictionDeadline: string | null;
};

/**
 * The pool the card is for, or `null` for no card.
 *
 * - You run it, and it has fewer than INVITE_CARD_MEMBER_TARGET members.
 * - It hasn't started: the prediction deadline (first kickoff) is still ahead and nothing has been
 *   scored. Predictions are locked by then, so there's no point inviting anyone.
 * - You haven't closed the card for it on this phone.
 *
 * `closed` is `null` until the phone has answered, and not yet known is not shown — otherwise a
 * card you closed yesterday would flash up on every launch while the read is in flight.
 */
export function pickInviteTarget<P extends InviteCandidate>(
  pools: readonly P[],
  closed: ReadonlySet<string> | null,
  now: number,
): P | null {
  if (closed === null) return null;
  return (
    pools.find((p) => {
      if (p.role !== 'admin' || p.memberCount >= INVITE_CARD_MEMBER_TARGET) return false;
      if (closed.has(p.poolId)) return false;
      const started =
        p.hasScoringStarted ||
        (p.predictionDeadline != null && Date.parse(p.predictionDeadline) <= now);
      return !started;
    }) ?? null
  );
}

/**
 * How many closed pools the phone remembers. Oldest go first.
 *
 * ⚠ SecureStore warns above 2,048 bytes on iOS, and a pool id is 36 characters plus JSON's quotes
 * and comma. 40 is ~1,600 bytes. A pool that fell off the end would also have to still be small,
 * still be yours and still not have started for the card to come back.
 */
export const INVITE_CARD_CLOSED_LIMIT = 40;

/** Add a closed pool, newest last, keeping at most the limit. */
export function withClosedPool(ids: readonly string[], poolId: string): string[] {
  const next = ids.filter((id) => id !== poolId);
  next.push(poolId);
  return next.slice(-INVITE_CARD_CLOSED_LIMIT);
}

/** Read the stored list. Anything that isn't a list of strings reads as nothing closed. */
export function parseClosedPools(raw: string | null): string[] {
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}
