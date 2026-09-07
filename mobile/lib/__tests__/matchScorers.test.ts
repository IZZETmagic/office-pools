// =============================================================
// Who scored, for the header
// =============================================================
// The header's two scorer lists sit directly under the scoreline, so the one
// thing they must never do is fail to add up to it. Every assertion below is
// really that same check from a different angle: a cancelled goal counted, an
// own goal filed under the wrong club, or a nameless goal dropped would each
// show "2-1" above a list totalling something else.
// =============================================================

import { describe, it, expect } from 'vitest';

import { hasScorers, matchScorers } from '../matchScorers';
import type { TimelineEvent } from '../useMatchDetail';

function ev(over: Partial<TimelineEvent> = {}): TimelineEvent {
  return {
    side: 'home',
    kind: 'goal',
    playerName: 'A Player',
    relatedName: null,
    minute: 10,
    extraMinute: null,
    ...over,
  };
}

/** The invariant the header lives or dies by. */
const goalCount = (s: ReturnType<typeof matchScorers>) => ({
  home: s.home.reduce((n, l) => n + l.minutes.length, 0),
  away: s.away.reduce((n, l) => n + l.minutes.length, 0),
});

describe('matchScorers', () => {
  it('splits the scorers by side, in the order they scored', () => {
    const s = matchScorers([
      ev({ side: 'away', playerName: 'Rogers', minute: 2 }),
      ev({ side: 'home', playerName: 'Havertz', minute: 25 }),
      ev({ side: 'home', playerName: 'Ødegaard', minute: 50 }),
    ]);
    expect(s.home.map((l) => l.name)).toEqual(['Havertz', 'Ødegaard']);
    expect(s.away.map((l) => l.name)).toEqual(['Rogers']);
    expect(s.home[0].minutes).toEqual(["25'"]);
  });

  it('⚠ EXCLUDES a VAR-cancelled goal — it did not go on the board', () => {
    // It is in the timeline precisely because it did not count, and the Facts
    // tab draws it struck through two inches below this.
    const s = matchScorers([
      ev({ playerName: 'Calafiori', kind: 'var_goal_cancelled', minute: 13 }),
      ev({ playerName: 'Havertz', minute: 25 }),
    ]);
    expect(s.home.map((l) => l.name)).toEqual(['Havertz']);
    expect(goalCount(s).home).toBe(1);
  });

  it('excludes cards and substitutions', () => {
    const s = matchScorers([
      ev({ kind: 'yellow', playerName: 'Rice' }),
      ev({ kind: 'red', playerName: 'Saliba' }),
      ev({ kind: 'second_yellow', playerName: 'Timber' }),
      ev({ kind: 'subst', playerName: 'Jesus', relatedName: 'Nketiah' }),
    ]);
    expect(hasScorers(s)).toBe(false);
  });

  it('⚠ files an own goal under the side it COUNTED FOR, marked (og)', () => {
    // `side` is the credited side and the mapper deliberately does not flip it.
    // Listing it under the scorer's own club would show 1-0 over a list that
    // reads 0-1.
    const s = matchScorers([ev({ side: 'home', kind: 'own_goal', playerName: 'Gabriel', minute: 30 })]);
    expect(s.home).toEqual([{ name: 'Gabriel', minutes: ["30' (og)"] }]);
    expect(s.away).toEqual([]);
  });

  it('marks a penalty', () => {
    const s = matchScorers([ev({ kind: 'penalty', playerName: 'Saka', minute: 62 })]);
    expect(s.home[0].minutes).toEqual(["62' (pen)"]);
  });

  it('⚠ groups a player onto ONE line with all their goals', () => {
    // A hat-trick as three lines would push the crests off the header.
    const s = matchScorers([
      ev({ playerName: 'Haaland', minute: 12 }),
      ev({ playerName: 'Haaland', minute: 44 }),
      ev({ playerName: 'Haaland', kind: 'penalty', minute: 70 }),
    ]);
    expect(s.home).toHaveLength(1);
    expect(s.home[0]).toEqual({ name: 'Haaland', minutes: ["12'", "44'", "70' (pen)"] });
    // And the count still matches the scoreline.
    expect(goalCount(s).home).toBe(3);
  });

  it('renders stoppage time as the feed gives it', () => {
    const s = matchScorers([ev({ minute: 45, extraMinute: 2 })]);
    expect(s.home[0].minutes).toEqual(["45+2'"]);
  });

  it('⚠ keeps a goal the feed could not name, rather than dropping it', () => {
    // It counted on the scoreboard, so dropping it makes the header add up to
    // less than the score beside it.
    const s = matchScorers([ev({ playerName: null, minute: 8 })]);
    expect(s.home).toEqual([{ name: 'Unknown', minutes: ["8'"] }]);
    expect(goalCount(s).home).toBe(1);
  });

  it('is empty for a goalless match', () => {
    const s = matchScorers([]);
    expect(s).toEqual({ home: [], away: [] });
    expect(hasScorers(s)).toBe(false);
  });

  it('the two lists total the scoreline, across every kind at once', () => {
    // Arsenal 2-1 Chelsea, with a disallowed one and assorted noise mixed in.
    const s = matchScorers([
      ev({ side: 'away', playerName: 'Rogers', minute: 2 }),
      ev({ side: 'home', kind: 'var_goal_cancelled', playerName: 'Calafiori', minute: 13 }),
      ev({ side: 'away', kind: 'yellow', playerName: 'Pedro', minute: 14 }),
      ev({ side: 'home', playerName: 'Havertz', minute: 25 }),
      ev({ side: 'home', playerName: 'Ødegaard', minute: 50 }),
      ev({ side: 'home', kind: 'subst', playerName: 'Havertz', relatedName: 'Gyökeres', minute: 78 }),
    ]);
    expect(goalCount(s)).toEqual({ home: 2, away: 1 });
  });
});
