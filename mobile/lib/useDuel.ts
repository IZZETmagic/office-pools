import { useMemo } from 'react';

import { duelResult } from './duelPoints';
import { fixturesForWeek } from './pickemWeek';
import { useLeaguePool, type DuelRow, type LeagueMatch } from './useLeaguePool';

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
  /**
   * Every revealed duel the viewer is in, oldest first.
   *
   * ⚠ Nothing renders this today. The Duel tab was stripped back to Your Sheet
   * on 2026-09-03 and the season list is on the list to come back; the header
   * only needs `current`. Kept because the derivation is the shared one — if
   * the list does not return, this and `record` should go together.
   */
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
  /**
   * When the CURRENT duel's football starts — its matchweek's first kickoff.
   *
   * ⚠ NOT `lock_at`. Migration 101 closes picks an HOUR before the first game,
   * so the two are an hour apart and mean different things: one is "you can no
   * longer change this", the other is "this is now being played". A countdown
   * labelled first game must use the kickoff.
   */
  currentKickoff: string | null;
  /**
   * Your picks for the matchweek that is open, and what is still missing.
   *
   * Null when there is no open matchweek, or it has no fixtures — there is no
   * sheet to be part-way through.
   */
  sheet: Sheet | null;
  /** The viewer's own entry, for the route into the picker. */
  ownEntryId: string | null;
};

export type Sheet = {
  done: number;
  total: number;
  /** The fixtures with no pick on them yet, in fixture order. */
  open: LeagueMatch[];
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

  const currentKickoff = useMemo(() => {
    if (!current) return null;
    const mw = data?.season.matchweeks.find((m) => m.number === current.matchweek);
    return mw?.first_kickoff_at ?? null;
  }, [current, data]);

  /**
   * ⚠ THE OPEN MATCHWEEK, not the one being played. This card is the one thing
   * a member can DO while the next opponent is still sealed, so it has to
   * describe the week they can still change.
   *
   * ⚠⚠ A PICK LIVES IN ONE OF TWO PLACES DEPENDING ON DEPTH. Results-depth taps
   * arrive in `outcomes` keyed by fixture id; Scores-depth scorelines arrive in
   * `predictions` keyed by `match_id`, which IS the fixture id under the World
   * Cup's name for it. Checking only one of them counts a full sheet as empty
   * for half the pools — and silently, since both shapes are legitimately
   * present on the type.
   */
  const sheet = useMemo<Sheet | null>(() => {
    const week = data?.season.openMatchweekNumber ?? null;
    const mine = data?.you.entries[0];
    if (week === null || !mine || !data) return null;

    const fixtures = fixturesForWeek(data.season.matches, week);
    if (fixtures.length === 0) return null;

    const picked = new Set<string>(Object.keys(mine.outcomes));
    for (const p of mine.predictions) picked.add(p.match_id);

    const open = fixtures.filter((f) => !picked.has(f.match_id));
    return { done: fixtures.length - open.length, total: fixtures.length, open };
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
    currentKickoff,
    sheet,
    ownEntryId: data?.you.entries[0]?.entry_id ?? null,
  };
}
