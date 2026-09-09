// =============================================================
// A player's line in one match
// =============================================================
// ⚠ PURE, so it can be tested: the vitest rule for `mobile/**` is that nothing
// under that glob may import `react-native`. The colours live here as hex
// rather than theme tokens for the same reason `FormCard` does it — these are
// filled badges carrying white text, and a token picked for a background is
// almost never dark enough to carry text on top of it.
// =============================================================

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
export function headlineParts(s: MatchPlayerStat): string[] {
  const parts: string[] = [];
  if (s.minutes !== null && s.minutes > 0) parts.push(`${s.minutes}'`);
  if (s.goals) parts.push(s.goals === 1 ? '1 goal' : `${s.goals} goals`);
  if (s.assists) parts.push(s.assists === 1 ? '1 assist' : `${s.assists} assists`);
  if (s.position === 'G' && s.saves) parts.push(s.saves === 1 ? '1 save' : `${s.saves} saves`);
  if (!s.isStarter) parts.push('substitute');
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
export function playerMarkers(s: MatchPlayerStat, fullMatchMinutes = 90): PlayerMarkers {
  const minutes = s.minutes ?? 0;
  const red = s.redCards ?? 0;
  return {
    goals: s.goals ?? 0,
    assists: s.assists ?? 0,
    yellow: s.yellowCards ?? 0,
    red,
    captain: s.isCaptain,
    cameOn: !s.isStarter && minutes > 0,
    cameOff: s.isStarter && minutes > 0 && minutes < fullMatchMinutes && red === 0,
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
  fullMatchMinutes = 90,
): number | null {
  const m = playerMarkers(s, fullMatchMinutes);
  if (!m.cameOff) return null;
  const minutes = s.minutes;
  if (minutes === null || minutes <= 0) return null;
  return substitutionMinutes.has(minutes) ? minutes : null;
}
