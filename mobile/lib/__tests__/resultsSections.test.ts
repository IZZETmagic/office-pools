// =============================================================
// The Results list, now that it carries two competitions
// =============================================================
// The first test `mobile/` has ever had. It is here because of one specific
// silent failure and one specific regression risk.
//
// THE FAILURE: `roundSections` filtered on a hard-coded ladder of seven World
// Cup stages. A league fixture is stamped `regular_season`, which is in none of
// them, so every one fell through, the section list came back empty, and the
// screen rendered "No Matches" while holding a full season. Nothing threw. An
// empty array is a valid answer, which is exactly why nobody saw it.
//
// THE RISK: one list now serves both competitions. The World Cup path is
// shipped and working, so every assertion below that names it is a regression
// guard, not a feature.
// =============================================================

import { describe, it, expect } from 'vitest';
import {
  anchorSectionIndex,
  competitionBlocks,
  dateSections,
  distinctCompetitions,
  roundSections,
  windowSections,
  ROW_BUDGET,
  type MatchSection,
} from '../resultsSections';
import type { ResultsMatch } from '../useTournamentMatches';

const match = (o: Partial<ResultsMatch> = {}): ResultsMatch => ({
  matchId: 'm1',
  matchNumber: 1,
  stage: 'group',
  groupLetter: 'A',
  matchDate: '2026-06-11T15:00:00.000Z',
  status: 'completed',
  statusDetail: null,
  originalMatchDate: null,
  venue: null,
  homeTeamId: 'h',
  awayTeamId: 'a',
  homeScoreFt: null,
  awayScoreFt: null,
  homeScorePso: null,
  awayScorePso: null,
  liveMinute: null,
  livePeriod: null,
  liveAdded: null,
  homeTeamPlaceholder: null,
  awayTeamPlaceholder: null,
  homeTeam: null,
  awayTeam: null,
  roundNumber: null,
  competition: null,
  competitionId: null,
  ...o,
});

/** A league fixture: no group, `regular_season`, matchweek in `roundNumber`. */
const fixture = (matchweek: number, o: Partial<ResultsMatch> = {}) =>
  match({
    stage: 'regular_season',
    groupLetter: null,
    roundNumber: matchweek,
    competition: 'Premier League',
    competitionId: 39,
    ...o,
  });

const section = (id: string, rows: number, o: Partial<ResultsMatch> = {}): MatchSection => ({
  id,
  label: id,
  matches: Array.from({ length: rows }, (_, i) => match({ matchId: `${id}-${i}`, ...o })),
  // Windowing and anchoring read `matches`, never `blocks`; an empty one here
  // keeps those tests honest about which field they actually depend on.
  blocks: [],
});

describe('roundSections', () => {
  it('sections a league by matchweek, in the wording the web uses', () => {
    const sections = roundSections([fixture(12), fixture(3)]);
    expect(sections.map((s) => s.label)).toEqual(['Matchweek 3', 'Matchweek 12']);
  });

  it('does not return an empty list for a league — the bug this replaced', () => {
    // Before 2026-09-02 this returned [] and the screen said "No Matches".
    expect(roundSections([fixture(1)])).toHaveLength(1);
  });

  it('never prints the raw stage enum at a member', () => {
    const labels = roundSections([fixture(7)]).map((s) => s.label);
    expect(labels).not.toContain('regular_season');
  });

  it('still sections the World Cup by its ladder, in ladder order', () => {
    const sections = roundSections([
      match({ matchId: 'f', stage: 'final', groupLetter: null }),
      match({ matchId: 'g', stage: 'group' }),
      match({ matchId: 'q', stage: 'quarter_final', groupLetter: null }),
    ]);
    expect(sections.map((s) => s.label)).toEqual(['Group Stage', 'Quarter Finals', 'Final']);
  });

  it('keeps a finished World Cup and a live league apart, ladder first', () => {
    const sections = roundSections([fixture(1), match({ stage: 'final', groupLetter: null })]);
    expect(sections.map((s) => s.label)).toEqual(['Final', 'Matchweek 1']);
  });

  it('orders within a matchweek by kickoff, not by arrival', () => {
    const sections = roundSections([
      fixture(1, { matchId: 'late', matchDate: '2026-08-15T19:00:00.000Z' }),
      fixture(1, { matchId: 'early', matchDate: '2026-08-15T11:30:00.000Z' }),
    ]);
    expect(sections[0].matches.map((m) => m.matchId)).toEqual(['early', 'late']);
  });
});

describe('dateSections', () => {
  it('buckets both competitions by kickoff day without reading stage', () => {
    const sections = dateSections([
      fixture(1, { matchId: 'pl', matchDate: '2026-08-15T11:30:00.000Z' }),
      match({ matchId: 'wc', matchDate: '2026-08-15T19:00:00.000Z' }),
    ]);
    expect(sections).toHaveLength(1);
    expect(sections[0].matches.map((m) => m.matchId)).toEqual(['pl', 'wc']);
  });

  it('does not lose a fixture with an unparseable date', () => {
    const sections = dateSections([fixture(1, { matchDate: '' })]);
    expect(sections[0].label).toBe('Date TBD');
  });
});

describe('anchorSectionIndex', () => {
  it('prefers a section with a game in progress', () => {
    const sections = [
      section('a', 1),
      section('b', 1, { status: 'live' }),
      section('c', 1, { status: 'scheduled' }),
    ];
    expect(anchorSectionIndex(sections)).toBe(1);
  });

  it('falls back to the next one to be played', () => {
    const sections = [section('a', 1), section('b', 1, { status: 'scheduled' })];
    expect(anchorSectionIndex(sections)).toBe(1);
  });

  it('lands on the most recent when the season is over', () => {
    const sections = [section('a', 1), section('b', 1)];
    expect(anchorSectionIndex(sections)).toBe(1);
  });
});

describe('windowSections', () => {
  it('mounts a World Cup whole — 64 matches is under the budget', () => {
    // ⚠ The regression guard for the shipped surface. If this ever fails, the
    // windowing has started hiding matches from a member who could see them
    // all yesterday.
    const sections = Array.from({ length: 32 }, (_, i) => section(`d${i}`, 2));
    const { start, end } = windowSections(sections, 20, ROW_BUDGET);
    expect({ start, end }).toEqual({ start: 0, end: 32 });
  });

  it('mounts a bounded slice of a season, not all 380 rows', () => {
    const sections = Array.from({ length: 38 }, (_, i) => section(`mw${i}`, 10));
    const { start, end } = windowSections(sections, 20, ROW_BUDGET);
    const rows = sections.slice(start, end).reduce((n, s) => n + s.matches.length, 0);
    expect(rows).toBeLessThanOrEqual(ROW_BUDGET + 10);
    expect(end - start).toBeLessThan(38);
  });

  it('grows OUTWARD from the anchor, so the current week is in the window', () => {
    // The whole point: "the first 120 rows" of a season is August, while the
    // game on tonight is off the bottom of the list entirely.
    const sections = Array.from({ length: 38 }, (_, i) => section(`mw${i}`, 10));
    const { start, end } = windowSections(sections, 30, ROW_BUDGET);
    expect(start).toBeLessThanOrEqual(30);
    expect(end).toBeGreaterThan(30);
  });

  it('handles an anchor at either end without running off the list', () => {
    const sections = Array.from({ length: 38 }, (_, i) => section(`mw${i}`, 10));
    expect(windowSections(sections, 0, ROW_BUDGET).start).toBe(0);
    expect(windowSections(sections, 37, ROW_BUDGET).end).toBe(38);
    // Out-of-range anchors are clamped rather than throwing.
    expect(windowSections(sections, -5, ROW_BUDGET).start).toBe(0);
    expect(windowSections(sections, 999, ROW_BUDGET).end).toBe(38);
  });

  it('is empty for an empty list rather than undefined', () => {
    expect(windowSections([], 0, ROW_BUDGET)).toEqual({ start: 0, end: 0 });
  });

  it('always mounts at least the anchor, even if it alone blows the budget', () => {
    const sections = [section('huge', 500)];
    expect(windowSections(sections, 0, ROW_BUDGET)).toEqual({ start: 0, end: 1 });
  });
});

describe('competitionBlocks', () => {
  const LA_LIGA = { competition: 'La Liga', competitionId: 140 };

  it('splits a day into one block per competition', () => {
    const blocks = competitionBlocks([
      fixture(3, { matchId: 'pl-1' }),
      fixture(3, { matchId: 'll-1', ...LA_LIGA }),
      fixture(3, { matchId: 'pl-2' }),
    ]);
    expect(blocks).toHaveLength(2);
    expect(blocks.map((b) => b.competition).sort()).toEqual(['La Liga', 'Premier League']);
  });

  it('loses nothing — the blocks hold every match the section does', () => {
    const matches = [
      fixture(3, { matchId: 'a' }),
      fixture(3, { matchId: 'b', ...LA_LIGA }),
      fixture(3, { matchId: 'c' }),
      match({ matchId: 'wc' }),
    ];
    const ids = competitionBlocks(matches)
      .flatMap((b) => b.matches.map((m) => m.matchId))
      .sort();
    expect(ids).toEqual(['a', 'b', 'c', 'wc']);
  });

  it('keys on the id, so one league under two spellings stays one block', () => {
    const blocks = competitionBlocks([
      fixture(3, { matchId: 'a', competition: 'Premier League', competitionId: 39 }),
      fixture(3, { matchId: 'b', competition: 'English Premier League', competitionId: 39 }),
    ]);
    expect(blocks).toHaveLength(1);
  });

  it('orders blocks by first kickoff, not alphabetically', () => {
    // La Liga alphabetises first; the Premier League kicks off first.
    const blocks = competitionBlocks([
      fixture(3, { matchId: 'll', matchDate: '2026-09-05T14:00:00.000Z', ...LA_LIGA }),
      fixture(3, { matchId: 'pl', matchDate: '2026-09-05T11:30:00.000Z' }),
    ]);
    expect(blocks.map((b) => b.competition)).toEqual(['Premier League', 'La Liga']);
  });

  it('collects World Cup matches into one unnamed block rather than dropping them', () => {
    const blocks = competitionBlocks([match({ matchId: 'wc1' }), match({ matchId: 'wc2' })]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].competition).toBeNull();
    expect(blocks[0].matches).toHaveLength(2);
  });
});

describe('dateSections blocks', () => {
  it('gives each day its own competition split', () => {
    const sections = dateSections([
      fixture(3, { matchId: 'a', matchDate: '2026-09-05T11:30:00.000Z' }),
      fixture(3, { matchId: 'b', matchDate: '2026-09-05T14:00:00.000Z', competition: 'La Liga', competitionId: 140 }),
      fixture(3, { matchId: 'c', matchDate: '2026-09-06T14:00:00.000Z', competition: 'La Liga', competitionId: 140 }),
    ]);
    expect(sections).toHaveLength(2);
    expect(sections[0].blocks).toHaveLength(2);
    expect(sections[1].blocks).toHaveLength(1);
  });

  it('keeps blocks and matches in step, so neither can drift', () => {
    const sections = dateSections([
      fixture(3, { matchId: 'a' }),
      fixture(3, { matchId: 'b', competition: 'La Liga', competitionId: 140 }),
    ]);
    for (const s of sections) {
      const fromBlocks = s.blocks.flatMap((b) => b.matches.map((m) => m.matchId)).sort();
      expect(fromBlocks).toEqual(s.matches.map((m) => m.matchId).sort());
    }
  });
});

describe('roundSections blocks', () => {
  it('splits a MERGED matchweek by competition — two leagues share the number', () => {
    // ⚠ The bucket is keyed on `roundNumber` alone, so both leagues' Matchweek 3
    // lands in one section. The blocks are what stop it rendering as one
    // shuffled list of ten games from two competitions.
    const sections = roundSections([
      fixture(3, { matchId: 'pl' }),
      fixture(3, { matchId: 'll', competition: 'La Liga', competitionId: 140 }),
    ]);
    expect(sections).toHaveLength(1);
    expect(sections[0].label).toBe('Matchweek 3');
    expect(sections[0].blocks).toHaveLength(2);
  });
});

describe('distinctCompetitions', () => {
  it('lists each competition once, with its count', () => {
    const list = distinctCompetitions([
      fixture(3, { matchId: 'a' }),
      fixture(3, { matchId: 'b' }),
      fixture(3, { matchId: 'c', competition: 'La Liga', competitionId: 140 }),
    ]);
    expect(list).toEqual([
      { id: 39, name: 'Premier League', count: 2 },
      { id: 140, name: 'La Liga', count: 1 },
    ]);
  });

  it('omits the World Cup, so a World-Cup-only member gets no pill', () => {
    expect(distinctCompetitions([match(), match()])).toEqual([]);
  });

  it('orders by first kickoff, matching the block order', () => {
    const list = distinctCompetitions([
      fixture(3, { matchDate: '2026-09-05T14:00:00.000Z', competition: 'La Liga', competitionId: 140 }),
      fixture(3, { matchDate: '2026-09-05T11:30:00.000Z' }),
    ]);
    expect(list.map((c) => c.name)).toEqual(['Premier League', 'La Liga']);
  });
});
