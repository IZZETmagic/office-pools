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
  statIsZero,
  statsClock,
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
    expect(playerMarkers(player({ isStarter: true, minutes: 67 }), 90).cameOff).toBe(true);
    expect(playerMarkers(player({ isStarter: true, minutes: 90 }), 90).cameOff).toBe(false);
  });

  it('⚠ a substitute who came on gets the arrow; one who did not, does not', () => {
    expect(playerMarkers(player({ isStarter: false, minutes: 23 }), 90).cameOn).toBe(true);
    expect(playerMarkers(player({ isStarter: false, minutes: null }), 90).cameOn).toBe(false);
    expect(playerMarkers(player({ isStarter: false, minutes: 0 }), 90).cameOn).toBe(false);
  });

  // =============================================================
  // The live pitch
  // =============================================================
  // ⚠⚠ THE BUG THESE PIN, AND IT HAS BEEN TWO BUGS WEARING ONE FACE. First
  // `cameOff` was `minutes < 90`, so 69 minutes into a running match every
  // starter had "played under 90" and all eleven wore a substitution arrow.
  // Then it was `minutes < live_minute - 2` — and the arrows came straight back
  // on a live Premier League pitch, because `live_minute` is rewritten every
  // cron tick while the player rows only refresh every third elapsed minute.
  // The numbers below are production samples from 2026-09-12.
  //
  // ⚠ EVERY ONE OF THEM DERIVES THE CLOCK FROM THE SNAPSHOT, because that is
  // the whole point: a clock passed in from somewhere else is the bug.
  const pitch = (minutes: number[]) =>
    minutes.map((m, i) => player({ externalPlayerId: i + 1, isStarter: true, minutes: m }));

  it('⚠⚠ LIVE: a starter still on the pitch has NO arrow', () => {
    // Twenty-two men, sixty-nine minutes, nobody replaced yet.
    const snapshot = pitch(Array.from({ length: 22 }, () => 69));
    expect(statsClock(snapshot)).toBe(69);
    for (const s of snapshot) {
      expect(playerMarkers(s, statsClock(snapshot)).cameOff).toBe(false);
    }
  });

  it('⚠⚠ LIVE: it is the CLOCK that lags, not the player', () => {
    // Sampled: `live_minute` 41 while the highest `minutes` anywhere in the
    // fixture was 36 — a five-minute gap, which marked 21 of the 21 players on
    // the pitch. The players' own clock has no gap to mark anyone with.
    const snapshot = pitch(Array.from({ length: 21 }, () => 36));
    expect(statsClock(snapshot)).toBe(36);
    expect(snapshot.every((s) => !playerMarkers(s, 36).cameOff)).toBe(true);
  });

  it('⚠⚠ LIVE: the pitch does not read one minute, and the spread is not a substitution', () => {
    // The same fixture a minute later, against a `live_minute` of 42:
    //   home 40':5  39':6        away 39':10, plus two men on 22' and 17'
    // The two-minute slack against 42 still marked the sixteen men on 39. The
    // clock is the tenth-highest, which sits UNDER the spread rather than on
    // top of it — so the spread marks nobody and the two substitutions show.
    const snapshot = pitch([
      ...Array(5).fill(40),
      ...Array(16).fill(39),
      22,
      17,
    ]);
    expect(statsClock(snapshot)).toBe(39);
    const marked = snapshot.filter((s) => playerMarkers(s, statsClock(snapshot)).cameOff);
    expect(marked.map((s) => s.minutes)).toEqual([22, 17]);
  });

  it('⚠ LIVE: a starter actually substituted still gets the arrow', () => {
    const snapshot = pitch([...Array(20).fill(69), 44, 60]);
    const clock = statsClock(snapshot);
    expect(clock).toBe(69);
    expect(playerMarkers(player({ isStarter: true, minutes: 44 }), clock).cameOff).toBe(true);
    expect(playerMarkers(player({ isStarter: true, minutes: 60 }), clock).cameOff).toBe(true);
  });

  it('⚠ LIVE: no minutes from the feed yet means no claim about anybody', () => {
    // Before kickoff every row is 0, and a clock of 0 marks nobody. An arrow on
    // everyone is a confident lie; an arrow on no one reads as "not known yet".
    expect(statsClock([])).toBe(0);
    expect(statsClock(pitch([0, 0, 0]))).toBe(0);
    expect(playerMarkers(player({ isStarter: true, minutes: 20 }), 0).cameOff).toBe(false);
  });

  it('⚠ HALF TIME is not a mass substitution', () => {
    const snapshot = pitch([...Array(21).fill(45), 30]);
    const clock = statsClock(snapshot);
    expect(clock).toBe(45);
    expect(playerMarkers(player({ isStarter: true, minutes: 45 }), clock).cameOff).toBe(false);
    // But a first-half substitution is real.
    expect(playerMarkers(player({ isStarter: true, minutes: 30 }), clock).cameOff).toBe(true);
  });

  it('⚠ EXTRA TIME counts past 90 and still reads correctly', () => {
    const snapshot = pitch([...Array(18).fill(105), 80, 90, 95, 100]);
    const clock = statsClock(snapshot);
    expect(clock).toBe(105);
    expect(playerMarkers(player({ isStarter: true, minutes: 105 }), clock).cameOff).toBe(false);
    expect(playerMarkers(player({ isStarter: true, minutes: 80 }), clock).cameOff).toBe(true);
  });

  it('⚠⚠ a FINISHED match needs no case of its own, and the 91st minute is not a substitution', () => {
    // The old rule hardcoded 90 here and the newer one took the highest figure
    // and stood two minutes back from it. Both are wrong on a real full-time
    // sheet: the provider counts stoppage per player, so one man reads 91' and
    // standing back from HIM marks the ten who played the full ninety. Measured
    // on a real fixture whose top figure was 94': the old rule marked 29
    // players where the timeline allows 20.
    const snapshot = pitch([91, ...Array(13).fill(90), 89, 82, 75, 60, 45, 30, 15, 8]);
    const clock = statsClock(snapshot);
    expect(clock).toBe(90);
    expect(playerMarkers(player({ isStarter: true, minutes: 90 }), clock).cameOff).toBe(false);
    expect(playerMarkers(player({ isStarter: true, minutes: 91 }), clock).cameOff).toBe(false);
    // ⚠ AND THE 89th-MINUTE SUBSTITUTION IS BACK. A slack of two below the
    // leader swallowed him; the pack clock does not.
    expect(playerMarkers(player({ isStarter: true, minutes: 89 }), clock).cameOff).toBe(true);
  });

  it('⚠⚠ a SENDING-OFF is not a substitution', () => {
    // A red card also ends a match early. Drawing him with a substitution
    // arrow would say something false about why he left the pitch.
    const sentOff = playerMarkers(player({ isStarter: true, minutes: 34, redCards: 1 }), 90);
    expect(sentOff.cameOff).toBe(false);
    expect(sentOff.red).toBe(1);
  });

  it('carries goals, assists, cards and the armband', () => {
    const m = playerMarkers(player({ goals: 2, assists: 1, yellowCards: 1, isCaptain: true }), 90);
    expect(m).toMatchObject({ goals: 2, assists: 1, yellow: 1, red: 0, captain: true });
  });

  it('a null count is not a marker', () => {
    const m = playerMarkers(player(), 90);
    expect(m.goals).toBe(0);
    expect(m.yellow).toBe(0);
  });
});

describe('statsClock — the match minute, read off the players themselves', () => {
  const at = (minutes: number[]) =>
    minutes.map((m, i) => player({ externalPlayerId: i + 1, minutes: m }));

  it('⚠⚠ the TENTH-highest, because the leader is one man\'s stoppage time', () => {
    // Five men on 40 and the rest on 39, all still on the pitch. The leader
    // says 40 and would make the other sixteen substitutes.
    expect(statsClock(at([...Array(5).fill(40), ...Array(16).fill(39)]))).toBe(39);
  });

  it('⚠ at least ten men play the whole match — five substitutes a side', () => {
    // Ten on the pitch for the full hour, ten replaced. The tenth-highest is
    // still a man who was never substituted.
    expect(statsClock(at([...Array(12).fill(60), 55, 40, 33, 20, 12, 5]))).toBe(60);
  });

  it('⚠⚠ the unused substitutes do not drag it to zero', () => {
    // Nine men on the bench who never came on would otherwise BE the tenth.
    expect(statsClock(at([...Array(11).fill(75), ...Array(9).fill(0)]))).toBe(75);
  });

  it('⚠ fewer than ten rows still answers, and answers LOW', () => {
    // One side's stats, or a fixture the provider has barely filled in. A low
    // clock under-marks, which is the safe direction.
    expect(statsClock(at([90, 85, 70]))).toBe(70);
    expect(statsClock(at([90]))).toBe(90);
    expect(statsClock([])).toBe(0);
  });

  it('⚠ a null minutes is nobody on the pitch, not a zero to sort', () => {
    expect(statsClock([player({ minutes: null })])).toBe(0);
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
    const m = playerMarkers(player({ yellowCards: 2, redCards: 1 }), 90);
    expect(m.yellow).toBe(2);
    expect(m.red).toBe(1);
  });
});

describe('subMinute — `minutes` proposes, the timeline confirms', () => {
  const off = player({ isStarter: true, minutes: 67 });

  it('⚠⚠ shows the minute only when a substitution really happened then', () => {
    expect(subMinute(off, new Set([67, 80]), 90)).toBe(67);
    expect(subMinute(off, new Set([66, 80]), 90)).toBeNull();
    expect(subMinute(off, new Set(), 90)).toBeNull();
  });

  it('a player who did not come off has no minute', () => {
    expect(subMinute(player({ isStarter: true, minutes: 90 }), new Set([90]), 90)).toBeNull();
    expect(subMinute(player({ isStarter: false, minutes: 20 }), new Set([20]), 90)).toBeNull();
  });

  it('⚠ a sending-off never gets a substitution minute', () => {
    expect(subMinute(player({ isStarter: true, minutes: 34, redCards: 1 }), new Set([34]), 90)).toBeNull();
  });

  it("⚠⚠ LIVE: a substitute's entry minute is against the CURRENT minute, not 90", () => {
    // Reported: Beto came on at 60' in a match at 69' and the sheet said 81'.
    // 9 minutes played against a hardcoded 90 implies 81; against 69 it is 60.
    const beto = player({ isStarter: false, minutes: 9 });
    expect(subMinute(beto, new Set([60]), 69)).toBe(60);
    expect(subMinute(beto, new Set([60]), 90)).toBeNull();
  });

  it('⚠⚠ LIVE: the clock that subtracts has to be the one the minutes came from', () => {
    // Sampled: two substitutes on 17 and 22 minutes played in a snapshot whose
    // own clock read 39, while `live_minute` said 42. Against 42 they work out
    // as 20' and 25', match no real substitution, and show nothing at all.
    const seventeen = player({ isStarter: false, minutes: 17 });
    const twentyTwo = player({ isStarter: false, minutes: 22 });
    const timeline = new Set([17, 22]);
    expect(subMinute(seventeen, timeline, 39)).toBe(22);
    expect(subMinute(twentyTwo, timeline, 39)).toBe(17);
    expect(subMinute(seventeen, timeline, 42)).toBeNull();
    expect(subMinute(twentyTwo, timeline, 42)).toBeNull();
  });

  it('⚠ LIVE: a starter substituted at a corroborated minute keeps his minute', () => {
    const off = player({ isStarter: true, minutes: 44 });
    expect(subMinute(off, new Set([44]), 69)).toBe(44);
    expect(subMinute(off, new Set([43]), 69)).toBeNull();
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
    expect(subMinute(sub, new Set([67]), 90)).toBe(67);
    expect(subMinute(sub, new Set([66]), 90)).toBeNull();
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

describe('statIsZero', () => {
  it('⚠ reads the LEADING number, not the whole string', () => {
    expect(statIsZero('0')).toBe(true);
    expect(statIsZero('0 of 5')).toBe(true);
    expect(statIsZero('4 of 5')).toBe(false);
    expect(statIsZero('0 on / 3')).toBe(true);
    expect(statIsZero('3 on / 3')).toBe(false);
  });

  it('⚠ a zero denominator does not make a real number look empty', () => {
    // "5 of 0" cannot happen, but "1 of 0" must not dim on the trailing zero.
    expect(statIsZero('1 of 0')).toBe(false);
  });

  it('anything without a leading number is not a zero', () => {
    expect(statIsZero('—')).toBe(false);
    expect(statIsZero('')).toBe(false);
  });
});

describe('every rate belongs to a real section', () => {
  it('⚠⚠ each rate names a section `statGroups` actually produces', () => {
    // The two live in different functions and would drift in silence — a rate
    // pointing at a section that does not exist would simply never render.
    const busy = player({
      position: 'F',
      passesTotal: 28, passesAccurate: 26,
      shotsTotal: 3, shotsOn: 2,
      duelsTotal: 12, duelsWon: 7,
      dribblesAttempts: 5, dribblesSuccess: 4,
    });
    const titles = new Set(statGroups(busy).map((g) => g.title));
    for (const r of playerRates(busy)) {
      expect(titles.has(r.section), `no section called "${r.section}"`).toBe(true);
    }
  });

  it('⚠ a keeper’s save rate lands in his own section', () => {
    const gk = player({ position: 'G', saves: 4, goalsConceded: 1, passesTotal: 30, passesAccurate: 20 });
    const titles = new Set(statGroups(gk).map((g) => g.title));
    for (const r of playerRates(gk)) expect(titles.has(r.section)).toBe(true);
    expect(playerRates(gk).find((r) => r.label === 'Save rate')?.section).toBe('Goalkeeping');
  });
});
