// =============================================================
// The tab set, the pitch layout, and which statistics are drawn
// =============================================================
// Three small pure modules behind the two tabs migration 139 unlocked. Each is
// here because its failure mode is silent:
//
//   · `matchTabs` drives every index into the pager, so an off-by-one shows the
//     WRONG PAGE rather than throwing;
//   · `groupByRow` decides where eleven players stand, and dropping one renders
//     a ten-man team that looks plausible;
//   · `visibleStatRows` decides what a null MEANS, and getting it backwards
//     prints "xG 0.00" over a game that had 3.4.
// =============================================================

import { describe, it, expect } from 'vitest';

import { CHIP, GK_DEPTH, OUTFIELD_FROM, OUTFIELD_TO, REACH_DOWN, REACH_UP, groupByRow, parseGrid, rowDepths, surnameOf } from '../lineupLayout';
import { BLEED, PITCH_L } from '../pitchGeometry';
import {
  leadingSide,
  STAT_ROWS,
  STAT_SECTIONS,
  visibleStatRows,
  visibleStatSections,
} from '../matchStatRows';
import { ALL_MATCH_TAB_KEYS, matchTabs } from '../matchTabs';
import type { LineupPlayer, MatchTeamStats } from '../useMatchDetail';

// ---------------------------------------------------------------- the tab set

describe('matchTabs', () => {
  it('offers only Facts and Predictions when the match has neither', () => {
    // A World Cup match, or a league fixture the backfill has not reached.
    expect(matchTabs({ hasLineups: false, hasStats: false, hasScouting: false })).toEqual(['facts', 'predictions']);
  });

  it('inserts each tab in the canonical order, not at the end', () => {
    // ⚠ Order is the swipe sequence. Appending would put Stats after
    // Predictions on one match and before it on another.
    expect(matchTabs({ hasLineups: true, hasStats: false, hasScouting: false })).toEqual([
      'facts',
      'lineups',
      'predictions',
    ]);
    expect(matchTabs({ hasLineups: false, hasStats: true, hasScouting: false })).toEqual([
      'facts',
      'stats',
      'predictions',
    ]);
    expect(matchTabs({ hasLineups: true, hasStats: true, hasScouting: true })).toEqual([
      'facts',
      'lineups',
      'stats',
      'scouting',
      'predictions',
    ]);
  });

  it('always starts with facts, whatever the match has', () => {
    for (const hasLineups of [true, false]) {
      for (const hasStats of [true, false]) {
        expect(matchTabs({ hasLineups, hasStats, hasScouting: false })[0]).toBe('facts');
      }
    }
  });

  it('⚠ the scouting tab is gated separately from the other two', () => {
    // The server decides it, off a meeting count, so it can be present when
    // line-ups and stats are absent and vice versa.
    expect(matchTabs({ hasLineups: false, hasStats: false, hasScouting: true })).toEqual([
      'facts',
      'scouting',
      'predictions',
    ]);
  });

  it('never offers a tab outside the canonical set', () => {
    const tabs = matchTabs({ hasLineups: true, hasStats: true, hasScouting: true });
    expect(tabs.every((t) => ALL_MATCH_TAB_KEYS.includes(t))).toBe(true);
    expect(tabs).toHaveLength(ALL_MATCH_TAB_KEYS.length);
  });
});

// ------------------------------------------------------------- the pitch grid

function player(over: Partial<LineupPlayer> = {}): LineupPlayer {
  return { playerId: 1, name: 'A Player', number: 1, pos: 'M', grid: null, starter: true, ...over };
}

describe('parseGrid', () => {
  it('reads "row:col"', () => {
    expect(parseGrid('1:1')).toEqual({ row: 1, col: 1 });
    expect(parseGrid('4:3')).toEqual({ row: 4, col: 3 });
  });

  it('is null for a substitute, who never has one', () => {
    expect(parseGrid(null)).toBeNull();
  });

  it('⚠ refuses a half-written grid — Number("") is 0, not NaN', () => {
    // ':' and '2:' would otherwise parse to a real position and stand a player
    // in a column nobody picked.
    expect(parseGrid(':')).toBeNull();
    expect(parseGrid('2:')).toBeNull();
    expect(parseGrid(':3')).toBeNull();
    expect(parseGrid('')).toBeNull();
  });

  it('refuses nonsense and out-of-range rows', () => {
    expect(parseGrid('nope')).toBeNull();
    expect(parseGrid('0:1')).toBeNull();
    expect(parseGrid('44:1')).toBeNull();
    expect(parseGrid('2:0')).toBeNull();
  });
});

describe('groupByRow', () => {
  it('orders rows from the keeper out, and columns within a row', () => {
    // A real 4-2-3-1's grids, deliberately shuffled — the feed does not
    // guarantee order.
    const players = [
      player({ playerId: 6, grid: '3:2' }),
      player({ playerId: 1, grid: '1:1' }),
      player({ playerId: 4, grid: '2:2' }),
      player({ playerId: 2, grid: '2:4' }),
      player({ playerId: 5, grid: '2:1' }),
      player({ playerId: 3, grid: '2:3' }),
      player({ playerId: 7, grid: '3:1' }),
    ];
    const rows = groupByRow(players);
    expect(rows.map((r) => r.map((p) => p.grid))).toEqual([
      ['1:1'],
      ['2:1', '2:2', '2:3', '2:4'],
      ['3:1', '3:2'],
    ]);
  });

  it('⚠ keeps a starter with no grid, in a trailing row — never a ten-man team', () => {
    const rows = groupByRow([
      player({ playerId: 1, grid: '1:1' }),
      player({ playerId: 9, grid: null }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[1].map((p) => p.playerId)).toEqual([9]);
    // Every player handed in comes back out.
    expect(rows.flat()).toHaveLength(2);
  });

  it('loses nobody from a full eleven', () => {
    const grids = ['1:1', '2:4', '2:3', '2:2', '2:1', '3:2', '3:1', '4:3', '4:2', '4:1', '5:1'];
    const rows = groupByRow(grids.map((g, i) => player({ playerId: i, grid: g })));
    expect(rows.flat()).toHaveLength(11);
    expect(rows.map((r) => r.length)).toEqual([1, 4, 2, 3, 1]);
  });

  it('is empty for an empty line-up', () => {
    expect(groupByRow([])).toEqual([]);
  });
});

describe('surnameOf', () => {
  it('drops the initial the feed already abbreviated', () => {
    expect(surnameOf('B. Leno')).toBe('Leno');
    expect(surnameOf('E. Nketiah')).toBe('Nketiah');
  });

  it('leaves a single name alone', () => {
    expect(surnameOf('Rodri')).toBe('Rodri');
  });

  it('handles nothing at all', () => {
    expect(surnameOf(null)).toBe('');
    expect(surnameOf('   ')).toBe('');
  });
});

// ------------------------------------------------------- which stats are drawn

function stats(over: Partial<MatchTeamStats> = {}): MatchTeamStats {
  return {
    side: 'home',
    possessionPct: null, shotsTotal: null, shotsOn: null, shotsOff: null,
    shotsBlocked: null, shotsInsideBox: null, shotsOutsideBox: null,
    fouls: null, freeKicks: null, corners: null, offsides: null,
    yellowCards: null, redCards: null, saves: null,
    passesTotal: null, passesAccurate: null, passesPct: null,
    expectedGoals: null, goalsPrevented: null,
    ...over,
  };
}

describe('visibleStatRows', () => {
  it('⚠ hides a row neither side has — an absent xG must not print 0.00', () => {
    const rows = visibleStatRows(stats({ possessionPct: 65 }), stats({ side: 'away', possessionPct: 35 }));
    expect(rows.map((r) => r.key)).toEqual(['possession']);
    expect(rows.find((r) => r.key === 'expected_goals')).toBeUndefined();
  });

  it('⚠ KEEPS a row only one side has — "14 shots to none" is a real answer', () => {
    // Hiding it would silently flatter the side with none.
    const rows = visibleStatRows(stats({ shotsTotal: 14 }), stats({ side: 'away' }));
    expect(rows.map((r) => r.key)).toContain('shots_total');
  });

  it('keeps a genuine zero — 0 is a value, null is an absence', () => {
    const rows = visibleStatRows(stats({ redCards: 0 }), stats({ side: 'away', redCards: 0 }));
    expect(rows.map((r) => r.key)).toEqual(['red_cards']);
  });

  it('is empty when there are no statistics at all', () => {
    expect(visibleStatRows(stats(), stats({ side: 'away' }))).toEqual([]);
    expect(visibleStatRows(null, null)).toEqual([]);
  });

  it('preserves the canonical running order, filtered', () => {
    // ⚠ The order is the DECLARED one with absent rows removed — never a
    // re-sort. Possession leads because it is the headline; the rest follow
    // their section. This asserts the relationship rather than a fixed tail,
    // so adding a section does not falsify it.
    const all = stats({
      possessionPct: 50, shotsTotal: 1, expectedGoals: 1.2, redCards: 1, passesPct: 80,
    });
    const rows = visibleStatRows(all, { ...all, side: 'away' });
    expect(rows[0].key).toBe('possession');
    const declared = STAT_ROWS.map((r) => r.key).filter((k) => rows.some((r) => r.key === k));
    expect(rows.map((r) => r.key)).toEqual(declared);
  });

  it('marks only the two decimals as decimals — the null policy rides on it', () => {
    const decimals = STAT_ROWS.filter((r) => r.decimals).map((r) => r.key);
    expect(decimals).toEqual(['expected_goals', 'goals_prevented']);
  });

  it('marks both percentages as percentages', () => {
    const pct = STAT_ROWS.filter((r) => r.percent).map((r) => r.key);
    expect(pct).toEqual(['possession', 'passes_pct']);
  });
});

// ------------------------------------------------------------- stat sections

describe('visibleStatSections', () => {
  it('groups the visible rows into cards, in the declared order', () => {
    const all = stats({
      possessionPct: 55, shotsTotal: 16, passesTotal: 400, saves: 4, fouls: 12,
      expectedGoals: 2.05,
    });
    const sections = visibleStatSections(all, { ...all, side: 'away' });
    expect(sections.map((s) => s.key)).toEqual([
      'possession', 'shots', 'expected', 'passing', 'goalkeeping', 'discipline',
    ]);
  });

  it('⚠ drops a section entirely when none of its rows has a value', () => {
    // A heading over a blank card reads as a bug. 20 of 60 Premier League stat
    // rows carry no xG at all, so this is the common case rather than an edge.
    const noXg = stats({ possessionPct: 55, shotsTotal: 16 });
    const sections = visibleStatSections(noXg, { ...noXg, side: 'away' });
    expect(sections.map((s) => s.key)).toEqual(['possession', 'shots']);
    expect(sections.find((s) => s.key === 'expected')).toBeUndefined();
  });

  it('keeps a section that has SOME of its rows, with only those rows', () => {
    // The feed sends `Free Kicks` on some fixtures and not others.
    const partial = stats({ yellowCards: 2, fouls: 11 });
    const [discipline] = visibleStatSections(partial, { ...partial, side: 'away' });
    expect(discipline.key).toBe('discipline');
    expect(discipline.rows.map((r) => r.key)).toEqual(['fouls', 'yellow_cards']);
  });

  it('is empty when the fixture has no statistics at all', () => {
    expect(visibleStatSections(stats(), stats({ side: 'away' }))).toEqual([]);
    expect(visibleStatSections(null, null)).toEqual([]);
  });

  it('never emits a section with zero rows', () => {
    const some = stats({ possessionPct: 50, saves: 3 });
    for (const section of visibleStatSections(some, { ...some, side: 'away' })) {
      expect(section.rows.length).toBeGreaterThan(0);
    }
  });
});

// --------------------------------------------------- which number is lit up

describe('leadingSide', () => {
  const row = (key: string) => STAT_ROWS.find((r) => r.key === key)!;
  const pair = (over: Partial<MatchTeamStats>, awayOver: Partial<MatchTeamStats>) =>
    [stats(over), stats({ side: 'away', ...awayOver })] as const;

  it('gives it to the higher number on almost everything', () => {
    const [h, a] = pair({ shotsTotal: 16 }, { shotsTotal: 13 });
    expect(leadingSide(row('shots_total'), h, a)).toBe('home');
    expect(leadingSide(row('shots_total'), a, h)).toBe('away');
  });

  it('⚠ gives it to the LOWER number on fouls and cards', () => {
    // A team-coloured pill reads as praise. Marking the dirtier side in their
    // own colour would congratulate them for it.
    const [h, a] = pair({ yellowCards: 4 }, { yellowCards: 2 });
    expect(leadingSide(row('yellow_cards'), h, a)).toBe('away');

    const [h2, a2] = pair({ fouls: 13 }, { fouls: 16 });
    expect(leadingSide(row('fouls'), h2, a2)).toBe('home');

    const [h3, a3] = pair({ offsides: 3 }, { offsides: 0 });
    expect(leadingSide(row('offsides'), h3, a3)).toBe('away');
  });

  it('⚠ lights NEITHER side on a tie — 0-0 red cards is the commonest row here', () => {
    const [h, a] = pair({ redCards: 0 }, { redCards: 0 });
    expect(leadingSide(row('red_cards'), h, a)).toBeNull();

    const [h2, a2] = pair({ shotsTotal: 11 }, { shotsTotal: 11 });
    expect(leadingSide(row('shots_total'), h2, a2)).toBeNull();
  });

  it('treats a missing COUNT as zero, so the side that has one leads', () => {
    const [h, a] = pair({ corners: 5 }, {});
    expect(leadingSide(row('corners'), h, a)).toBe('home');
  });

  it('⚠ lights nobody when only one side has a DECIMAL', () => {
    // A side with no xG figure did not score zero xG — it was never measured,
    // so it cannot lose the comparison either.
    const [h, a] = pair({ expectedGoals: 2.05 }, {});
    expect(leadingSide(row('expected_goals'), h, a)).toBeNull();
  });

  it('compares decimals properly when both sides have one', () => {
    const [h, a] = pair({ expectedGoals: 2.05 }, { expectedGoals: 0.39 });
    expect(leadingSide(row('expected_goals'), h, a)).toBe('home');
  });

  it('handles a side with no stats row at all', () => {
    expect(leadingSide(row('shots_total'), stats({ shotsTotal: 4 }), null)).toBe('home');
    expect(leadingSide(row('shots_total'), null, null)).toBeNull();
  });

  it('every lowerIsBetter row is one where more is genuinely worse', () => {
    // Guards against the flag drifting onto a stat where it inverts the meaning.
    const flipped = STAT_ROWS.filter((r) => r.lowerIsBetter).map((r) => r.key);
    expect(flipped.sort()).toEqual(['fouls', 'offsides', 'red_cards', 'yellow_cards']);
  });
});

describe('rowDepths — how deep each row stands', () => {
  it('⚠ pins the keeper in the goal area rather than a formation slot', () => {
    // He used to take an equal slice and stand 8.6% out — past the six-yard box
    // (3.79%) — spending a row's worth of pitch on a player who stays put.
    const d = rowDepths(5, true);
    expect(d[0]).toBe(GK_DEPTH);
    expect(d[0]).toBeLessThan(5.5 / 145 * 100 + 1); // about the goal area
  });

  it('⚠ spends what the keeper gave back on the outfield', () => {
    const d = rowDepths(5, true);
    const gap = d[2] - d[1];
    // The old even spread over the same pitch gave 9.2% between rows. The exact
    // figure moves whenever OUTFIELD_TO does — it went 10.67 to 10.0 when the
    // front row was pulled back — so the invariant is "better than the spread
    // it replaced", not a number. What matters in POINTS is asserted below,
    // against the pitch's real length.
    expect(gap).toBeGreaterThan(9.2);
  });

  it('runs the outfield end to end, not slice-by-slice', () => {
    const d = rowDepths(5, true);
    expect(d[1]).toBe(OUTFIELD_FROM);
    expect(d[d.length - 1]).toBe(OUTFIELD_TO);
  });

  it('⚠ never reaches the halfway line', () => {
    // At 50% the front row would stand on the centre circle among the eleven
    // coming the other way.
    for (const n of [2, 3, 4, 5, 6, 7, 8]) {
      for (const d of rowDepths(n, true)) expect(d).toBeLessThanOrEqual(48);
      for (const d of rowDepths(n, false)) expect(d).toBeLessThanOrEqual(48);
    }
  });

  it('⚠⚠ falls back to an even spread when the first row is NOT one keeper', () => {
    // `groupByRow` puts a starter with no `grid` in a trailing row, so a lineup
    // with no grids at all lands eleven players in "row one". Pinning that to
    // the goal line would stack the whole team on top of the keeper.
    const even = rowDepths(5, false);
    expect(even[0]).toBeGreaterThan(GK_DEPTH);
    // ⚠ Gaps compared with a tolerance, not by Set-of-floats: 46/5 repeated
    // does not subtract to the same double every time, and the first version of
    // this test failed on exactly that.
    const gaps = even.slice(1).map((d, i) => d - even[i]);
    for (const g of gaps) expect(g).toBeCloseTo(gaps[0], 9);
  });

  it('degenerate row counts do not divide by zero', () => {
    expect(rowDepths(0, true)).toEqual([]);
    expect(rowDepths(1, true)).toHaveLength(1);
    expect(rowDepths(2, true)).toEqual([GK_DEPTH, (OUTFIELD_FROM + OUTFIELD_TO) / 2]);
    for (const n of [1, 2, 3, 8]) {
      for (const d of rowDepths(n, true)) expect(Number.isFinite(d)).toBe(true);
    }
  });

  it('rows always run front to back', () => {
    for (const n of [2, 3, 4, 5, 6]) {
      const d = rowDepths(n, true);
      for (let i = 1; i < d.length; i++) expect(d[i]).toBeGreaterThan(d[i - 1]);
    }
  });
});

describe('⚠⚠ the two front rows must not collide', () => {
  // On 2026-09-09 they did: the away striker's substitution minute landed on
  // the home striker's name, and the name crossed the halfway line as well.
  // Nothing failed, because the numbers that decide it lived in three files —
  // the pitch's length, the row depths, and the size of a player's badges.
  // They are all in reach of this test now.
  const SCREEN = 393;
  const pitchPt = (SCREEN * PITCH_L) / 71; // the pitch itself, minus the bleed
  const pct = (p: number) => (p / 100) * pitchPt;

  it('two facing strikers clear each other', () => {
    // The gap between them is whatever is left of the pitch once both front
    // rows have taken their share.
    const gap = pct(100 - 2 * OUTFIELD_TO);
    const needed = REACH_UP + REACH_DOWN;
    expect(gap, `${gap.toFixed(0)}pt between them, ${needed.toFixed(0)}pt needed`).toBeGreaterThan(
      needed,
    );
  });

  it('a striker’s name does not cross the halfway line', () => {
    const toHalfway = pct(50 - OUTFIELD_TO);
    expect(toHalfway).toBeGreaterThan(REACH_DOWN);
  });

  it('consecutive rows clear each other', () => {
    const depths = rowDepths(5, true);
    const gap = pct(depths[2] - depths[1]);
    expect(gap).toBeGreaterThan(CHIP / 2 + REACH_DOWN);
  });

  it('⚠ the keeper’s badge stays on the pitch', () => {
    // He is pinned nearest his own goal line, so he is the one the top edge can
    // clip. Measured from the top of the DRAWING, which includes the bleed.
    const centreFromTop = ((BLEED + (GK_DEPTH / 100) * PITCH_L) * SCREEN) / 71;
    expect(centreFromTop, `keeper sits ${centreFromTop.toFixed(0)}pt down`).toBeGreaterThan(
      REACH_UP,
    );
  });
});
