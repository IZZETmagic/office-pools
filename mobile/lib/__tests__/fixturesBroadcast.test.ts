import { describe, expect, it } from 'vitest';

import {
  applyFixturesUpdate,
  type FixturesUpdateMessage,
  type SeasonFixtures,
} from '../fixturesBroadcast';

const PL = 'season-pl';
const LIGA = 'season-liga';

/** A fixture as the route sends it — World Cup match shape, snake_case. */
function row(number: number, over: Record<string, unknown> = {}) {
  return {
    match_id: `f-${number}`,
    match_number: number,
    status: 'scheduled',
    is_completed: false,
    home_score_ft: null,
    away_score_ft: null,
    live_minute: null,
    live_period: null,
    live_added: null,
    ...over,
  };
}

function payload(seasons: SeasonFixtures[]) {
  return { seasons };
}

/** The message migration 125 builds, keys and all. */
function message(seasonId: string, fixtures: Partial<FixturesUpdateMessage['fixtures'][0]>[]) {
  return {
    season_id: seasonId,
    fixtures: fixtures.map((f) => ({
      number: 1,
      matchweek: 3,
      status: 'live',
      isCompleted: false,
      homeScore: 0,
      awayScore: 0,
      liveMinute: 12,
      livePeriod: '1H',
      liveAdded: null,
      ...f,
    })),
  } as FixturesUpdateMessage;
}

describe('applyFixturesUpdate', () => {
  it('flips a scheduled fixture to live with its score and minute', () => {
    const prev = payload([{ season_id: PL, matches: [row(1), row(2)] }]);
    const next = applyFixturesUpdate(prev, message(PL, [{ number: 2, liveMinute: 34 }]));

    expect(next!.seasons[0].matches[1]).toMatchObject({
      match_number: 2,
      status: 'live',
      live_minute: 34,
      live_period: '1H',
      home_score_ft: 0,
      away_score_ft: 0,
      is_completed: false,
    });
    // The fixture the message did not name is untouched, identity included.
    expect(next!.seasons[0].matches[0]).toBe(prev.seasons[0].matches[0]);
  });

  it('carries a goal and a full-time result', () => {
    const prev = payload([{ season_id: PL, matches: [row(1, { status: 'live', live_minute: 70 })] }]);
    const ft = applyFixturesUpdate(
      prev,
      message(PL, [
        {
          status: 'completed',
          isCompleted: true,
          homeScore: 2,
          awayScore: 1,
          liveMinute: 90,
          livePeriod: null,
        },
      ]),
    );
    expect(ft!.seasons[0].matches[0]).toMatchObject({
      status: 'completed',
      is_completed: true,
      home_score_ft: 2,
      away_score_ft: 1,
    });
  });

  it('appends stoppage time, which is what keeps 90+8 from reading as over', () => {
    const prev = payload([{ season_id: PL, matches: [row(1, { status: 'live', live_minute: 90 })] }]);
    const next = applyFixturesUpdate(prev, message(PL, [{ liveMinute: 90, liveAdded: 8 }]));
    expect(next!.seasons[0].matches[0]).toMatchObject({ live_minute: 90, live_added: 8 });
  });

  // ⚠ THE ONE THAT WOULD BE A REAL BUG. Fixture numbers are unique WITHIN a
  // season and every season has a number 1, so a member holding two leagues
  // would see one competition's score written onto the other's game.
  it('never writes one season’s score onto another’s fixture', () => {
    const prev = payload([
      { season_id: PL, matches: [row(1)] },
      { season_id: LIGA, matches: [row(1)] },
    ]);
    const next = applyFixturesUpdate(prev, message(LIGA, [{ number: 1, homeScore: 3 }]));

    expect(next!.seasons[0].matches[0].home_score_ft).toBeNull();
    expect(next!.seasons[1].matches[0].home_score_ft).toBe(3);
    // The untouched season keeps its identity, so its list does not re-render.
    expect(next!.seasons[0]).toBe(prev.seasons[0]);
  });

  it('returns the same object when the message repeats what is already held', () => {
    const prev = payload([
      {
        season_id: PL,
        matches: [
          row(1, {
            status: 'live',
            home_score_ft: 0,
            away_score_ft: 0,
            live_minute: 12,
            live_period: '1H',
          }),
        ],
      },
    ]);
    expect(applyFixturesUpdate(prev, message(PL, [{}]))).toBe(prev);
  });

  it('ignores a season it does not hold, and an empty or absent payload', () => {
    const prev = payload([{ season_id: PL, matches: [row(1)] }]);
    expect(applyFixturesUpdate(prev, message(LIGA, [{}]))).toBe(prev);
    expect(applyFixturesUpdate(prev, { season_id: PL, fixtures: [] })).toBe(prev);
    expect(applyFixturesUpdate(undefined, message(PL, [{}]))).toBeUndefined();
  });

  it('ignores a fixture number the season does not have', () => {
    const prev = payload([{ season_id: PL, matches: [row(1)] }]);
    expect(applyFixturesUpdate(prev, message(PL, [{ number: 999 }]))).toBe(prev);
  });

  it('applies every fixture of a ten-game Saturday in one message', () => {
    const matches = Array.from({ length: 10 }, (_, i) => row(i + 1));
    const prev = payload([{ season_id: PL, matches }]);
    const next = applyFixturesUpdate(
      prev,
      message(
        PL,
        matches.map((_, i) => ({ number: i + 1, liveMinute: 5 })),
      ),
    );
    expect(next!.seasons[0].matches.every((m) => m.status === 'live')).toBe(true);
  });
});
