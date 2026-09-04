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
  /**
   * How the viewer has been playing — the self-scouting card.
   *
   * ⚠ SELF-scouting, and that is forced rather than chosen. Scouting the
   * OPPONENT is what the mockup asked for, and it cannot exist while the draw
   * is sealed: the whole point of the window is that nobody knows who they are
   * yet. Pointing the same stats at the reader keeps the card and loses
   * nothing, because the member reading their own tendencies is the one who
   * can act on them.
   */
  season: Season | null;
  /** The viewer's own entry, for the route into the picker. */
  ownEntryId: string | null;
};

export type Season = {
  /** Season total, INCLUDING duel points — they are one number since 121. */
  points: number;
  /** Where you sit, from the engine's stored order. */
  rank: number | null;
  correct: number;
  /** How many picks you have made all season, at either depth. */
  picks: number;
  /** Correct as a share of picks MADE. Null under one pick. */
  accuracy: number | null;
  /**
   * Share of picks that backed home / draw / away, as whole percents.
   *
   * ⚠ NULL UNDER TEN PICKS. "100% home" off two picks is noise wearing a
   * percentage, and a tendency needs a season to be one.
   */
  home: number | null;
  draw: number | null;
  away: number | null;
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

  /**
   * ⚠⚠ BOTH PICK SHAPES, AGAIN. Migration 064 gave a league pool two mutually
   * exclusive pick shapes: a Results pool files a tap, a Scores pool files a
   * scoreline, and a row carrying both is refused by a CHECK. So for a Scores
   * pool the outcomes map is EMPTY, not partial — counting it alone reports a
   * member who picked every game as having picked none.
   *
   * That is not hypothetical. The web's "Your sheet" and "Your season" cards
   * both shipped with it, and on `Showdown: Exact Scores` a full sheet of ten
   * scorelines rendered as 0/10 with a button asking the member to finish picks
   * they had already made. Ryan found it 2026-09-01; `lib/league/ownPicks.ts`
   * owns the rule on the web and this mirrors it.
   *
   * ⚠ THE DERIVATION ONLY RUNS ONE WAY. A stored scoreline can be READ as a
   * direction — 2-1 backed the home side, and saying so invents nothing. The
   * reverse is forbidden: filing "home" as a sentinel 1-0 would score as a
   * genuine exact. Nothing here writes.
   */
  const season = useMemo<Season | null>(() => {
    const mine = data?.you.entries[0];
    if (!mine) return null;

    const directions: string[] = Object.values(mine.outcomes);
    const tapped = new Set(Object.keys(mine.outcomes));
    for (const p of mine.predictions) {
      if (tapped.has(p.match_id)) continue; // a tap wins over a scoreline
      if (p.predicted_home_score === null || p.predicted_away_score === null) continue;
      directions.push(
        p.predicted_home_score > p.predicted_away_score
          ? 'home'
          : p.predicted_home_score < p.predicted_away_score
            ? 'away'
            : 'draw',
      );
    }

    const picks = directions.length;
    const correct = mine.totals?.correct ?? 0;
    const share = (d: string) =>
      picks ? Math.round((directions.filter((x) => x === d).length / picks) * 100) : 0;
    const enough = picks >= 10;
    const home = enough ? share('home') : null;
    const draw = enough ? share('draw') : null;

    return {
      // ⚠ One number since migration 121 — `total_points` already INCLUDES the
      // duel points, so adding `duelPoints` again would double-count every win.
      points: mine.totals?.totalPoints ?? 0,
      rank: mine.totals?.rank ?? null,
      correct,
      picks,
      // ⚠ Against picks MADE, not fixtures played. A member who missed a week
      // did not get those wrong — they were not in them, and counting them as
      // misses reports somebody's holiday as bad form.
      accuracy: picks ? Math.round((correct / picks) * 100) : null,
      home,
      draw,
      // Derived so the three always total 100 — rounding each independently
      // lets them add up to 99 or 101 and the bar leaves a gap.
      away: home === null || draw === null ? null : 100 - home - draw,
    };
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
    season,
    ownEntryId: data?.you.entries[0]?.entry_id ?? null,
  };
}
