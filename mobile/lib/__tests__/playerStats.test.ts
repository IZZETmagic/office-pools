// =============================================================
// A player's line in one match
// =============================================================
// The two things that can go wrong here are both invisible on a screenshot:
//
//   · a rating of 0 rendered in red, which accuses a substitute who never came
//     on of having played badly;
//   · `passes_accurate` shown as a percentage, which is the trap the column
//     name and migration 141's CHECK both exist to stop and which would read
//     as entirely plausible.
// =============================================================

import { describe, expect, it } from 'vitest';

import {
  didPlay,
  formatRating,
  headlineParts,
  indexByPlayerId,
  POOR_BELOW,
  RATING_COLOR,
  ratingBand,
  ratingColor,
  statGroups,
  STRONG_FROM,
  type MatchPlayerStat,
} from '../playerStats';

function player(over: Partial<MatchPlayerStat> = {}): MatchPlayerStat {
  return {
    side: 'home',
    externalPlayerId: 1,
    playerName: 'A Player',
    shirtNumber: 9,
    position: 'F',
    isStarter: true,
    isCaptain: false,
    minutes: 90,
    rating: 7,
    goals: null, assists: null, shotsTotal: null, shotsOn: null, offsides: null,
    dribblesAttempts: null, dribblesSuccess: null, penaltyWon: null,
    penaltyScored: null, penaltyMissed: null, goalsConceded: null, saves: null,
    tacklesTotal: null, tacklesBlocks: null, interceptions: null,
    duelsTotal: null, duelsWon: null, dribbledPast: null,
    penaltyCommitted: null, penaltySaved: null, passesTotal: null,
    passesAccurate: null, keyPasses: null, foulsDrawn: null,
    foulsCommitted: null, yellowCards: null, redCards: null,
    ...over,
  };
}

describe('ratingBand — thresholds taken from the real distribution', () => {
  it('the bands are where the data put them', () => {
    // 15% strong / 81% par / 4% poor, over 4,534 rated players.
    expect(STRONG_FROM).toBe(7.5);
    expect(POOR_BELOW).toBe(6);
  });

  it('sorts a rating into its band', () => {
    expect(ratingBand(9.6)).toBe('strong');
    expect(ratingBand(7.5)).toBe('strong');
    expect(ratingBand(7.4)).toBe('par');
    expect(ratingBand(6.8)).toBe('par');
    expect(ratingBand(6.0)).toBe('par');
    expect(ratingBand(5.9)).toBe('poor');
    expect(ratingBand(3.0)).toBe('poor');
  });

  it('⚠⚠ a rating of 0 is NOT a bad game — it is no rating at all', () => {
    // 50 rows arrived rated 0 on the first backfill and not one was an
    // assessment: 44 never played, the rest were one-minute cameos. Rendering
    // that in red would accuse a substitute of a bad performance he never had.
    expect(ratingBand(0)).toBeNull();
    expect(ratingColor(0)).toBeNull();
    expect(formatRating(0)).toBeNull();
  });

  it('has nothing to say about an absent rating', () => {
    expect(ratingBand(null)).toBeNull();
    expect(ratingBand(undefined)).toBeNull();
    expect(ratingBand(NaN)).toBeNull();
    expect(ratingColor(null)).toBeNull();
  });

  it('every band has a colour, and they are all distinct', () => {
    const used = new Set(Object.values(RATING_COLOR));
    expect(used.size).toBe(3);
    expect(ratingColor(8.2)).toBe(RATING_COLOR.strong);
    expect(ratingColor(6.5)).toBe(RATING_COLOR.par);
    expect(ratingColor(4.9)).toBe(RATING_COLOR.poor);
  });

  it('⚠ formats to one decimal — "7" reads as a number of goals', () => {
    // The column is numeric(3,1), so a value always arrives with one decimal
    // already; this is about the ones that arrive as a whole number.
    expect(formatRating(7)).toBe('7.0');
    expect(formatRating(10)).toBe('10.0');
    expect(formatRating(6.9)).toBe('6.9');
    // ⚠ NOT A ROUNDING HELPER. `(6.85).toFixed(1)` is '6.8', because 6.85 in
    // binary is 6.8499…; caught by this test expecting otherwise. It does not
    // matter here — numeric(3,1) never sends a second decimal — but anyone
    // reaching for this function to round something else should know.
    expect(formatRating(6.85)).toBe('6.8');
  });
});

describe('statGroups', () => {
  it('⚠⚠ passes read as "accurate of total", never as a percentage', () => {
    // Bernd Leno's real line: 35 attempted, 26 completed. Shown as "26%" this
    // would look like a plausible — and badly wrong — passing accuracy.
    const g = statGroups(player({ passesTotal: 35, passesAccurate: 26 }));
    const passes = g.find((x) => x.title === 'Passing')!.rows[0];
    expect(passes.value).toBe('26 of 35');
    expect(passes.value).not.toContain('%');
  });

  it('⚠ a null count renders as 0, because that is what it means', () => {
    // The provider sends null rather than 0 for a stat not registered. A
    // defender who took no shots really took none.
    const g = statGroups(player());
    const shots = g.find((x) => x.title === 'Attacking')!.rows.find((r) => r.label === 'Shots')!;
    expect(shots.value).toBe('0 on / 0');
  });

  it('⚠ a goalkeeper gets goalkeeping rows and no attacking ones', () => {
    const g = statGroups(player({ position: 'G', saves: 4, goalsConceded: 1 }));
    expect(g.map((x) => x.title)).toContain('Goalkeeping');
    expect(g.map((x) => x.title)).not.toContain('Attacking');
    const gk = g.find((x) => x.title === 'Goalkeeping')!;
    expect(gk.rows.find((r) => r.label === 'Saves')!.value).toBe('4');
  });

  it('⚠ an outfielder gets no "Saves 0" row', () => {
    // The feed fills goals_conceded in for everyone; showing it under a striker
    // pushes the rows people came for off the screen.
    const g = statGroups(player({ position: 'F' }));
    expect(g.map((x) => x.title)).not.toContain('Goalkeeping');
  });

  it('cards appear only when there were some', () => {
    const clean = statGroups(player()).find((x) => x.title === 'Discipline')!;
    expect(clean.rows.map((r) => r.label)).not.toContain('Yellow cards');
    const booked = statGroups(player({ yellowCards: 1 })).find((x) => x.title === 'Discipline')!;
    expect(booked.rows.find((r) => r.label === 'Yellow cards')!.value).toBe('1');
  });

  it('every group has at least one row', () => {
    for (const g of statGroups(player())) expect(g.rows.length).toBeGreaterThan(0);
  });
});

describe('headlineParts', () => {
  it('reads as a sentence a person would say', () => {
    expect(headlineParts(player({ minutes: 90, goals: 2, assists: 1 })))
      .toEqual(["90'", '2 goals', '1 assist']);
  });

  it('singular and plural are both right', () => {
    expect(headlineParts(player({ goals: 1 }))).toContain('1 goal');
    expect(headlineParts(player({ assists: 2 }))).toContain('2 assists');
  });

  it('a keeper’s saves make the headline; an outfielder’s do not', () => {
    expect(headlineParts(player({ position: 'G', saves: 3 }))).toContain('3 saves');
    expect(headlineParts(player({ position: 'D', saves: 3 }))).not.toContain('3 saves');
  });

  it('marks a substitute, and says nothing about minutes he did not play', () => {
    expect(headlineParts(player({ isStarter: false, minutes: 12 }))).toEqual(["12'", 'substitute']);
    expect(headlineParts(player({ isStarter: false, minutes: null }))).toEqual(['substitute']);
  });
});

describe('didPlay', () => {
  it('⚠ an unused substitute has no line to show', () => {
    expect(didPlay(player({ minutes: null, rating: null, isStarter: false }))).toBe(false);
    expect(didPlay(player({ minutes: 0, rating: null }))).toBe(false);
  });

  it('a minute on the pitch counts', () => {
    expect(didPlay(player({ minutes: 1, rating: null }))).toBe(true);
    expect(didPlay(player({ minutes: null, rating: 6.5 }))).toBe(true);
  });
});

describe('indexByPlayerId', () => {
  it('keys on the provider id', () => {
    const m = indexByPlayerId([player({ externalPlayerId: 7 }), player({ externalPlayerId: 9 })]);
    expect(m.get(7)?.externalPlayerId).toBe(7);
    expect(m.size).toBe(2);
  });

  it('⚠ drops the id-0 sentinel, in case one ever reaches the client', () => {
    // The mapper already skips them; this is the second line of defence,
    // because two id-0 players would silently overwrite each other here.
    expect(indexByPlayerId([player({ externalPlayerId: 0 })]).size).toBe(0);
  });
});
