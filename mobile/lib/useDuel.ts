import { useMemo } from 'react';

import { duelResult } from './duelPoints';
import { buildDuelRecords, type DuelRecord as EntryDuelRecord } from './duelRecord';
import {
  anyFixtureLive,
  buildSheet,
  duelVerdict,
  remainingFixtures,
  sheetSummary,
  type SheetFixture,
  type SheetRow,
  type Verdict,
} from './duelSheet';
import { fixturesForWeek } from './pickemWeek';
import { useDuelLive } from './useDuelLive';
import {
  useLeaguePool,
  useLeaguePoolPicks,
  type DuelRow,
  type LeagueMatch,
} from './useLeaguePool';

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
// A duel is revealed 24 hours after the previous matchweek's last game
// (migration 129 — it was 48h under 123, and this note said so for four days
// after the hold changed). Between that instant and the football there is no
// in-play matchweek at all, so keying on `inPlayMatchweekNumber` would blank the
// header during exactly the part of the cycle this mode exists for. The current
// bout is the first UNSETTLED one, falling back to the last result.
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
  /** Who you are playing, and what is known about them. Null while sealed. */
  opponent: Opponent | null;
  /**
   * Every fixture of the OPEN matchweek — what the duel will be decided on.
   *
   * ⚠ Not `sheet.open`, which is only the ones with no pick on them yet. This
   * is the whole week, picked or not: the question the card answers is what the
   * duel rides on, not what is left to do.
   */
  fixtures: LeagueMatch[];
  /**
   * Your points against the room's MEDIAN, per matchweek — the season chart.
   *
   * ⚠ Median, not mean: one member who forgets to pick scores 0 and drags a
   * mean down far enough to flatter everybody else.
   *
   * ⚠ A week you did not pick in is a ZERO here, not a missing row. Dropping it
   * would close the gap and draw a season you did not play.
   */
  series: { matchweek_number: number; your_points: number; median_points: number }[];
  /**
   * Every entry's duel record — the Duels leaderboard.
   *
   * ⚠ Built from SETTLED duels, which are always revealed: a week cannot settle
   * without having locked. So this is complete for everything played, and the
   * seal costs it nothing.
   */
  duelTable: Map<string, DuelRecordRow>;
  /**
   * Every duel this member may see, whoever is in it — the Room.
   *
   * ⚠ REVEAL-GATED UPSTREAM, so a sealed week is simply absent. That absence is
   * the boundary the matchweek switcher stops at: you can walk back through
   * what has been played and no further.
   */
  duels: DuelRow[];
  /** entry_id → display name, for both sides of every revealed duel. */
  names: Record<string, string>;
  /** Matchweeks with duels in them, ascending — what the switcher can reach. */
  revealedWeeks: number[];
  /**
   * Everyone's picks, entry → fixture → direction.
   *
   * ⚠ EMPTY FOR A MATCHWEEK STILL OPEN. `/bulk` withholds picks until the week
   * locks, so a rival's column is genuinely absent rather than empty — the
   * screen must read that as "not yet", never as "they did not pick".
   */
  pickDirections: Map<string, Map<string, string>>;
  /**
   * When this entry's most recently settled duel settled, or null.
   *
   * ⚠ THE RECAP'S TRIGGER, AND IT IS NOT `current`. Once next week's duel
   * reveals, `current` has already moved on to it while last week's recap may
   * still be unseen — which is the ordinary case for anybody who does not open
   * the app on a Monday night. Reading the recap off `current` would silently
   * skip it for exactly those members.
   *
   * ⚠ MAX BY `settled_at`, NEVER BY MATCHWEEK NUMBER. Rounds are played out of
   * numerical order (101 measured a minus-121-day gap), so the highest-numbered
   * settled duel is not the most recent one. Settlement time is the only thing
   * here that moves forward reliably — the same reason 122 chose it.
   */
  lastSettledAt: string | null;
  /**
   * The bout `lastSettledAt` belongs to — what the recap is ABOUT.
   *
   * ⚠ ONE DERIVATION, TWO FIELDS. The instant and the bout are found together
   * so they cannot disagree: a screen that took the timestamp from here and the
   * bout from its own scan of `bouts` would eventually recap one duel using
   * another's settlement time, and the "have I seen this" test would be against
   * the wrong week.
   */
  lastSettled: Bout | null;
  /** The viewer's own entry, for the route into the picker. */
  ownEntryId: string | null;
  /**
   * The viewer's own display name.
   *
   * ⚠ FROM THE POOL PAYLOAD, NOT FROM `names`. `names` is built from the two
   * sides of every REVEALED duel, so it is empty in a pool whose draw is still
   * sealed — which is exactly when the sealed header needs to letter the
   * member's own avatar. Reading it from `you.entries` means the one corner
   * that is never a secret is never blank.
   */
  ownName: string | null;

  // ----------------------------------------------------- the live matchweek
  /**
   * ⚠ THE SWITCH THE WHOLE TAB TURNS ON, and it is the server's answer rather
   * than a clock read here.
   *
   * True once the current duel's matchweek has LOCKED — which is an hour before
   * the first kickoff (migration 101), not at it. That hour is why this is not
   * "has the football started": the moment picks close, both sheets open, and a
   * card inviting a member to change picks they can no longer change is worse
   * than useless. `inPlayMatchweekId` in `lib/league/read.ts` is the derivation;
   * this reads its answer off the contract.
   */
  isInPlay: boolean;
  /** Both sheets, fixture by fixture. Empty unless `isInPlay`. */
  sheetRows: SheetRow[];
  /** The running duel scoreline. Null unless `isInPlay` with an opponent. */
  liveScore: { you: number; them: number } | null;
  /** Fixtures the engine has not scored yet. */
  remaining: number;
  /**
   * Is a ball in play AT THIS MOMENT — not merely "is the matchweek open".
   * See `anyFixtureLive`: the two are days apart and only this one may pulse.
   */
  liveNow: boolean;
  /** What the sheet means, in a sentence. Null before any pick is revealed. */
  summary: string | null;
  /** Whether the duel is already mathematically decided. */
  verdict: Verdict | null;
  /**
   * The matchweek currently open for picks — which is NOT the one being played.
   *
   * ⚠ THEY OVERLAP, AND THAT IS WHY THIS IS EXPOSED. `openMatchweekId` skips a
   * locked-but-unfinished matchweek deliberately, so from the moment matchweek
   * 3 locks on Saturday morning until it finishes on Monday night, matchweek 4
   * is open for picks the whole time. The tab hides "Your sheet" during that
   * window; the picking still has to be reachable.
   */
  openMatchweek: number | null;
  /**
   * Every member's pick as a SHORT LABEL — "HOME" at Results depth, "2-1" at
   * Scores. Keyed entry → fixture.
   *
   * ⚠ Exposed for THE ROOM, which renders the same team sheet for duels that
   * are not yours. The reveal gate is upstream in `/bulk`, so a week that has
   * not locked simply has no entries here — this map cannot leak it.
   */
  pickLabels: Map<string, Map<string, string>>;
  /** The matchweek being played, or null between them. */
  inPlayMatchweek: number | null;
  /** Every OTHER duel in the live matchweek — the rest of the card. */
  elsewhere: {
    id: string;
    a: string;
    b: string;
    aName: string;
    bName: string;
    pa: number;
    pb: number;
  }[];
};

export type Season = {
  /** Season total: picks PLUS duels, the sum the engine ranks on. */
  points: number;
  /** Where you sit, from the engine's stored order. */
  rank: number | null;
  /**
   * ⚠⚠ TWO CURRENCIES, SIDE BY SIDE — NOT ONE TOTAL.
   *
   * Migration 121's own header: *"`total_points` is what your picking scored;
   * `duel_points` is ... and lives beside it"*. The ranking ADDS them —
   * `ORDER BY (t.total_points + t.duel_points) DESC` — which is a sum performed
   * in the ORDER BY, not a column that carries both.
   *
   * So `points` above is the SUM, computed here; `pickPoints` and `duelPoints`
   * are the two halves. Reading `total_points` as if it already contained the
   * duel and subtracting is what showed a member who tied their duel 0 points
   * for picks: 250 − 250.
   */
  pickPoints: number;
  duelPoints: number;
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

/**
 * The member on the other side of the current duel, as far as we may look.
 *
 * ⚠ THIS IS ONLY POSSIBLE ONCE THE DUEL IS REVEALED, and only from matchweeks
 * that have LOCKED. The seal hides who you play NEXT; it never hid the picks of
 * weeks already played, which are public to the pool. So scouting an opponent
 * you can already see is not a hole in the gate — it is the gate working.
 */
export type Opponent = {
  name: string;
  /**
   * ⚠ Their entry id, so a caller can look their STANDING up in the map the
   * screen already builds for the header. It is deliberately not carried here:
   * the leaderboard is not in this hook's payload, and fetching it a second
   * time would give the two surfaces two sources for one number.
   */
  entryId: string;
  /** Their season tendency, from revealed weeks. Null under ten picks. */
  home: number | null;
  draw: number | null;
  away: number | null;
  /** Your lifetime record against THEM: wins, draws, losses, from your side. */
  met: { won: number; drawn: number; lost: number };
  /**
   * Their last five DUELS, oldest first — not their last five fixtures.
   *
   * ⚠ These are their duels against ANYONE, not just you. It is a read on the
   * member you are about to play, so their whole recent form is the point.
   */
  form: ('won' | 'tied' | 'lost' | 'bye')[];
  /**
   * Their duel points, summed from settled duels.
   *
   * ⚠ NOT on the leaderboard row. Since migration 121 `total_points` ALREADY
   * includes duel points, so there is no separate column to read for another
   * member — but every settled duel carries its own award, and summing those is
   * the same number by construction.
   */
  duelPoints: number;
  /**
   * How many revealed picks they have made — the DENOMINATOR for accuracy.
   *
   * ⚠ The numerator is not here. `correct_count` comes from the leaderboard,
   * which is not in this hook's payload, so the card joins the two. Fetching
   * the leaderboard again to keep the pair together would give the header and
   * this tab two sources for one number.
   */
  picks: number;
  /**
   * ⚠ `topClub` LIVED HERE AND IS GONE, Ryan 2026-09-10. The club somebody
   * backs most is the scout report's now, computed on the SERVER with its
   * denominator attached — "2 of 2" rather than "3×", which is the difference
   * between a finding and a number. Two derivations of one question is the
   * shape this file already warns about repeatedly; deleting the browser one
   * was the point of moving it.
   */
  /**
   * How often the two of you called the same fixture the same way, as a whole
   * percent of the fixtures you BOTH picked. Null under five in common.
   */
  agreement: number | null;
};

/**
 * ⚠ AN ALIAS NOW, not a second declaration of the same shape.
 *
 * It was written out here beside a hand-rolled loop that built it, and the two
 * could disagree about what `form` was ordered by without anything failing —
 * which they did. `lib/duelRecord.ts` owns both, mirrored from the web.
 *
 * ⚠ `DuelRecord` carries an `entry` field this never had. Harmless to every
 * consumer (they read the map by key) and load-bearing to `duelMovement`, which
 * has to sort records without being handed their ids separately.
 */
export type DuelRecordRow = EntryDuelRecord;

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
/**
 * A matchweek's fixtures in the shape `buildSheet` takes.
 *
 * ⚠ EXPORTED because THE ROOM builds sheets too, for any revealed week rather
 * than only the live one. Two copies of this mapping is two chances to reach
 * for the wrong field, and there are two fields here that punish exactly that.
 */
export function toSheetFixtures(matches: LeagueMatch[]): SheetFixture[] {
  return matches.map((f) => ({
    // ⚠ `match_number` IS `league_fixtures.fixture_number` — `read.ts` maps it
    // across — which is what the live payload keys on. A season-wide index here
    // would miss every lookup silently.
    number: f.match_number,
    id: f.match_id,
    // ⚠ `country_name` / `flag_url` ARE the club's name and crest. A league
    // fixture travels through types written for national teams.
    homeName: f.home_team?.country_name ?? null,
    awayName: f.away_team?.country_name ?? null,
    /**
     * ⚠⚠ `country_code`, NOT `short_name`. Both sound like the answer and only
     * one is: `short_name` is `shortClubName(name)` — a SHORTENED NAME, which
     * is why a sheet asking for three-letter codes rendered "Crystal Palace"
     * and "Nott'm Forest". The code lives in `league_clubs.abbreviation`
     * (char(3), NOT NULL) and `clubToTeam` carries it as `country_code`;
     * `MatchweekResultsForm` on the web already reads it that way.
     *
     * ⚠ TRIMMED, because `char(3)` is blank-padded by Postgres.
     */
    homeAbbr: f.home_team?.country_code?.trim() || null,
    awayAbbr: f.away_team?.country_code?.trim() || null,
    homeCrest: f.home_team?.flag_url ?? null,
    awayCrest: f.away_team?.flag_url ?? null,
    kickoffAt: f.match_date,
    homeScoreFt: f.home_score_ft,
    awayScoreFt: f.away_score_ft,
    isCompletedFt: f.is_completed,
  }));
}

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

  /** See the field's note: max by `settled_at`, never by matchweek number. */
  const lastSettled = useMemo<Bout | null>(() => {
    let best: Bout | null = null;
    for (const b of bouts) {
      const at = b.duel.settled_at;
      if (!at) continue;
      if (best === null || at > (best.duel.settled_at as string)) best = b;
    }
    return best;
  }, [bouts]);

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
  const fixtures = useMemo<LeagueMatch[]>(() => {
    const week = data?.season.openMatchweekNumber ?? null;
    if (week === null || !data) return [];
    return fixturesForWeek(data.season.matches, week);
  }, [data]);

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
  /**
   * YOUR OWN picks as fixture → direction, read ONCE.
   *
   * Both the season card and the agreement stat need this, and two readings of
   * the same two shapes is how one of them ends up counting a Scores pool as
   * empty while the other does not.
   */
  const myDirections = useMemo(() => {
    const out = new Map<string, string>();
    const mine = data?.you.entries[0];
    if (!mine) return out;
    for (const [fixtureId, d] of Object.entries(mine.outcomes)) out.set(fixtureId, d);
    for (const p of mine.predictions) {
      if (out.has(p.match_id)) continue; // a tap wins over a scoreline
      if (p.predicted_home_score === null || p.predicted_away_score === null) continue;
      out.set(
        p.match_id,
        p.predicted_home_score > p.predicted_away_score
          ? 'home'
          : p.predicted_home_score < p.predicted_away_score
            ? 'away'
            : 'draw',
      );
    }
    return out;
  }, [data]);

  const season = useMemo<Season | null>(() => {
    const mine = data?.you.entries[0];
    if (!mine) return null;

    const directions = [...myDirections.values()];
    const picks = directions.length;
    const correct = mine.totals?.correct ?? 0;
    const share = (d: string) =>
      picks ? Math.round((directions.filter((x) => x === d).length / picks) * 100) : 0;
    const enough = picks >= 10;
    const home = enough ? share('home') : null;
    const draw = enough ? share('draw') : null;

    return {
      // ⚠ THE SUM, because that is what the engine ranks on. `totalPoints` is
      // the picking half alone.
      points: (mine.totals?.totalPoints ?? 0) + (mine.totals?.duelPoints ?? 0),
      pickPoints: mine.totals?.totalPoints ?? 0,
      rank: mine.totals?.rank ?? null,
      duelPoints: mine.totals?.duelPoints ?? 0,
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
  }, [data, myDirections]);

  /**
   * The opponent's picks, from weeks that have already LOCKED.
   *
   * ⚠ LAZY, AND THAT IS A SIZE DECISION RATHER THAN A TIDINESS ONE. The bulk
   * payload is every revealed pick in the pool — ~200 rows today, ~3,800 for a
   * ten-person pool by May. It is fetched only once a matchweek has locked,
   * which is exactly the gate `useLeaguePoolPicks` documents. Anything looser
   * and the phone pulls a season of picks to render a card nobody can see yet.
   *
   * ⚠ `opponentEntryId` USED TO SIT HERE AND WAS ALREADY DEAD — assigned and
   * never read, left behind when the gate widened from "there is an opponent
   * AND something locked" to `somethingLocked` alone. Removed 2026-09-10.
   */
  /**
   * Has anything locked — i.e. is there a revealed pick to read at all?
   *
   * ⚠ NO `Date.now()`. Calling it during render is impure: the answer changes
   * between two renders that React is entitled to treat as identical, and the
   * lint rule catches it. The open matchweek is the one being PICKED, so every
   * matchweek before it has locked by definition — and the server already
   * worked that out against its own clock, which is the one that matters.
   */
  const openWeek = data?.season.openMatchweekNumber ?? null;
  const somethingLocked = (data?.season.matchweeks ?? []).some(
    (m) => openWeek !== null && m.number < openWeek,
  );
  /**
   * ⚠ The gate is now `somethingLocked` ALONE, not "and there is an opponent".
   * The Room reads every member's picks, so it needs the payload whether or not
   * the viewer's own duel has opened. Still lazy: nothing is fetched before the
   * first matchweek locks, because before that there is nothing revealed to
   * fetch.
   */
  const picks = useLeaguePoolPicks(poolId, somethingLocked);

  const opponent = useMemo<Opponent | null>(() => {
    const them = current?.them;
    if (!them) return null;

    /**
     * ⚠⚠ BOTH SHAPES, for the third time in this file. A Results pool sends
     * `outcomes` and no scores; a Scores pool sends `predictions` and NO
     * `outcomes` key at all. Reading one reports a member who picked every game
     * as having picked none — see the note on `season`.
     *
     * ⚠ A tap wins over a scoreline where a row somehow carried both, the same
     * way `season` and the web's `ownPickDirections` resolve it. Two readers
     * disagreeing about one row is worse than either answer.
     */
    const theirs = new Map<string, string>();
    for (const o of picks.data?.outcomes ?? []) {
      if (o.entry_id !== them.entryId) continue;
      theirs.set(o.match_id, o.outcome);
    }
    for (const p of picks.data?.predictions ?? []) {
      if (p.entry_id !== them.entryId || theirs.has(p.match_id)) continue;
      theirs.set(
        p.match_id,
        p.predicted_home_score > p.predicted_away_score
          ? 'home'
          : p.predicted_home_score < p.predicted_away_score
            ? 'away'
            : 'draw',
      );
    }

    const directions = [...theirs.values()];
    const n = directions.length;
    const share = (d: string) =>
      n ? Math.round((directions.filter((x) => x === d).length / n) * 100) : 0;
    // Same ten-pick floor as your own tendency — a habit needs a season.
    const enough = n >= 10;
    const home = enough ? share('home') : null;
    const draw = enough ? share('draw') : null;

    /**
     * Your record against THIS opponent, from your own settled duels.
     *
     * ⚠ No extra read: `bouts` already holds every duel you are in, and a
     * head-to-head is a filter over it. ⚠ And `duelResult`, never a literal —
     * a win has been 500 since migration 121, and `=== 3` would score every
     * meeting as a defeat.
     */
    let won = 0;
    let drawn = 0;
    let lost = 0;
    for (const b of bouts) {
      if (!b.settled || b.them?.entryId !== them.entryId) continue;
      const r = duelResult(b.you.points);
      if (r === 'won') won += 1;
      else if (r === 'tied') drawn += 1;
      else if (r === 'lost') lost += 1;
    }

    /**
     * Their last five DUELS, oldest first — against anyone, not just you.
     *
     * ⚠ Read from `showdown.duels`, which the contract already reveal-gates, so
     * a sealed week simply is not in it. ⚠ And classified with `duelResult`
     * from the side THEY were on: a duel stores two entries and two point
     * values, and reading the wrong column reports their opponent's result as
     * theirs.
     */
    const form: Opponent['form'] = [];
    let theirDuelPoints = 0;
    for (const d of showdown?.duels ?? []) {
      if (!d.settled_at) continue;
      const isA = d.entry_a === them.entryId;
      const isB = d.entry_b === them.entryId;
      if (!isA && !isB) continue;
      // A bye has no opponent at all — it is not a result they earned.
      if (d.entry_b === null) {
        // ⚠ A bye still PAYS — 250, same as a tie — so it counts toward their
        // duel points even though it is not a result they earned.
        theirDuelPoints += d.points_a ?? 0;
        form.push('bye');
        continue;
      }
      theirDuelPoints += (isA ? d.points_a : d.points_b) ?? 0;
      const r = duelResult(isA ? d.points_a : d.points_b);
      if (r) form.push(r);
    }

    /**
     * How often the two of you called the same fixture the same way.
     *
     * ⚠ Over the fixtures you BOTH picked, not over the season. A week one of
     * you missed is not a disagreement, and counting it as one would report
     * somebody's holiday as a difference of opinion.
     */
    let shared = 0;
    let same = 0;
    for (const [fixtureId, d] of theirs) {
      const mine = myDirections.get(fixtureId);
      if (!mine) continue;
      shared += 1;
      if (mine === d) same += 1;
    }

    return {
      name: them.name,
      entryId: them.entryId,
      home,
      draw,
      away: home === null || draw === null ? null : 100 - home - draw,
      met: { won, drawn, lost },
      form: form.slice(-5),
      picks: n,
      duelPoints: theirDuelPoints,
      // Five in common is the floor — below that a percentage is two picks
      // wearing a statistic.
      agreement: shared >= 5 ? Math.round((same / shared) * 100) : null,
    };
  }, [current, picks.data, bouts, showdown, myDirections]);

  /**
   * One record per entry — W / T / L, byes, form and duel points.
   *
   * ⚠⚠ IT WAS A HAND-ROLLED LOOP HERE AND IT HAD DRIFTED. `lib/duelRecord.ts`
   * owns it now, mirrored byte for byte from the web's copy, because every way
   * this can be wrong is a row that still adds up:
   *
   *   · a bye counted as a tie — `DUEL_BYE === DUEL_TIE`, so the points cannot
   *     tell them apart
   *   · the form strip in PAYLOAD order rather than by `settled_at`, which is
   *     what the loop here did. Rounds are played out of numerical order —
   *     migration 101 measured a minimum gap of minus 121 days across three
   *     real seasons — so it showed five real results in an order they never
   *     happened in, and looked completely normal doing it.
   *
   * ⚠ THE FORM IS NO LONGER TRIMMED HERE. Consumers slice their own window
   * (`ShowdownLeaderboard`'s strip takes the last five), so trimming in the
   * producer would silently cap anything that later wants more.
   */
  const duelTable = useMemo(
    () => buildDuelRecords(showdown?.duels ?? []),
    [showdown],
  );

  /**
   * Everyone's revealed picks, folded into one map.
   *
   * ⚠⚠ BOTH SHAPES, as everywhere else in this file: a Results pool sends
   * `outcomes` and no scores, a Scores pool sends `predictions` and no
   * `outcomes` key at all. ⚠ And a tap wins over a scoreline, the same way the
   * other three readers resolve it — two readers disagreeing about one row is
   * worse than either answer.
   */
  const pickDirections = useMemo(() => {
    const out = new Map<string, Map<string, string>>();
    const forEntry = (id: string) => {
      let m = out.get(id);
      if (!m) {
        m = new Map<string, string>();
        out.set(id, m);
      }
      return m;
    };
    for (const o of picks.data?.outcomes ?? []) forEntry(o.entry_id).set(o.match_id, o.outcome);
    for (const p of picks.data?.predictions ?? []) {
      const m = forEntry(p.entry_id);
      if (m.has(p.match_id)) continue;
      m.set(
        p.match_id,
        p.predicted_home_score > p.predicted_away_score
          ? 'home'
          : p.predicted_home_score < p.predicted_away_score
            ? 'away'
            : 'draw',
      );
    }
    return out;
  }, [picks.data]);

  const revealedWeeks = useMemo(() => {
    const weeks = new Set((showdown?.duels ?? []).map((d) => d.matchweek_number));
    return [...weeks].sort((a, b) => a - b);
  }, [showdown]);

  // =============================================================
  // THE LIVE MATCHWEEK
  // =============================================================
  // Everything below is dark until a matchweek locks, and then it is the tab.

  /**
   * ⚠ THE SERVER'S ANSWER, NOT A CLOCK READ. `inPlayMatchweekId` walks the
   * matchweeks by lock time and returns the latest one that has locked and is
   * not done — against the server's clock, which is the one the engine, the
   * seal and the deadline all already agree on. Re-deriving it here from
   * `lock_at` would be a fourth copy of a rule that has drifted before.
   */
  const inPlayWeek = data?.season.inPlayMatchweekNumber ?? null;
  const isInPlay =
    current !== null && inPlayWeek !== null && current.matchweek === inPlayWeek;

  /**
   * ⚠ FETCHED ONLY WHILE A WEEK IS BEING PLAYED. A null matchweek disables the
   * query outright, so a pool between matchweeks — most of the week, most of
   * the season — polls nothing and holds no subscription.
   */
  const live = useDuelLive(poolId, isInPlay ? inPlayWeek : null);

  /**
   * One member's pick as a SHORT LABEL — "HOME" at Results depth, "2-1" at
   * Scores depth.
   *
   * ⚠ A SECOND PROJECTION OF THE SAME ROWS, not a second source. `pickDirections`
   * below collapses a scoreline to the direction it backs, which is what The
   * Room needs; the team sheet needs the scoreline itself, because on a Scores
   * pool two members who both backed the home side are only separated by the
   * digits. Same rows, same precedence, different rendering.
   *
   * ⚠ YOUR OWN PICKS ARE SEEDED FIRST AND NEVER GATED. The bulk payload
   * withholds a matchweek still open for picks — correctly — but your own sheet
   * is yours to see at any time, and it is already in the contract. Without
   * this seed your own column would be empty for as long as the bulk fetch
   * takes, on the one card that exists to compare the two.
   */
  const pickLabels = useMemo(() => {
    const out = new Map<string, Map<string, string>>();
    const forEntry = (id: string) => {
      let m = out.get(id);
      if (!m) {
        m = new Map<string, string>();
        out.set(id, m);
      }
      return m;
    };
    const direction = (o: string) => (o === 'home' ? 'HOME' : o === 'away' ? 'AWAY' : 'DRAW');

    for (const e of data?.you.entries ?? []) {
      const m = forEntry(e.entry_id);
      for (const [fixtureId, outcome] of Object.entries(e.outcomes)) m.set(fixtureId, direction(outcome));
      for (const p of e.predictions) {
        if (!m.has(p.match_id)) m.set(p.match_id, `${p.predicted_home_score}-${p.predicted_away_score}`);
      }
    }
    for (const o of picks.data?.outcomes ?? []) forEntry(o.entry_id).set(o.match_id, direction(o.outcome));
    for (const p of picks.data?.predictions ?? []) {
      const m = forEntry(p.entry_id);
      if (m.has(p.match_id)) continue;
      m.set(p.match_id, `${p.predicted_home_score}-${p.predicted_away_score}`);
    }
    return out;
  }, [data, picks.data]);

  /** The live matchweek's fixtures, in the shape the sheet builder takes. */
  const sheetFixtures = useMemo<SheetFixture[]>(
    () =>
      !isInPlay || inPlayWeek === null || !data
        ? []
        : toSheetFixtures(fixturesForWeek(data.season.matches, inPlayWeek)),
    [isInPlay, inPlayWeek, data],
  );

  const sheetRows = useMemo<SheetRow[]>(() => {
    if (!isInPlay || !current || sheetFixtures.length === 0) return [];
    return buildSheet({
      fixtures: sheetFixtures,
      live: new Map(live.fixtures.map((f) => [f.number, f])),
      mine: live.perFixture.get(current.you.entryId) ?? new Map(),
      theirs: current.them ? live.perFixture.get(current.them.entryId) ?? new Map() : new Map(),
      label: (entryId, fixtureId) => pickLabels.get(entryId)?.get(fixtureId) ?? null,
      youEntry: current.you.entryId,
      themEntry: current.them?.entryId ?? null,
    });
  }, [isInPlay, current, sheetFixtures, live, pickLabels]);

  /**
   * The running scoreline.
   *
   * ⚠ FALLS BACK TO `accuracy`, WHICH IS THE MATCHWEEK'S POINTS. The duel row
   * carries two numbers and they are not the same currency: `points_a` is the
   * DUEL result (500 / 250 / 0, migration 121) and `accuracy_a` is what that
   * member's picking scored that week — which is what the header already shows
   * as the final scoreline. Falling back to it keeps the number honest for the
   * second before the first live fetch lands, instead of flashing 0-0.
   */
  const liveScore = useMemo(() => {
    if (!isInPlay || !current?.them) return null;
    return {
      you: live.points.get(current.you.entryId) ?? current.you.accuracy ?? 0,
      them: live.points.get(current.them.entryId) ?? current.them.accuracy ?? 0,
    };
  }, [isInPlay, current, live.points]);

  const remaining = useMemo(() => remainingFixtures(sheetRows), [sheetRows]);
  const liveNow = useMemo(() => anyFixtureLive(sheetRows), [sheetRows]);
  const summary = useMemo(() => sheetSummary(sheetRows), [sheetRows]);
  const verdict = useMemo(
    () => (liveScore ? duelVerdict(sheetRows, liveScore.you, liveScore.them) : null),
    [sheetRows, liveScore],
  );

  /**
   * Every other duel in the live matchweek — the rest of the card.
   *
   * The mode is personal, but the pool is not: five duels resolve on the same
   * ten fixtures, and knowing two other members are level makes the afternoon
   * bigger than your own game.
   *
   * ⚠ ONLY THE MATCHWEEK BEING PLAYED. Every later one is sealed, and its rows
   * are not here to filter — RLS withheld them (116), which is also why this
   * needs no reveal check of its own.
   */
  const elsewhere = useMemo(() => {
    if (!isInPlay || inPlayWeek === null || !showdown) return [];
    const name = (id: string) => showdown.names[id] ?? 'Unknown';
    return showdown.duels
      .filter((d) => d.matchweek_number === inPlayWeek && d.entry_b !== null)
      .filter((d) => !ownEntryIds.has(d.entry_a) && !ownEntryIds.has(d.entry_b as string))
      .map((d) => {
        const b = d.entry_b as string;
        return {
          id: d.duel_id,
          a: d.entry_a,
          b,
          aName: name(d.entry_a),
          bName: name(b),
          pa: live.points.get(d.entry_a) ?? d.accuracy_a ?? 0,
          pb: live.points.get(b) ?? d.accuracy_b ?? 0,
        };
      });
  }, [isInPlay, inPlayWeek, showdown, ownEntryIds, live.points]);

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
    fixtures,
    series: showdown?.series ?? [],
    duelTable,
    duels: showdown?.duels ?? [],
    names: showdown?.names ?? {},
    revealedWeeks,
    pickDirections,
    season,
    opponent,
    lastSettledAt: lastSettled?.duel.settled_at ?? null,
    lastSettled,
    ownEntryId: data?.you.entries[0]?.entry_id ?? null,
    ownName: data?.you.entries[0]?.entry_name ?? null,
    isInPlay,
    sheetRows,
    liveScore,
    remaining,
    liveNow,
    summary,
    verdict,
    elsewhere,
    openMatchweek: openWeek,
    pickLabels,
    inPlayMatchweek: inPlayWeek,
  };
}
