// =============================================================
// A player's line in one match
// =============================================================
// ⚠ PURE, so it can be tested: the vitest rule for `mobile/**` is that nothing
// under that glob may import `react-native`. The colours live here as hex
// rather than theme tokens for the same reason `FormCard` does it — these are
// filled badges carrying white text, and a token picked for a background is
// almost never dark enough to carry text on top of it.
// =============================================================

import { fromOklab, toOklab } from '@/lib/design/oklch';

/** One row of `match_player_stats`, as the app reads it. */
export type MatchPlayerStat = {
  side: 'home' | 'away';
  externalPlayerId: number;
  playerName: string;
  shirtNumber: number | null;
  position: string | null;
  isStarter: boolean;
  isCaptain: boolean;
  minutes: number | null;
  rating: number | null;
  goals: number | null;
  assists: number | null;
  shotsTotal: number | null;
  shotsOn: number | null;
  offsides: number | null;
  dribblesAttempts: number | null;
  dribblesSuccess: number | null;
  penaltyWon: number | null;
  penaltyScored: number | null;
  penaltyMissed: number | null;
  goalsConceded: number | null;
  saves: number | null;
  tacklesTotal: number | null;
  tacklesBlocks: number | null;
  interceptions: number | null;
  duelsTotal: number | null;
  duelsWon: number | null;
  dribbledPast: number | null;
  penaltyCommitted: number | null;
  penaltySaved: number | null;
  passesTotal: number | null;
  passesAccurate: number | null;
  keyPasses: number | null;
  foulsDrawn: number | null;
  foulsCommitted: number | null;
  yellowCards: number | null;
  redCards: number | null;
};

export type RatingBand = 'strong' | 'par' | 'poor';

/**
 * ⚠ THE THRESHOLDS COME FROM THE REAL DISTRIBUTION, NOT FROM INTUITION.
 * Measured over all 4,534 rated players in the five leagues on 2026-09-09:
 *
 *   under 6.0      184   4.1%   had a bad afternoon
 *   6.0 – 7.4    3,689  81.4%   the ordinary run of a match
 *   7.5 and up     661  14.6%   actually stood out
 *
 * Three bands rather than four, deliberately: two shades of green are not
 * distinguishable on a 22pt badge, and a scale nobody can read is decoration.
 * The badge exists to mark the outliers, and 15/81/4 is what that looks like.
 */
export const STRONG_FROM = 7.5;
export const POOR_BELOW = 6.0;

/**
 * ⚠ DARK FILLS, BECAUSE THE TEXT ON TOP IS WHITE AND SMALL. Measured:
 * #15803D 5.02:1, #475569 7.58:1, #B91C1C 6.47:1 against white — all clear of
 * the 4.5:1 that small text needs.
 *
 * ⚠ AND THEY ALL NEED THE HAIRLINE. The same measurement against the pitch
 * green is 1.6–2.6:1, so on the grass the badge would be a smudge. The white
 * border the shirt chip already carries is what separates it — the fill
 * carries the meaning, the border carries the edge.
 */
/**
 * The rating's own colour ramp: red at 1, deep green at 10.
 *
 * ⚠⚠ THE GREENS DARKEN AS THEY GO, AND THAT IS NOT A STYLE CHOICE. The badge
 * has no outline any more, so it has to separate from the grass by itself. A
 * mid-scale amber does that on HUE — orange against #417A57 is unmistakable
 * even though the two measure 1.01:1, because WCAG contrast is about text
 * legibility and says nothing about telling two shapes apart. The top of the
 * scale has no such luck: it is green on green, so it has to separate by
 * DARKNESS instead.
 *
 *   8.5  #166534  1.41:1 against the pitch
 *   10   #123D26  2.41:1
 *
 * A brighter green at the top (#15803D, 1.01:1) is the same lightness as the
 * grass and would dissolve into it.
 *
 * ⚠ EVERY STOP CARRIES WHITE TEXT AT 4.99:1 OR BETTER, so the label never has
 * to change colour partway up the scale.
 */
const RATING_STOPS: [number, string][] = [
  [1, '#A32118'],
  [3.5, '#C2410C'],
  [5.5, '#B45309'],
  [7, '#4D7C0F'],
  [8.5, '#166534'],
  [10, '#123D26'],
];

/**
 * A rating's colour, interpolated.
 *
 * ⚠ IN OKLAB, NOT RGB. A straight RGB blend from red to green passes through a
 * muddy grey-brown around the midpoint — exactly where most ratings live — and
 * the ramp would go slack in the one place it needs to discriminate.
 */
export function ratingScaleColor(rating: number | null | undefined): string | null {
  if (ratingBand(rating) === null) return null;
  const r = Math.max(1, Math.min(10, rating as number));

  let lo = RATING_STOPS[0];
  let hi = RATING_STOPS[RATING_STOPS.length - 1];
  for (let i = 0; i < RATING_STOPS.length - 1; i++) {
    if (r >= RATING_STOPS[i][0] && r <= RATING_STOPS[i + 1][0]) {
      lo = RATING_STOPS[i];
      hi = RATING_STOPS[i + 1];
      break;
    }
  }
  if (lo[0] === hi[0]) return lo[1];

  const t = (r - lo[0]) / (hi[0] - lo[0]);
  const a = toOklab(lo[1]);
  const b = toOklab(hi[1]);
  return fromOklab({
    L: a.L + (b.L - a.L) * t,
    a: a.a + (b.a - a.a) * t,
    b: a.b + (b.b - a.b) * t,
  });
}

/**
 * ⚠ STILL BANDED, AND ONLY FOR THE RATES. Pass accuracy and duels are compared
 * against everyone else in the player's position, which is a three-way verdict
 * — good, ordinary, poor — not a point on a continuous scale. The RATING is a
 * number out of ten and gets the ramp above; a percentile is not.
 */
export const RATING_COLOR: Record<RatingBand, string> = {
  strong: '#15803D',
  par: '#475569',
  poor: '#B91C1C',
};

/**
 * Which band a rating falls in, or null when there is no rating to show.
 *
 * ⚠ ZERO IS NOT A RATING. The mapper already nulls it — 0 is the provider's
 * "unrated", and every one of the 50 that arrived that way was a substitute who
 * did not play or a one-minute cameo. Guarded again here because this function
 * is what the UI asks, and a 0.0 rendered in red as "had a bad game" would be
 * a libel on a player who never came on.
 */
export function ratingBand(rating: number | null | undefined): RatingBand | null {
  if (rating === null || rating === undefined) return null;
  if (!Number.isFinite(rating) || rating <= 0) return null;
  if (rating >= STRONG_FROM) return 'strong';
  if (rating < POOR_BELOW) return 'poor';
  return 'par';
}

export function ratingColor(rating: number | null | undefined): string | null {
  const band = ratingBand(rating);
  return band ? RATING_COLOR[band] : null;
}

/** '7.0', not '7' — a rating with no decimal reads as a whole number of goals. */
export function formatRating(rating: number | null | undefined): string | null {
  const band = ratingBand(rating);
  if (!band) return null;
  return (rating as number).toFixed(1);
}

/** Provider id -> that player's line, for the pitch to look up as it draws. */
export function indexByPlayerId(stats: MatchPlayerStat[]): Map<number, MatchPlayerStat> {
  const out = new Map<number, MatchPlayerStat>();
  for (const s of stats) {
    if (typeof s.externalPlayerId === 'number' && s.externalPlayerId > 0) {
      out.set(s.externalPlayerId, s);
    }
  }
  return out;
}

export type StatGroup = { title: string; rows: { label: string; value: string }[] };

/**
 * ⚠ NULL RENDERS AS 0 FOR A COUNT, AND THAT IS CORRECT RATHER THAN LAZY. The
 * provider sends null, not 0, for a stat a player did not register — `shots`
 * was null on 560 of 800 sampled rows. A defender who took no shots really did
 * take none, so "0" is the true reading and a dash would imply we do not know.
 *
 * ⚠ THE EXCEPTIONS ARE `rating` AND `minutes`, where null means "did not play"
 * or "not assessed". Those are hidden, never zeroed.
 */
const n = (v: number | null | undefined) => String(v ?? 0);

/** Was this player actually on the pitch? An unused substitute has no line. */
export function didPlay(s: MatchPlayerStat): boolean {
  return (s.minutes ?? 0) > 0 || s.rating !== null;
}

/**
 * The stat line, grouped, ready to render.
 *
 * ⚠ GOALKEEPING ROWS ONLY FOR A GOALKEEPER. `Saves 0` under an outfielder is
 * noise that pushes the rows people came for off the screen — and a keeper's
 * `goals_conceded` is the one number on his card that matters, while an
 * outfielder's is meaningless (the feed fills it in for everyone).
 */
export function statGroups(s: MatchPlayerStat): StatGroup[] {
  const groups: StatGroup[] = [];

  if (s.position === 'G') {
    groups.push({
      title: 'Goalkeeping',
      rows: [
        { label: 'Saves', value: n(s.saves) },
        { label: 'Goals conceded', value: n(s.goalsConceded) },
        ...(s.penaltySaved ? [{ label: 'Penalties saved', value: n(s.penaltySaved) }] : []),
      ],
    });
  } else {
    groups.push({
      title: 'Attacking',
      rows: [
        { label: 'Goals', value: n(s.goals) },
        { label: 'Assists', value: n(s.assists) },
        { label: 'Shots', value: `${n(s.shotsOn)} on / ${n(s.shotsTotal)}` },
        { label: 'Offsides', value: n(s.offsides) },
      ],
    });
  }

  groups.push({
    title: 'Passing',
    rows: [
      // ⚠ ACCURATE OF TOTAL, NOT A PERCENTAGE. At player level the provider
      // sends a COUNT — 26 of 35 — where at team level it sends '83%'. Showing
      // it as "26%" would be wrong and entirely plausible-looking.
      { label: 'Passes', value: `${n(s.passesAccurate)} of ${n(s.passesTotal)}` },
      { label: 'Key passes', value: n(s.keyPasses) },
    ],
  });

  groups.push({
    title: 'Duels & defending',
    rows: [
      { label: 'Duels won', value: `${n(s.duelsWon)} of ${n(s.duelsTotal)}` },
      { label: 'Dribbles', value: `${n(s.dribblesSuccess)} of ${n(s.dribblesAttempts)}` },
      { label: 'Tackles', value: n(s.tacklesTotal) },
      { label: 'Interceptions', value: n(s.interceptions) },
      { label: 'Dribbled past', value: n(s.dribbledPast) },
    ],
  });

  const discipline = [
    { label: 'Fouls committed', value: n(s.foulsCommitted) },
    { label: 'Fouls won', value: n(s.foulsDrawn) },
  ];
  // Cards only when there were some. A row of zeros under every clean player
  // is the noise this list exists to avoid.
  if (s.yellowCards) discipline.push({ label: 'Yellow cards', value: n(s.yellowCards) });
  if (s.redCards) discipline.push({ label: 'Red cards', value: n(s.redCards) });
  groups.push({ title: 'Discipline', rows: discipline });

  return groups;
}

/**
 * The one-line summary under the name: minutes, and the badges that earned it.
 *
 * Kept separate from `statGroups` because it is the part a person reads without
 * meaning to, and it must stay short enough to be read at a glance.
 */
export function headlineParts(s: MatchPlayerStat, cameOnAt?: number | null): string[] {
  const parts: string[] = [];
  // ⚠ LABELLED, NOT JUST A PRIME MARK. `90'` beside a scoreline reads as the
  // minute something HAPPENED — it is exactly how the timeline writes a goal —
  // where here it is a duration. The word removes that, and it is also the one
  // number on this card the sheet can state honestly: the substitution minute
  // is only shown when the timeline corroborates it, but minutes PLAYED is
  // whatever the provider recorded, no inference involved.
  if (s.minutes !== null && s.minutes > 0) parts.push(`Minutes played ${s.minutes}`);
  if (s.goals) parts.push(s.goals === 1 ? '1 goal' : `${s.goals} goals`);
  if (s.assists) parts.push(s.assists === 1 ? '1 assist' : `${s.assists} assists`);
  if (s.position === 'G' && s.saves) parts.push(s.saves === 1 ? '1 save' : `${s.saves} saves`);
  // ⚠⚠ ONLY THE COMING-ON MINUTE IS NEW INFORMATION, and this is the whole
  // reason the sheet shows one and not the other. A starter who came off at 67
  // played 67 minutes — the substitution minute and the minutes played are the
  // SAME NUMBER, which is exactly why one corroborates the other, and printing
  // "Minutes played 67 · Off 67" says it twice. A substitute who came on at 67
  // played 23: two different numbers, and the entry minute cannot be got from
  // his row at all without the timeline.
  if (!s.isStarter) {
    if (cameOnAt !== null && cameOnAt !== undefined && didPlay(s)) {
      parts.push(`Came on ${cameOnAt}'`);
    } else if (didPlay(s)) {
      parts.push('substitute');
    } else {
      // He was named and never used. Worth saying plainly rather than leaving
      // a card with nothing on it but a name.
      parts.push('unused substitute');
    }
  }
  return parts;
}

/**
 * Where the provider keeps this player's photograph.
 *
 * ⚠⚠ DERIVED, NOT STORED, AND THAT IS THE WHOLE DESIGN. Measured across 958
 * player entries in three competitions on 2026-09-09: every single `photo` in
 * the feed was exactly
 *   https://media.api-sports.io/football/players/<player.id>.png
 * — 958 of 958. Adding a `photo_url` column would store the same derivable
 * string 6,312 times and give it a second chance to go stale.
 *
 * ⚠ THE ONLY ENTRIES WITH NO PHOTO WERE THE id-0 SENTINELS, which the mapper
 * already refuses. So a stored player always has a photograph.
 *
 * ⚠ AND THE IMAGES COST NO QUOTA. `media.api-sports.io` is not the API host:
 * ten image fetches left the daily counter unmoved at 177, and no key is sent
 * with them. The app already hotlinks this exact CDN for club crests — a
 * `flagUrl` is `/football/teams/<id>.png` from the same place.
 */
export function playerPhotoUrl(externalPlayerId: number | null | undefined): string | null {
  if (typeof externalPlayerId !== 'number' || externalPlayerId <= 0) return null;
  if (!Number.isInteger(externalPlayerId)) return null;
  return `https://media.api-sports.io/football/players/${externalPlayerId}.png`;
}

/** What to draw around a player's circle. Everything here is on his own row. */
export type PlayerMarkers = {
  goals: number;
  assists: number;
  /**
   * ⚠ COUNTS, NOT FLAGS, because the badges stack. A second yellow IS a red in
   * football, and the feed reports both — so a sent-off player reads
   * `yellow: 2, red: 1`, and drawing all three is the true account of his
   * afternoon rather than a summary of it.
   */
  yellow: number;
  red: number;
  captain: boolean;
  cameOn: boolean;
  cameOff: boolean;
};

/**
 * How far the match has got. Every "he left early" judgement is made against
 * this, and getting it wrong is not a cosmetic error — see `leftBefore`.
 */
export type MatchProgress = {
  /**
   * The minute the match has reached — `league_fixtures.live_minute`, which is
   * api-football's `elapsed`. Null while live before the feed reports one.
   *
   * ⚠ It HOLDS at 45 through half time and all of first-half stoppage, and it
   * counts 91→120 in extra time. It is the minute the match is at, not the
   * minute a clock would show.
   */
  minute: number | null;
  /** True only while the match is actually running. */
  isLive: boolean;
};

/** A finished match — the only frame that existed before lineups went live. */
export const FULL_TIME: MatchProgress = { minute: 90, isLive: false };

/**
 * ⚠⚠ THE LAG GUARD. `minutes` (from `/players`) and `live_minute` (from
 * `/fixtures`) are two different feeds refreshed by two different syncs, and
 * this file already measures them disagreeing by a minute in 9.6% of cases. So
 * a player still on the pitch routinely reports 68 while the match says 69.
 *
 * Comparing them exactly would therefore put a substitution arrow on whoever
 * the stats feed happened to lag on — a wrong badge that appears and vanishes
 * as the syncs leapfrog. Two minutes is wide enough to absorb the observed
 * disagreement and still catch a real substitution, which is minutes off the
 * pace within seconds of happening.
 */
const LIVE_LAG_MINUTES = 2;

/**
 * The minute before which leaving means "he was substituted".
 *
 * ⚠⚠ THIS IS THE WHOLE FIX FOR THE LIVE PITCH. It used to be the constant 90,
 * which reads "a starter who played under 90 minutes came off" — true at full
 * time, and catastrophic at 69 minutes of a running match, where it put a
 * substitution arrow on ALL ELEVEN starters because none of them had reached 90
 * yet. The inference was written for a finished match and nothing told it the
 * match was still going.
 *
 * ⚠ NO MINUTE YET MEANS NO CLAIM. Live with a null minute returns 0, so nobody
 * is marked. An arrow on everyone is far worse than an arrow on nobody: the
 * first is a confident lie, the second is visibly just "not known yet".
 */
function leftBefore(progress: MatchProgress): number {
  if (!progress.isLive) return progress.minute ?? 90;
  if (progress.minute == null) return 0;
  return Math.max(0, progress.minute - LIVE_LAG_MINUTES);
}

/**
 * ⚠⚠ THE SUBSTITUTION ARROW IS INFERRED, AND THE MINUTE DELIBERATELY IS NOT.
 * There is no join between a player and the timeline: `match_events` carries
 * abbreviated names from `/events` ("S. Ajayi") while these rows carry full
 * names from `/players`, and an event has no player id at all — measured, the
 * two match ZERO rows.
 *
 * `is_starter` and `minutes` give the ARROW with certainty. They do NOT give
 * the minute: a starter's `minutes` equals a real substitution minute in only
 * 1,255 of 1,497 cases — 83.8% — because added time is not counted the same
 * way on both sides. A minute printed beside a face that is wrong one time in
 * six is worse than no minute, so the sheet shows "minutes played", which is
 * what the number actually is.
 *
 * ⚠ A SENDING-OFF IS NOT A SUBSTITUTION. A red card also ends a player's match
 * early, and drawing him with a substitution arrow would say something false
 * about why he left.
 */
export function playerMarkers(
  s: MatchPlayerStat,
  progress: MatchProgress = FULL_TIME,
): PlayerMarkers {
  const minutes = s.minutes ?? 0;
  const red = s.redCards ?? 0;
  return {
    goals: s.goals ?? 0,
    assists: s.assists ?? 0,
    yellow: s.yellowCards ?? 0,
    red,
    captain: s.isCaptain,
    cameOn: !s.isStarter && minutes > 0,
    cameOff: s.isStarter && minutes > 0 && minutes < leftBefore(progress) && red === 0,
  };
}

/**
 * A side's average rating — the number the reference app puts beside the badge.
 *
 * ⚠ OVER THE PLAYERS WHO PLAYED, not over the squad. Including the unused
 * substitutes would mean averaging in eight absences, and they have no rating
 * to average anyway. Null when nobody has been rated yet, which is every
 * minute before kickoff.
 */
export function teamRating(stats: MatchPlayerStat[], side: 'home' | 'away'): number | null {
  const rated = stats.filter((s) => s.side === side && ratingBand(s.rating) !== null);
  if (rated.length === 0) return null;
  const mean = rated.reduce((t, s) => t + (s.rating as number), 0) / rated.length;
  return Math.round(mean * 10) / 10;
}

/**
 * The minute a player came off — but only when the timeline agrees.
 *
 * ⚠⚠ TWO SOURCES, AND NEITHER IS ENOUGH ALONE. There is no join between a
 * player and the timeline: `match_events` carries abbreviated names from
 * `/events` and no player id, and abbreviating our full names to match hits
 * only 71% (measured — the provider does not always use first-initial-surname).
 * Meanwhile a starter's `minutes` is his exit minute by definition, but the
 * provider counts stoppage time differently on the two feeds:
 *
 *   exact                84.5%
 *   out by one minute     9.6%
 *   out by 20-35 minutes  5.9%   <- early substitutions, and simply wrong
 *
 * So `minutes` PROPOSES and the timeline CONFIRMS: the minute is shown only
 * when a substitution actually happened at exactly that minute in this fixture.
 * That is 84.5% of players wearing a verified minute and the rest wearing the
 * arrow alone — and never, at any point, a minute we made up.
 */
export function subMinute(
  s: MatchPlayerStat,
  substitutionMinutes: ReadonlySet<number>,
  progress: MatchProgress = FULL_TIME,
): number | null {
  const m = playerMarkers(s, progress);
  const minutes = s.minutes;
  if (minutes === null || minutes <= 0) return null;

  // He started, so the minute he left IS the time he was on for.
  if (m.cameOff) return substitutionMinutes.has(minutes) ? minutes : null;

  // ⚠ HE CAME ON, SO IT IS THE OTHER WAY ROUND: the match length less the time
  // he played. Corroborated exactly the same way and measured just as well —
  // 1,085 of 1,347 substitutes, 80.5%, against 84.5% for the ones going off.
  //
  // ⚠⚠ AND IT IS THE MATCH'S CURRENT MINUTE, NOT 90, OR IT IS WRONG ALL GAME.
  // A substitute who came on at 60 has played 9 minutes when the match is at
  // 69; against a hardcoded 90 that implies he entered at 81. Every live
  // substitute wore a minute that was too late by exactly the time left.
  //
  // ⚠ NO LAG GUARD HERE, DELIBERATELY. `leftBefore` needs one because it
  // decides a boolean from a near-miss comparison; this needs an exact number,
  // and the timeline corroboration below is already the guard — an implied
  // minute that is off by the feeds' disagreement simply fails to match a real
  // substitution and shows nothing, which is the documented fallback.
  if (m.cameOn) {
    const implied = (progress.minute ?? 90) - minutes;
    return implied > 0 && substitutionMinutes.has(implied) ? implied : null;
  }
  return null;
}


// =============================================================
// Derived rates, and what counts as good
// =============================================================
// ⚠⚠ POSITION IS NOT A DETAIL HERE, IT IS THE WHOLE THING. Measured over 6,312
// player rows, median pass accuracy by position:
//
//   defender 88%   midfielder 86%   forward 80%   goalkeeper 71%
//
// A striker passing at 80% had an ordinary afternoon; a defender passing at 80%
// was in the bottom 15% of every defender in five leagues. One set of
// thresholds would praise the first and say nothing about the second, which is
// worse than showing no colour at all.
//
// ⚠ THE BANDS ARE THE 15th AND 85th PERCENTILES of players who actually did
// enough of the thing to be measured — the same shape as the rating bands, and
// for the same reason: the colour marks the outliers rather than grading
// everyone against a number somebody made up.
// =============================================================

/** Below these, a percentage is noise rather than a rate. */
export const MIN_FOR_RATE = {
  passes: 10,
  duels: 5,
  dribbles: 3,
  shots: 2,
  saves: 2,
} as const;

type Band = { low: number; high: number };
const BY_POSITION: Record<string, { pass: Band; duel: Band }> = {
  G: { pass: { low: 54, high: 87 }, duel: { low: 30, high: 70 } },
  D: { pass: { low: 78, high: 94 }, duel: { low: 38, high: 77 } },
  M: { pass: { low: 74, high: 93 }, duel: { low: 30, high: 67 } },
  F: { pass: { low: 64, high: 90 }, duel: { low: 25, high: 63 } },
};
/** An unknown position gets the midfielder's, the most central of the four. */
const FALLBACK = BY_POSITION.M;

/** Dribbling barely moves by position (p15 25-33, p85 75-78), so one band. */
const DRIBBLE: Band = { low: 30, high: 76 };
/** A keeper's save rate. p15 50, p50 67, p85 100 over 250 keeper-matches. */
const SAVE: Band = { low: 50, high: 100 };

/**
 * Which raw row each rate makes redundant.
 *
 * ⚠ A RATE CARRIES ITS OWN COUNTS — "Pass accuracy · 26 of 28 · 93%" — so
 * leaving "Passes 26 of 28" in the list below prints the same fact twice, a few
 * hundred points apart, and makes the sheet longer for nothing. The mapping
 * lives here rather than in the component so the two lists cannot drift.
 *
 * ⚠ ONLY WHEN THE RATE ACTUALLY APPEARS. Below the volume threshold there is no
 * rate, and the raw row is then the only place the fact is recorded.
 */
export const RATE_COVERS: Record<string, string> = {
  'Pass accuracy': 'Passes',
  'Shot accuracy': 'Shots',
  'Duels won': 'Duels won',
  'Dribble success': 'Dribbles',
};

export type Rate = {
  /**
   * ⚠ WHICH SECTION IT BELONGS IN. The rates used to sit in a block of their
   * own above everything else, which meant a reader looking for passing found
   * the accuracy in one place and the key passes in another. A rate is the
   * headline of its own section, not a separate topic.
   */
  section: string;
  label: string;
  /** 0-100, already rounded. */
  pct: number;
  detail: string;
  band: RatingBand | null;
};

function bandFor(pct: number, b: Band): RatingBand {
  if (pct >= b.high) return 'strong';
  if (pct < b.low) return 'poor';
  return 'par';
}

const pct = (a: number, b: number) => Math.round((a / b) * 100);

/**
 * The rates worth showing for this player, in reading order.
 *
 * ⚠ A RATE NEEDS A DENOMINATOR WORTH DIVIDING BY. "1 of 1 = 100%" is not a
 * shooting accuracy, it is one shot. Below `MIN_FOR_RATE` the row is omitted
 * entirely and the raw counts in the list below still say what happened.
 *
 * ⚠ SHOT ACCURACY IS SHOWN BUT NEVER COLOURED. At two or three shots the
 * measured 85th percentile is 100% for every position on the pitch — which
 * means the band would be telling you about the sample size rather than the
 * player.
 */
export function playerRates(s: MatchPlayerStat): Rate[] {
  const out: Rate[] = [];
  const pos = BY_POSITION[s.position ?? ''] ?? FALLBACK;

  if ((s.passesTotal ?? 0) >= MIN_FOR_RATE.passes && s.passesAccurate !== null) {
    const v = pct(s.passesAccurate, s.passesTotal as number);
    out.push({
      section: 'Passing',
      label: 'Pass accuracy',
      pct: v,
      detail: `${s.passesAccurate} of ${s.passesTotal}`,
      band: bandFor(v, pos.pass),
    });
  }

  if (s.position === 'G') {
    const faced = (s.saves ?? 0) + (s.goalsConceded ?? 0);
    if (faced >= MIN_FOR_RATE.saves) {
      const v = pct(s.saves ?? 0, faced);
      out.push({
        section: 'Goalkeeping',
      label: 'Save rate',
        pct: v,
        detail: `${s.saves ?? 0} of ${faced} faced`,
        band: bandFor(v, SAVE),
      });
    }
  }

  if ((s.shotsTotal ?? 0) >= MIN_FOR_RATE.shots && s.shotsOn !== null) {
    const v = pct(s.shotsOn, s.shotsTotal as number);
    out.push({
      section: 'Attacking',
      label: 'Shot accuracy',
      pct: v,
      detail: `${s.shotsOn} on target of ${s.shotsTotal}`,
      band: null,
    });
  }

  if ((s.duelsTotal ?? 0) >= MIN_FOR_RATE.duels && s.duelsWon !== null) {
    const v = pct(s.duelsWon, s.duelsTotal as number);
    out.push({
      section: 'Duels & defending',
      label: 'Duels won',
      pct: v,
      detail: `${s.duelsWon} of ${s.duelsTotal}`,
      band: bandFor(v, pos.duel),
    });
  }

  if ((s.dribblesAttempts ?? 0) >= MIN_FOR_RATE.dribbles && s.dribblesSuccess !== null) {
    const v = pct(s.dribblesSuccess, s.dribblesAttempts as number);
    out.push({
      section: 'Duels & defending',
      label: 'Dribble success',
      pct: v,
      detail: `${s.dribblesSuccess} of ${s.dribblesAttempts}`,
      band: bandFor(v, DRIBBLE),
    });
  }

  return out;
}

/**
 * `'F'` → `'Forward'`.
 *
 * ⚠ THE FEED ONLY EVER SENDS FOUR. Measured across 6,312 rows: G, D, M and F,
 * with nothing else and no nulls except the id-0 placeholders the mapper drops.
 * An unknown letter returns null rather than being shown raw — "Player · ST"
 * reads as a bug, and the position is decoration on a card that already names
 * the man.
 */
export function positionName(pos: string | null | undefined): string | null {
  switch (pos) {
    case 'G':
      return 'Goalkeeper';
    case 'D':
      return 'Defender';
    case 'M':
      return 'Midfielder';
    case 'F':
      return 'Forward';
    default:
      return null;
  }
}

/**
 * Is this stat value nothing at all?
 *
 * ⚠⚠ A ZERO IS NOT THE SAME KIND OF FACT AS A NUMBER, and the sheet was giving
 * them identical weight. Most rows on most players ARE zero — a defender's
 * shots, a striker's tackles — so a column of equally-black numerals buries the
 * three or four that say something under a dozen that do not. Dimming the
 * zeros is not decoration; it is what makes the rest findable at a glance.
 *
 * ⚠ IT READS THE LEADING NUMBER, so "0 of 5" is empty and "4 of 5" is not. The
 * qualifier after it is context, never the fact.
 */
export function statIsZero(value: string): boolean {
  const lead = /^-?\d+/.exec(value.trim());
  return lead !== null && Number(lead[0]) === 0;
}
