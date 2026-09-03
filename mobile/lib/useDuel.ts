import { useMemo } from 'react';

import { duelResult } from './duelPoints';
import { useLeaguePool, type DuelRow } from './useLeaguePool';

// =============================================================
// ONE ANSWER TO "WHO AM I PLAYING"
// =============================================================
// The Duel tab and the matchup header both name an opponent, and they sit on
// screen AT THE SAME TIME — the header is pinned above the tab that repeats it.
// Two derivations would eventually disagree in front of the member, which is
// the one bug this mode cannot survive: a header saying you are playing Priya
// over a card saying you are playing Dave.
//
// So the selection lives here once. Both surfaces render it; neither computes
// it. Same reason `league_finalize_ranks` is one function rather than two rank
// writers, and the same reason migration 127 exists.
//
// ## ⚠ WHAT COUNTS AS "CURRENT" — and why it is not the in-play matchweek
//
// A duel is revealed up to 48 hours before its football starts (migration 123's
// anticipation window). For that whole stretch there is no in-play matchweek at
// all, so keying on `inPlayMatchweekNumber` would blank the header during
// exactly the part of the cycle this mode exists for. The current bout is the
// first UNSETTLED one, falling back to the last result.
// =============================================================

/** One side of a duel, oriented so the viewer is always `you`. */
export type DuelSide = {
  entryId: string;
  name: string;
  /** What their picks scored that week. Null until the duel settles. */
  accuracy: number | null;
  /** The duel's own points — 500/250/0. Null until it settles. */
  points: number | null;
};

export type Bout = {
  duel: DuelRow;
  matchweek: number;
  you: DuelSide;
  /** `null` is a BYE — a row that exists with nobody on the other side. */
  them: DuelSide | null;
  settled: boolean;
};

export type DuelRecord = {
  won: number;
  tied: number;
  lost: number;
  byes: number;
  points: number;
};

export type DuelState = {
  /** True while the contract is still loading — surfaces should hold, not empty. */
  loading: boolean;
  error: boolean;
  /** Null when this is not a Showdown pool at all. */
  isShowdown: boolean;
  /** Every revealed duel the viewer is in, oldest first. */
  bouts: Bout[];
  /** The one to lead with. Null before the draw exists. */
  current: Bout | null;
  record: DuelRecord;
  /**
   * The next duel this member may NOT see yet, and when it opens.
   *
   * ⚠ `matchweek` here is a week with NO ROW in `bouts` — that absence is the
   * seal, not an empty week. Never render it as "no opponent".
   */
  sealed: { matchweek: number; opensAt: string | null } | null;
};

/**
 * @param poolId pass `null` for a pool that is not Showdown — the league
 *   payload is the whole season (~165 kB) and there is no reason to pull it
 *   for a mode with no duels. `useLeaguePool` is disabled on a null id.
 */
export function useDuel(poolId: string | null | undefined): DuelState {
  const league = useLeaguePool(poolId);
  const data = league.data;
  const showdown = data?.showdown ?? null;

  const ownEntryIds = useMemo(
    () => new Set((data?.you.entries ?? []).map((e) => e.entry_id)),
    [data],
  );

  const bouts = useMemo<Bout[]>(() => {
    if (!showdown) return [];
    const name = (id: string) => showdown.names[id] ?? 'Unknown';
    const out: Bout[] = [];

    for (const d of showdown.duels) {
      const iAmA = ownEntryIds.has(d.entry_a);
      const iAmB = d.entry_b !== null && ownEntryIds.has(d.entry_b);
      if (!iAmA && !iAmB) continue;

      // ⚠ Orientation is PRESENTATIONAL. `entry_a` / `entry_b` are the circle
      // method's own sides and carry no meaning about who is "home" — flipping
      // them for display is safe; reading anything into them would not be.
      const you: DuelSide = iAmA
        ? { entryId: d.entry_a, name: name(d.entry_a), accuracy: d.accuracy_a, points: d.points_a }
        : {
            entryId: d.entry_b as string,
            name: name(d.entry_b as string),
            accuracy: d.accuracy_b,
            points: d.points_b,
          };

      const them: DuelSide | null = iAmA
        ? d.entry_b === null
          ? null
          : { entryId: d.entry_b, name: name(d.entry_b), accuracy: d.accuracy_b, points: d.points_b }
        : { entryId: d.entry_a, name: name(d.entry_a), accuracy: d.accuracy_a, points: d.points_a };

      out.push({ duel: d, matchweek: d.matchweek_number, you, them, settled: !!d.settled_at });
    }
    return out.sort((a, b) => a.matchweek - b.matchweek);
  }, [showdown, ownEntryIds]);

  const current = useMemo(
    () => bouts.find((b) => !b.settled) ?? bouts[bouts.length - 1] ?? null,
    [bouts],
  );

  const record = useMemo<DuelRecord>(() => {
    let won = 0;
    let tied = 0;
    let lost = 0;
    let byes = 0;
    let points = 0;
    for (const b of bouts) {
      if (!b.settled) continue;
      points += b.you.points ?? 0;
      if (!b.them) {
        // ⚠ Structural, never by value: DUEL_BYE === DUEL_TIE on purpose, so
        // this is the ONLY way to tell a free week from a drawn one.
        byes += 1;
        continue;
      }
      const r = duelResult(b.you.points);
      if (r === 'won') won += 1;
      else if (r === 'tied') tied += 1;
      else if (r === 'lost') lost += 1;
    }
    return { won, tied, lost, byes, points };
  }, [bouts]);

  const sealed = useMemo(() => {
    const n = data?.season.sealedMatchweekNumber ?? null;
    if (n === null) return null;
    return { matchweek: n, opensAt: data?.season.sealedOpensAtLatest ?? null };
  }, [data]);

  return {
    // ⚠ A DISABLED query reports `isPending` forever. React Query has no
    // "idle" status any more, so a null poolId — every non-Showdown pool —
    // would otherwise pin every consumer on a spinner that never resolves.
    loading: Boolean(poolId) && league.isPending,
    error: league.isError,
    isShowdown: showdown !== null,
    bouts,
    current,
    record,
    sealed,
  };
}
