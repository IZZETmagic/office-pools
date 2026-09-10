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
  ratingScaleColor,
  playerMarkers,
  playerPhotoUrl,
  playerRates,
  positionName,
  RATE_COVERS,
  subMinute,
  statGroups,
  teamRating,
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
  it('⚠ labels the minutes rather than leaving a prime mark', () => {
    // `90'` beside a scoreline reads as the minute something happened — it is
    // how the timeline writes a goal — where here it is a duration.
    expect(headlineParts(player({ minutes: 67 }))[0]).toBe('Minutes played 67');
    expect(headlineParts(player({ minutes: 67 }))[0]).not.toContain("'");
  });

  it('reads as a sentence a person would say', () => {
    expect(headlineParts(player({ minutes: 90, goals: 2, assists: 1 })))
      .toEqual(['Minutes played 90', '2 goals', '1 assist']);
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
    expect(headlineParts(player({ isStarter: false, minutes: 12 }))).toEqual([
      'Minutes played 12',
      'substitute',
    ]);
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

describe('playerPhotoUrl', () => {
  it('⚠ derives the provider URL from the id', () => {
    // Measured: 958 of 958 feed photos matched this exactly, so a stored
    // column would be the same string written 6,312 times.
    expect(playerPhotoUrl(199578)).toBe('https://media.api-sports.io/football/players/199578.png');
  });

  it('⚠ has nothing for the id-0 sentinel', () => {
    // The two feed entries that carried no photo were exactly these, and the
    // mapper already drops them — but the pitch must not request `/0.png`.
    expect(playerPhotoUrl(0)).toBeNull();
    expect(playerPhotoUrl(-1)).toBeNull();
    expect(playerPhotoUrl(null)).toBeNull();
    expect(playerPhotoUrl(undefined)).toBeNull();
  });

  it('refuses anything that is not a whole id', () => {
    expect(playerPhotoUrl(1.5)).toBeNull();
    expect(playerPhotoUrl(NaN)).toBeNull();
  });
});

describe('playerMarkers', () => {
  it('⚠ a starter who came off gets the arrow', () => {
    expect(playerMarkers(player({ isStarter: true, minutes: 67 })).cameOff).toBe(true);
    expect(playerMarkers(player({ isStarter: true, minutes: 90 })).cameOff).toBe(false);
  });

  it('⚠ a substitute who came on gets the arrow; one who did not, does not', () => {
    expect(playerMarkers(player({ isStarter: false, minutes: 23 })).cameOn).toBe(true);
    expect(playerMarkers(player({ isStarter: false, minutes: null })).cameOn).toBe(false);
    expect(playerMarkers(player({ isStarter: false, minutes: 0 })).cameOn).toBe(false);
  });

  it('⚠⚠ a SENDING-OFF is not a substitution', () => {
    // A red card also ends a match early. Drawing him with a substitution
    // arrow would say something false about why he left the pitch.
    const sentOff = playerMarkers(player({ isStarter: true, minutes: 34, redCards: 1 }));
    expect(sentOff.cameOff).toBe(false);
    expect(sentOff.red).toBe(1);
  });

  it('carries goals, assists, cards and the armband', () => {
    const m = playerMarkers(player({ goals: 2, assists: 1, yellowCards: 1, isCaptain: true }));
    expect(m).toMatchObject({ goals: 2, assists: 1, yellow: 1, red: 0, captain: true });
  });

  it('a null count is not a marker', () => {
    const m = playerMarkers(player());
    expect(m.goals).toBe(0);
    expect(m.yellow).toBe(0);
  });
});

describe('teamRating', () => {
  it('⚠ averages the players who PLAYED, not the squad', () => {
    // Eight unused substitutes have no rating; averaging them in would mean
    // averaging in absences.
    const stats = [
      player({ side: 'home', externalPlayerId: 1, rating: 8 }),
      player({ side: 'home', externalPlayerId: 2, rating: 7 }),
      player({ side: 'home', externalPlayerId: 3, rating: null, isStarter: false }),
      player({ side: 'away', externalPlayerId: 4, rating: 5 }),
    ];
    expect(teamRating(stats, 'home')).toBe(7.5);
    expect(teamRating(stats, 'away')).toBe(5);
  });

  it('⚠ a rating of 0 does not drag the average down', () => {
    const stats = [
      player({ side: 'home', externalPlayerId: 1, rating: 8 }),
      player({ side: 'home', externalPlayerId: 2, rating: 0 }),
    ];
    expect(teamRating(stats, 'home')).toBe(8);
  });

  it('is null before anyone has been rated', () => {
    expect(teamRating([], 'home')).toBeNull();
    expect(teamRating([player({ rating: null })], 'home')).toBeNull();
  });
});

describe('playerMarkers — counts, because the badges stack', () => {
  it('⚠ two yellows and a red are all three reported', () => {
    // A second yellow IS a red. The feed reports both, and drawing all three is
    // the true account of his afternoon rather than a summary of it.
    const m = playerMarkers(player({ yellowCards: 2, redCards: 1 }));
    expect(m.yellow).toBe(2);
    expect(m.red).toBe(1);
  });
});

describe('subMinute — `minutes` proposes, the timeline confirms', () => {
  const off = player({ isStarter: true, minutes: 67 });

  it('⚠⚠ shows the minute only when a substitution really happened then', () => {
    expect(subMinute(off, new Set([67, 80]))).toBe(67);
    expect(subMinute(off, new Set([66, 80]))).toBeNull();
    expect(subMinute(off, new Set())).toBeNull();
  });

  it('a player who did not come off has no minute', () => {
    expect(subMinute(player({ isStarter: true, minutes: 90 }), new Set([90]))).toBeNull();
    expect(subMinute(player({ isStarter: false, minutes: 20 }), new Set([20]))).toBeNull();
  });

  it('⚠ a sending-off never gets a substitution minute', () => {
    expect(subMinute(player({ isStarter: true, minutes: 34, redCards: 1 }), new Set([34]))).toBeNull();
  });
});

describe('playerRates — derived rates, banded by position', () => {
  it('⚠⚠ the SAME pass accuracy reads differently by position', () => {
    // Measured 15th percentiles: D 78%, M 74%, F 64%. So 70% is a perfectly
    // ordinary afternoon for a striker and the bottom 15% of every defender in
    // five leagues — one set of thresholds would have to be wrong about one of
    // them. (My first attempt at this test used 80%, which is above the
    // defender's p15 of 78 and proves nothing.)
    const passing = { passesTotal: 100, passesAccurate: 70 };
    const striker = playerRates(player({ position: 'F', ...passing }))[0];
    const defender = playerRates(player({ position: 'D', ...passing }))[0];
    expect(striker.pct).toBe(70);
    expect(defender.pct).toBe(70);
    expect(striker.band).toBe('par');
    expect(defender.band).toBe('poor');
  });

  it('⚠ a rate needs a denominator worth dividing by', () => {
    // "1 of 1 = 100%" is not a shooting accuracy, it is one shot.
    expect(playerRates(player({ passesTotal: 9, passesAccurate: 9 }))).toHaveLength(0);
    expect(playerRates(player({ passesTotal: 10, passesAccurate: 9 }))).toHaveLength(1);
    expect(playerRates(player({ shotsTotal: 1, shotsOn: 1 }))).toHaveLength(0);
  });

  it('⚠⚠ shot accuracy is shown but never coloured', () => {
    // At two or three shots the measured 85th percentile is 100% for every
    // position, so a band would describe the sample size, not the player.
    const r = playerRates(player({ shotsTotal: 3, shotsOn: 3 }))[0];
    expect(r.label).toBe('Shot accuracy');
    expect(r.pct).toBe(100);
    expect(r.band).toBeNull();
  });

  it('a keeper gets a save rate; an outfielder never does', () => {
    const gk = playerRates(player({ position: 'G', saves: 4, goalsConceded: 1 }));
    expect(gk.find((r) => r.label === 'Save rate')?.pct).toBe(80);
    const out = playerRates(player({ position: 'D', saves: 4, goalsConceded: 1 }));
    expect(out.find((r) => r.label === 'Save rate')).toBeUndefined();
  });

  it('an unknown position falls back rather than vanishing', () => {
    const r = playerRates(player({ position: null, passesTotal: 100, passesAccurate: 86 }));
    expect(r[0].band).toBe('par');
  });

  it('every rate carries the raw counts it came from', () => {
    const r = playerRates(
      player({ passesTotal: 28, passesAccurate: 26, duelsTotal: 12, duelsWon: 7 }),
    );
    expect(r.find((x) => x.label === 'Pass accuracy')!.detail).toBe('26 of 28');
    expect(r.find((x) => x.label === 'Duels won')!.detail).toBe('7 of 12');
  });

  it('a player who did nothing measurable gets no rates at all', () => {
    expect(playerRates(player())).toEqual([]);
  });
});

describe('RATE_COVERS — a fact is printed once', () => {
  it('⚠ every rate that duplicates a raw row names it', () => {
    // If a rate carries "26 of 28" then "Passes 26 of 28" below is the same
    // fact twice, a few hundred points apart.
    const busy = player({
      passesTotal: 28, passesAccurate: 26,
      shotsTotal: 3, shotsOn: 2,
      duelsTotal: 12, duelsWon: 7,
      dribblesAttempts: 5, dribblesSuccess: 4,
    });
    const rates = playerRates(busy);
    expect(rates.length).toBe(4);
    for (const r of rates) expect(RATE_COVERS[r.label]).toBeTruthy();
  });

  it('⚠⚠ every name in the map is a row `statGroups` actually produces', () => {
    // The two lists are in different functions and would drift silently — a
    // typo here would leave a duplicate on screen and nothing would fail.
    const busy = player({
      position: 'F',
      passesTotal: 28, passesAccurate: 26,
      shotsTotal: 3, shotsOn: 2,
      duelsTotal: 12, duelsWon: 7,
      dribblesAttempts: 5, dribblesSuccess: 4,
    });
    const labels = new Set(statGroups(busy).flatMap((g) => g.rows.map((r) => r.label)));
    for (const rowLabel of Object.values(RATE_COVERS)) {
      expect(labels.has(rowLabel), `statGroups has no row called "${rowLabel}"`).toBe(true);
    }
  });
});

describe('ratingScaleColor — red at 1, deep green at 10', () => {
  const hex = (r: number) => ratingScaleColor(r)!;
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

  it('anchors at both ends', () => {
    expect(hex(1).toUpperCase()).toBe('#A32118');
    expect(hex(10).toUpperCase()).toBe('#123D26');
  });

  it('⚠ climbs continuously — no two ratings a decimal apart share a colour', () => {
    const seen = new Set<string>();
    for (let r = 3; r <= 10; r = Math.round((r + 0.1) * 10) / 10) seen.add(hex(r));
    // 71 samples across the range players actually occupy.
    expect(seen.size).toBeGreaterThan(60);
  });

  it('⚠⚠ gets greener and redder in the right directions', () => {
    // Red channel falls, green channel rises, across the whole ramp.
    const low = rgb(hex(3));
    const high = rgb(hex(9));
    expect(low[0]).toBeGreaterThan(high[0]);
    expect(low[1]).toBeLessThan(low[0]);
    expect(high[1]).toBeGreaterThan(high[0]);
  });

  it('⚠ the top of the scale is DARKER than the grass, because it is green on green', () => {
    // A brighter green would be the same lightness as #417A57 and dissolve into
    // it — the badge has no outline to fall back on.
    const relLum = (h: string) => {
      const f = (v: number) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
      const [r, g, b] = rgb(h);
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const pitch = relLum('#417A57');
    expect(relLum(hex(9))).toBeLessThan(pitch);
    expect(relLum(hex(10))).toBeLessThan(pitch);
  });

  it('⚠ every colour on the ramp carries white text', () => {
    const relLum = (h: string) => {
      const f = (v: number) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
      const [r, g, b] = rgb(h);
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    for (let r = 1; r <= 10; r += 0.25) {
      const contrast = (1.05) / (relLum(hex(r)) + 0.05);
      expect(contrast, `rating ${r} is ${hex(r)}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('clamps rather than extrapolating off the ends', () => {
    expect(hex(0.5)).toBe(hex(1));
    expect(hex(12)).toBe(hex(10));
  });

  it('⚠ has no colour for a rating of 0 or none — it is not a rating', () => {
    expect(ratingScaleColor(0)).toBeNull();
    expect(ratingScaleColor(null)).toBeNull();
    expect(ratingScaleColor(undefined)).toBeNull();
  });
});

describe('positionName', () => {
  it('names the four the feed sends', () => {
    expect(positionName('G')).toBe('Goalkeeper');
    expect(positionName('D')).toBe('Defender');
    expect(positionName('M')).toBe('Midfielder');
    expect(positionName('F')).toBe('Forward');
  });

  it('⚠ an unknown letter is null, not shown raw', () => {
    // "Player · ST" reads as a bug, and the position is decoration on a card
    // that already names the man.
    expect(positionName('ST')).toBeNull();
    expect(positionName(null)).toBeNull();
    expect(positionName(undefined)).toBeNull();
    expect(positionName('')).toBeNull();
  });
});

describe('the substitution minute, both directions', () => {
  it('⚠ a substitute who came on gets his entry minute', () => {
    // 90 - 23 = 67, and the timeline says a substitution happened at 67.
    const sub = player({ isStarter: false, minutes: 23 });
    expect(subMinute(sub, new Set([67]))).toBe(67);
    expect(subMinute(sub, new Set([66]))).toBeNull();
  });

  it('⚠⚠ the headline shows the coming-ON minute and never the coming-OFF one', () => {
    // A starter who came off at 67 played 67 minutes — the same number twice.
    const off = headlineParts(player({ isStarter: true, minutes: 67 }), 67);
    expect(off).toEqual(['Minutes played 67']);
    // A substitute who came on at 67 played 23. Two different facts.
    const on = headlineParts(player({ isStarter: false, minutes: 23 }), 67);
    expect(on).toEqual(['Minutes played 23', "Came on 67'"]);
  });

  it('falls back to the plain word when the timeline could not confirm it', () => {
    expect(headlineParts(player({ isStarter: false, minutes: 23 }), null)).toEqual([
      'Minutes played 23',
      'substitute',
    ]);
  });

  it('⚠ a named substitute who never played says so', () => {
    expect(headlineParts(player({ isStarter: false, minutes: null, rating: null }))).toEqual([
      'unused substitute',
    ]);
  });
});
