import { describe, expect, it } from 'vitest';

import { getVisiblePoolTabs } from '../poolTabs';

// `getVisiblePoolTabs(...)[0]` is where a pool LANDS, so the order of this list
// is a product rule and not a layout detail. These hold both halves.

/** A loaded league pool, in the shape the screen passes. */
const league = (mode: 'pickem' | 'showdown' | 'last_man_standing' | 'table' | null) =>
  getVisiblePoolTabs(false, false, false, true, mode);

describe('the tab a pool lands on', () => {
  it('is the Duel for a Showdown pool', () => {
    expect(league('showdown')[0]).toBe('duel');
  });

  it.each(['pickem', 'last_man_standing', 'table', null] as const)(
    'is the Leaderboard for %s',
    (mode) => {
      expect(league(mode)[0]).toBe('leaderboard');
    },
  );

  it('is the Leaderboard for a World Cup pool', () => {
    expect(getVisiblePoolTabs(false, false, false, false, null)[0]).toBe('leaderboard');
  });

  it('is the Duel for a Showdown ADMIN too — admin tabs append, they do not lead', () => {
    expect(getVisiblePoolTabs(true, false, true, true, 'showdown')[0]).toBe('duel');
  });
});

describe('⚠ a non-empty tab list is NOT a readiness signal', () => {
  /**
   * The bug this file exists for. The pool screen derives its tab list from
   * `data?.pool`, so BEFORE the fetch resolves it calls this with
   * `isLeague: false, leagueMode: null` — and gets a full, valid World Cup set
   * back. A landing effect gated on "the list is non-empty" therefore fired on
   * the first render, landed on Leaderboard and marked itself done, so the real
   * answer arriving a moment later was ignored. It looked exactly like the fix
   * had never been applied.
   */
  it('answers an unloaded pool with a full list that leads with Leaderboard', () => {
    const unloaded = getVisiblePoolTabs(false, false, false, false, null);
    expect(unloaded.length).toBeGreaterThan(0);
    expect(unloaded[0]).toBe('leaderboard');
  });

  it('answers the same pool differently once it is known to be Showdown', () => {
    const unloaded = getVisiblePoolTabs(false, false, false, false, null);
    const loaded = getVisiblePoolTabs(false, false, false, true, 'showdown');
    // Both non-empty, different first tab — which is precisely why length
    // cannot stand in for "the pool has loaded".
    expect(unloaded[0]).not.toBe(loaded[0]);
  });
});

describe('Showdown swaps Predictions for The Room', () => {
  it('offers The Room and not Predictions', () => {
    const tabs = league('showdown');
    expect(tabs).toContain('room');
    expect(tabs).not.toContain('predictions');
  });

  it('leaves every other mode its Predictions tab and no Room', () => {
    const tabs = league('pickem');
    expect(tabs).toContain('predictions');
    expect(tabs).not.toContain('room');
  });

  it('gives a NULL-mode league pool neither — it has no duels', () => {
    const tabs = league(null);
    expect(tabs).not.toContain('duel');
    expect(tabs).not.toContain('room');
  });
});

describe('Form is hidden for every league pool', () => {
  it('is offered to a World Cup pool', () => {
    expect(getVisiblePoolTabs(false, false, false, false, null)).toContain('form');
  });

  it.each(['showdown', 'pickem', null] as const)('is hidden for league mode %s', (mode) => {
    // ⚠ Keyed on `isLeague`, never the mode: two production pools carry a
    // season id with a NULL mode, and their analytics are just as empty.
    expect(league(mode)).not.toContain('form');
  });
});
