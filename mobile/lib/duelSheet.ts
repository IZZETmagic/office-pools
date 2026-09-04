import { getLiveClock } from './matchStatus';

// =============================================================
// THE TEAM SHEET — both sides' picks, fixture by fixture
// =============================================================
// The card that replaces "What it will be decided on" the moment a matchweek
// locks. Before lock it is a list of games; after lock it is the duel itself,
// because both sheets are open and every row is a small contest.
//
// ⚠ PURE, AND THAT IS THE POINT. The web's equivalent lives inline in a 2,600
// line component and its comments record three separate bugs in exactly this
// rule — each of which shipped, and each of which is a two-line test here.
// `mobile/` has no test runner; the root `vitest.config.ts` picks up
// `mobile/**/__tests__/**` for any module that imports nothing from React
// Native, which is why this file imports one pure helper and no more.

/**
 * Who took a fixture, in the duel.
 *
 * ⚠ NAMED FOR THE FIXTURE, NOT FOR THE VIEWER. The web shipped this as
 * `'won' | 'lost'` and the opponent's chip rendered the viewer's value flipped
 * — so `lost`, which ALSO means "different picks, neither of us scored",
 * inverted into a tick on their side. A 0-0 nobody predicted showed as the
 * opponent taking the fixture.
 *
 * `neither` is therefore a state in its own right, and no chip flips anything:
 * each one asks whether it is the winner.
 */
export type FixtureOutcome = 'same' | 'you' | 'them' | 'neither' | 'pending';

/** Who won the MATCH — a different question from who took the fixture. */
export type MatchResult = 'home' | 'away' | 'draw' | null;

/** A fixture, in the shape the season payload carries it. */
export type SheetFixture = {
  /** ⚠ `match_number` IS `league_fixtures.fixture_number` — it restarts at 1
   *  every matchweek and it is what the live payload keys on. */
  number: number;
  id: string;
  homeName: string | null;
  awayName: string | null;
  /** ⚠ THE ONLY LABEL THAT FITS ON A PHONE. Two pick chips and a scoreline
   *  leave about 75pt a side; "Crystal Palace" is not going in it, and a
   *  clipped "Crystal Pal…" is strictly worse than "CRY" beside the crest. */
  homeAbbr: string | null;
  awayAbbr: string | null;
  homeCrest: string | null;
  awayCrest: string | null;
  kickoffAt: string | null;
  /** Full-time score from the season payload — the fallback when no live row. */
  homeScoreFt: number | null;
  awayScoreFt: number | null;
  isCompletedFt: boolean;
};

/** The live half, keyed by fixture number. */
export type SheetLive = {
  homeScore: number | null;
  awayScore: number | null;
  status: string | null;
  isCompleted: boolean;
  liveMinute: number | null;
  livePeriod: string | null;
  liveAdded: number | null;
};

export type SheetRow = {
  number: number;
  id: string;
  homeName: string | null;
  awayName: string | null;
  homeAbbr: string | null;
  awayAbbr: string | null;
  homeCrest: string | null;
  awayCrest: string | null;
  homeScore: number | null;
  awayScore: number | null;
  /** Bold the winner, fade the loser. ⚠ Full time only — see below. */
  result: MatchResult;
  outcome: FixtureOutcome;
  /** True once the engine has written a score row for this fixture. */
  scored: boolean;
  isCompleted: boolean;
  mine: number;
  theirs: number;
  myPick: string | null;
  theirPick: string | null;
  /** "67'", "HT", "ET 104'" — or null when no ball is in play. */
  clock: string | null;
  kickoffAt: string | null;
};

export type BuildSheetInput = {
  fixtures: SheetFixture[];
  /** Live rows by fixture number. Empty before the first `/duel-live` lands. */
  live: Map<number, SheetLive>;
  /** Your points this matchweek, by fixture number. */
  mine: Map<number, number>;
  /** Theirs. Empty when the duel is a bye. */
  theirs: Map<number, number>;
  /**
   * One member's pick for one fixture, as a short label — "HOME" at Results
   * depth, "2-1" at Scores depth.
   *
   * ⚠ NULL MEANS NOT REVEALED **OR** NEVER PICKED, and those are deliberately
   * indistinguishable here. Nothing on this card may tell them apart, because
   * telling them apart is what the reveal gate exists to prevent.
   */
  label: (entryId: string, fixtureId: string) => string | null;
  youEntry: string;
  themEntry: string | null;
};

/**
 * Merge the season's fixtures with the live payload into one row per fixture.
 *
 * ⚠ LIVE WINS WHERE IT EXISTS, AND FALLS BACK WHERE IT DOES NOT. The season
 * payload is a page-load snapshot: correct for a finished game, frozen at
 * kickoff for a running one. The live payload is fresh but only arrives after
 * the first fetch, so reading it alone renders an empty sheet for a second.
 */
export function buildSheet(input: BuildSheetInput): SheetRow[] {
  const { fixtures, live, mine, theirs, label, youEntry, themEntry } = input;

  return fixtures.map((f) => {
    const l = live.get(f.number) ?? null;

    const homeScore = l ? l.homeScore : f.homeScoreFt;
    const awayScore = l ? l.awayScore : f.awayScoreFt;
    const isCompleted = l ? l.isCompleted : f.isCompletedFt;

    const clock = l
      ? getLiveClock({
          status: l.status,
          livePeriod: l.livePeriod,
          liveMinute: l.liveMinute,
          liveAdded: l.liveAdded,
        })
      : null;

    // ⚠ SCORED MEANS A ROW EXISTS, not that the clock says the game is over.
    // The engine writes the row; until it does there is nothing to compare, and
    // absent is not nil-nil.
    const scored = mine.has(f.number) || theirs.has(f.number);
    const mineP = mine.get(f.number) ?? 0;
    const theirsP = theirs.get(f.number) ?? 0;

    const myPick = label(youEntry, f.id);
    const theirPick = themEntry ? label(themEntry, f.id) : null;

    const outcome: FixtureOutcome = !scored
      ? // ⚠ `pending` MEANS NOT STARTED, and a match being played is not that.
        // Until a score row exists nobody can be shown ahead — but "nobody is
        // ahead" is `neither`, which is grey, not the dashed outline that says
        // the game has not kicked off. A dashed chip beside a running clock was
        // claiming the match had not started while the minute ticked next to it.
        clock !== null
        ? 'neither'
        : 'pending'
      : myPick !== null && theirPick !== null && myPick === theirPick
        ? 'same'
        : mineP > theirsP
          ? 'you'
          : theirsP > mineP
            ? 'them'
            : 'neither';

    return {
      number: f.number,
      id: f.id,
      homeName: f.homeName,
      awayName: f.awayName,
      homeAbbr: f.homeAbbr,
      awayAbbr: f.awayAbbr,
      homeCrest: f.homeCrest,
      awayCrest: f.awayCrest,
      homeScore,
      awayScore,
      /**
       * ⚠ AT FULL TIME ONLY. This bolds one club and fades the other, and doing
       * that to a match still being played states an outcome the game has not
       * reached: a live 0-0 read as a settled draw would grey BOTH clubs out at
       * the moment they are the most interesting thing on the card, and 1-0 at
       * 12 minutes would fade the side that goes on to win 3-1.
       */
      result:
        !isCompleted || homeScore === null || awayScore === null
          ? null
          : homeScore > awayScore
            ? 'home'
            : awayScore > homeScore
              ? 'away'
              : 'draw',
      outcome,
      scored,
      isCompleted,
      mine: mineP,
      theirs: theirsP,
      myPick,
      theirPick,
      clock,
      kickoffAt: f.kickoffAt,
    };
  });
}

/** How many fixtures the engine has not scored yet. */
export function remainingFixtures(rows: SheetRow[]): number {
  return rows.filter((r) => !r.scored).length;
}

/**
 * Is a match being played AT THIS MOMENT — as opposed to the matchweek merely
 * being in progress?
 *
 * ⚠ THEY ARE DIFFERENT STATES and the difference is the whole reason the LIVE
 * dot only pulses sometimes. Matchweek 3 is "in progress" from Friday's kickoff
 * until Monday night, but for most of that window no ball is in play. A dot
 * pulsing through Sunday morning claims something untrue, and one that pulsed
 * from Friday to Monday would mean nothing by Saturday at 3pm.
 */
export function anyFixtureLive(rows: SheetRow[]): boolean {
  return rows.some((r) => r.clock !== null);
}

/**
 * What the sheet MEANS, in a sentence.
 *
 * Agreements cannot separate two members by definition, so the duel is only
 * ever the divergences — which is both the honest reading and the interesting
 * one. Null until the gate has released at least one side's picks.
 */
export function sheetSummary(rows: SheetRow[]): string | null {
  const revealed = rows.some((r) => r.myPick !== null || r.theirPick !== null);
  if (!revealed || rows.length === 0) return null;

  const differ = rows.filter((r) => r.myPick && r.theirPick && r.myPick !== r.theirPick);
  const same = rows.length - differ.length;
  if (differ.length === 0) return `Identical sheets — all ${rows.length} picks the same.`;

  const names = differ.slice(0, 3).map((d) => d.homeName ?? 'TBD');
  const tail = differ.length > 3 ? ` and ${differ.length - 3} more` : '';
  return `${same} of ${rows.length} are dead heat. This duel is ${names.join(', ')}${tail}.`;
}

export type Verdict =
  | { safe: true; leader: 'you' | 'them'; lead: number }
  | { safe: false; lead: number; deciders: number };

/**
 * Is the live duel already decided?
 *
 * A fixture is worth at most what has actually been PAID OUT on this sheet,
 * rather than a constant — Results and Scores depths price differently and
 * nothing here is told which it is sitting over. If the lead is bigger than
 * everything still to come, it is over: a knockout, called while the last game
 * is still to be played.
 */
export function duelVerdict(
  rows: SheetRow[],
  youPoints: number,
  themPoints: number,
): Verdict | null {
  if (rows.length === 0) return null;
  const maxPerFixture = Math.max(...rows.map((r) => Math.max(r.mine, r.theirs)), 0);
  if (maxPerFixture === 0) return null;

  const remaining = remainingFixtures(rows);
  const lead = Math.abs(youPoints - themPoints);
  if (lead > remaining * maxPerFixture) {
    return { safe: true, leader: youPoints > themPoints ? 'you' : 'them', lead };
  }
  return { safe: false, lead, deciders: remaining };
}
