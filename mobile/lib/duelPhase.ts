// =============================================================
// WHICH PHASE OF THE DUEL IS THIS — one answer, in one place
// =============================================================
// Ryan, 2026-09-06, describing Showdown as six phases:
//
//   1  sealed      the draw is closed; a countdown to when it opens
//   2  reveal      the walkout — who am I playing this week
//   3  scouting    they are named; picks are still open
//   4  live        picks locked, football being played, scores moving
//   5  recap       the duel is decided; how it went, once
//   6  full circle straight back to 1, with a shorter clock
//
// Six phases, FIVE states: 6 is 1. A pool mid-season and a pool that has never
// played land on the same sealed screen and differ only in how long the clock
// says. Giving 6 its own state would mean two components that must always agree
// about a countdown — and the whole reason this file exists is that the last
// thing to decide a Showdown state ad hoc got it wrong in production.
//
// ## ⚠ WHAT THIS REPLACES, AND WHY IT IS A MODULE RATHER THAN AN if-CHAIN
//
// The web picks its state with an if-chain inside a 2,663-line component, and
// the only thing holding the ORDER correct is a test that reads that file as
// text and asserts one `indexOf` is smaller than another
// (`lib/league/__tests__/bandStateOrder.guard.test.ts`).
//
// That guard exists because the order had already failed in front of members.
// On 2026-09-01 matchweek 3's draw opened at 10pm and the band went straight
// from counting down to matchweek 3 to counting down to matchweek 4 — the
// walkout, the flagship moment of the flagship mode, was unreachable. It
// survived review because the countdown it switched to was itself CORRECT. It
// was just counting to the wrong week.
//
// A second hand-rolled chain on React Native would have re-earned that bug on a
// second surface. So the order is encoded here, as logic, and tested on what it
// RETURNS rather than on the shape of the source that produces it.
//
// ## ⚠ IT DERIVES NOTHING. IT ONLY ORDERS.
//
// Every instant and every flag below is handed in from the server: the reveal
// from `league_duel_reveals_at` (127/129), the in-play week from
// `inPlayMatchweekId`, settlement from `league_duels.settled_at`. Migration 127
// exists precisely because a front end re-derived the reveal rule and spent a
// fortnight counting down accurately to the wrong matchweek — and 103 records
// `league_open_matchweek` coming to exist FOUR times before anyone noticed the
// copies had drifted.
//
// If you are about to add a `Date.parse(lock_at) - 3600_000` to this file: no.
// Ask the contract for the instant instead.
//
// ⚠ NOTHING HERE MAY IMPORT REACT NATIVE. That is what keeps it inside the root
// vitest runner's reach (`mobile/**/__tests__/**/*.test.ts`), and
// `mobile/lib/__tests__/duelPhase.test.ts` is what that buys.
// =============================================================

/**
 * The five states. Phase 6 is deliberately absent — it resolves to `sealed`.
 *
 * `none` is not one of Ryan's phases. It is the honest answer for a pool with
 * no draw yet: a Showdown pool needs two members before anybody can be drawn
 * against anybody, and rendering a sealed countdown to a draw that cannot
 * happen would be a clock ticking towards nothing.
 */
export type DuelPhase = 'none' | 'sealed' | 'revealable' | 'scouting' | 'live' | 'decided';

/** The current duel, as much of it as the phase depends on. */
export type PhaseDuel = {
  matchweek: number;
  /** `null` while it is still being played. */
  settledAt: string | null;
  /**
   * When this duel's draw opened — `league_duel_reveals_at`, read from the
   * contract, never worked out here.
   *
   * ⚠ `null` IS TREATED AS ALREADY WATCHED, not as "walk them out". A missing
   * instant is a contract that has not been deployed yet or a matchweek with no
   * fixtures, and neither is a reason to replay a ceremony. Failing towards
   * "seen" means the worst case is a member missing one walkout; failing the
   * other way means every member gets the same walkout on every app open, which
   * is the single most irritating way this feature can break.
   *
   * `-infinity` arrives as a string from Postgres for the season's first
   * playable matchweek (129). `Date.parse` gives NaN, which compares false
   * everywhere — so it reads as "already watched" once a stamp exists, which is
   * the right answer for a week that was never sealed in the first place.
   */
  revealsAt: string | null;
};

export type DuelPhaseInput = {
  /**
   * Is there a draw at all? False for a Showdown pool still waiting on its
   * second member, which is the one case that is neither sealed nor revealed.
   */
  hasDraw: boolean;
  /**
   * The duel in focus — `useDuel`'s `current`, which is the first UNSETTLED
   * bout falling back to the last result.
   */
  current: PhaseDuel | null;
  /** The first matchweek whose draw is still closed, if any. */
  sealedMatchweek: number | null;
  /**
   * Is `current`'s matchweek the one being played right now?
   *
   * ⚠ THE SERVER'S OWN ANSWER (`inPlayMatchweekNumber`), never a `lock_at`
   * comparison made on the phone. It is null between matchweeks, which is most
   * of any given week — see `useDuel`'s header for why that makes it useless as
   * a way of deciding which duel is current, and fine as a way of deciding
   * whether football is happening.
   */
  isInPlay: boolean;
  /**
   * The most recently settled duel this entry has, by `settled_at`.
   *
   * ⚠ NOT `current`. Once next week's duel reveals, `current` moves on to it
   * while last week's recap may still be unseen — that is the ordinary case for
   * anyone who does not open the app on a Monday.
   */
  lastSettledAt: string | null;
  /** `pool_entries.last_reveal_seen_at` (136). */
  revealSeenAt: string | null;
  /** `pool_entries.last_recap_seen_at` (122). */
  recapSeenAt: string | null;
};

export type DuelPhaseResult = {
  phase: DuelPhase;
  /** The matchweek this phase is ABOUT. Sealed phases name the sealed week. */
  matchweek: number | null;
  /**
   * May the opponent be named on screen?
   *
   * ⚠ FALSE DURING `revealable`, AND THAT IS THE WHOLE POINT. Ryan, 2026-09-02,
   * on the web's first build: putting their face in the header next to a button
   * marked Reveal meant the button revealed nothing — you had already read the
   * answer above it.
   */
  opponentVisible: boolean;
  /** Show the recap sheet over whatever else is on screen. */
  recapPending: boolean;
};

/**
 * ⚠ THE ORDER OF THESE BRANCHES IS THE ENTIRE CONTRACT OF THIS FILE.
 *
 * Read the reasoning before moving one. Each is here because putting it lower
 * makes a reachable state unreachable, and every one of those failures looks
 * like a working screen.
 */
export function duelPhase(input: DuelPhaseInput): DuelPhaseResult {
  const { current, sealedMatchweek, isInPlay, hasDraw } = input;

  // ---------------------------------------------------------------
  // 0. No draw — not a phase, an absence.
  // ---------------------------------------------------------------
  if (!hasDraw && current === null) {
    return { phase: 'none', matchweek: null, opponentVisible: false, recapPending: false };
  }

  const recapPending = isUnseen(input.lastSettledAt, input.recapSeenAt);

  // ---------------------------------------------------------------
  // 1. LIVE (phase 4) — football outranks everything.
  // ---------------------------------------------------------------
  // ⚠ FIRST, and the guard test on the web asserts the same: you are not
  // offered next week's reveal while this week's score is still moving. A
  // member watching their duel on a Saturday afternoon must not have the screen
  // replaced by a countdown to Tuesday.
  //
  // ⚠ AND IT OUTRANKS THE RECAP TOO. A settled duel from last week is old news
  // next to a ball in play; the recap is not lost, it is waited for — the
  // marker is durable, so it fires the moment the football stops.
  if (current !== null && isInPlay && current.settledAt === null) {
    return {
      phase: 'live',
      matchweek: current.matchweek,
      opponentVisible: true,
      recapPending: false,
    };
  }

  // ---------------------------------------------------------------
  // 2. DECIDED (phase 5) — the recap, once.
  // ---------------------------------------------------------------
  // ⚠ ABOVE THE REVEAL, because both can be true at once and Ryan's sequence is
  // explicit that 5 comes before 6. Matchweek 3 settles on the Monday and
  // matchweek 4's draw opens 24 hours later (129) — so anybody who does not
  // open the app on the Monday has an unseen recap AND an unwatched walkout
  // waiting. Showing the walkout first would bury the result of a duel they
  // have not been told the end of.
  //
  // ⚠ BELOW LIVE, so dismissing it cannot strand a member on a finished week
  // while the next one is being played.
  if (recapPending) {
    return {
      phase: 'decided',
      matchweek: current?.matchweek ?? null,
      opponentVisible: true,
      recapPending: true,
    };
  }

  // ---------------------------------------------------------------
  // 3 & 4. REVEALABLE / SCOUTING (phases 2 and 3) — the open week.
  // ---------------------------------------------------------------
  // ⚠⚠ BEFORE THE SEALED BRANCH. THIS IS THE BUG THE WEB SHIPPED.
  //
  // These two branches describe DIFFERENT matchweeks. `current` is the week you
  // can act on; `sealedMatchweek` is the next one after it — and mid-season
  // there is ALWAYS a next sealed week. So a chain that asks "is anything
  // sealed?" first can never reach the walkout at all, for anyone, ever.
  //
  // No extra "is it revealed?" condition is needed here, and adding one would
  // be another copy of a rule that has already drifted three times (123, 127,
  // and the live mirror in poolCards.ts). RLS answers it upstream: migration
  // 116 withholds a sealed week's duel rows entirely, so `current` is simply
  // null while the week is sealed and this falls through on its own.
  if (current !== null && current.settledAt === null) {
    const watched = !isUnseen(current.revealsAt, input.revealSeenAt);
    return {
      phase: watched ? 'scouting' : 'revealable',
      matchweek: current.matchweek,
      // ⚠ The one place this is false. See `opponentVisible` above.
      opponentVisible: watched,
      recapPending: false,
    };
  }

  // ---------------------------------------------------------------
  // 5. SEALED (phases 1 and 6) — the wait.
  // ---------------------------------------------------------------
  if (sealedMatchweek !== null) {
    return {
      phase: 'sealed',
      matchweek: sealedMatchweek,
      opponentVisible: false,
      recapPending: false,
    };
  }

  // ---------------------------------------------------------------
  // Nothing left to wait for: the season is over, or this entry's duels are.
  // `current` may still hold the last settled bout, which is what the surface
  // shows — a finished record rather than a dead clock.
  // ---------------------------------------------------------------
  return {
    phase: current === null ? 'none' : 'decided',
    matchweek: current?.matchweek ?? null,
    opponentVisible: current !== null,
    recapPending: false,
  };
}

/**
 * Has `at` happened since the viewer last acknowledged this kind of thing?
 *
 * ⚠ THE SHAPE MIGRATION 122 CHOSE, AND FOR ITS REASON. Both markers are
 * TIMESTAMPS rather than matchweek numbers: rounds are played out of numerical
 * order — 101 measured a minimum gap of minus 121 days across three real
 * seasons — so a high-water mark on the number would stop a member ever being
 * shown another recap or another walkout, silently, for the rest of the season.
 *
 * It self-limits, too. Three weeks away means three settled duels behind you
 * and ONE sheet — the latest — because the test is "anything newer than what I
 * last saw", not a queue. That falls out of the comparison rather than needing
 * a rule.
 *
 * ⚠ A MISSING `at` IS "NOTHING TO SEE", NOT "SEE IT". Failing towards seen
 * means a member may miss one ceremony; failing the other way means every
 * member is shown the same one on every app open. See `PhaseDuel.revealsAt`.
 */
function isUnseen(at: string | null, seenAt: string | null): boolean {
  if (at === null) return false;
  const t = Date.parse(at);
  // `-infinity` (129's always-open first matchweek) and any malformed instant
  // land here. Never unseen — a week that was never sealed has no reveal to
  // watch, and a value we cannot read is not grounds for replaying a ceremony.
  if (Number.isNaN(t)) return false;
  if (seenAt === null) return true;
  const s = Date.parse(seenAt);
  if (Number.isNaN(s)) return true;
  return t > s;
}
