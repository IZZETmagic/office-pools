import { describe, expect, it } from 'vitest';

import {
  discoverCardFacts,
  formatCountdown,
  seasonClocks,
  type CardPool,
  type MatchweekRow,
} from '../discoverCard';

// 2026-10-09 19:45 UTC: Premier League matchweek 6 locks the next morning.
const NOW = new Date('2026-10-09T19:45:00Z');

const rows: MatchweekRow[] = [
  { season_id: 'pl', matchweek_number: 5, lock_at: '2026-10-03T10:30:00Z' },
  { season_id: 'pl', matchweek_number: 7, lock_at: '2026-10-17T10:30:00Z' },
  { season_id: 'pl', matchweek_number: 6, lock_at: '2026-10-10T10:30:00Z' },
  { season_id: 'pl', matchweek_number: 38, lock_at: '2027-05-23T14:00:00Z' },
  { season_id: 'over', matchweek_number: 1, lock_at: '2026-01-01T00:00:00Z' },
];

const league = (over: Partial<CardPool> = {}): CardPool => ({
  predictionMode: 'league_pickem',
  leagueMode: null,
  leagueStartMatchweek: null,
  leagueTableLockAt: null,
  predictionDeadline: '2027-05-30T15:00:00Z',
  ...over,
});

describe('seasonClocks', () => {
  const clocks = seasonClocks(rows, NOW);

  it('the open matchweek is the first whose lock is still ahead — whatever order the rows came in', () => {
    expect(clocks.get('pl')).toMatchObject({ openMatchweek: 6, openLockAt: '2026-10-10T10:30:00Z', total: 38 });
  });

  it('a finished season has no open matchweek', () => {
    expect(clocks.get('over')?.openMatchweek).toBeNull();
  });
});

describe('discoverCardFacts', () => {
  const pl = seasonClocks(rows, NOW).get('pl')!;

  it('a weekly league pool: the open matchweek and its lock', () => {
    expect(discoverCardFacts(league(), pl, NOW)).toEqual({
      matchweek: { current: 6, total: 38, startsAt: null },
      lockAt: '2026-10-10T10:30:00Z',
    });
  });

  it('never uses a league pool’s prediction_deadline — that is the season’s last kickoff', () => {
    expect(discoverCardFacts(league(), pl, NOW).lockAt).not.toBe('2027-05-30T15:00:00Z');
  });

  it('a pool that starts later counts down to ITS first lock', () => {
    expect(discoverCardFacts(league({ leagueStartMatchweek: 7 }), pl, NOW)).toEqual({
      matchweek: { current: 6, total: 38, startsAt: 7 },
      lockAt: '2026-10-17T10:30:00Z',
    });
  });

  it('a start matchweek already reached is no start at all', () => {
    expect(discoverCardFacts(league({ leagueStartMatchweek: 2 }), pl, NOW).matchweek?.startsAt).toBeNull();
  });

  it('Predict the Table counts down to its own deadline, and says nothing once it has passed', () => {
    const lock = '2026-10-12T12:00:00Z';
    expect(discoverCardFacts(league({ leagueMode: 'table', leagueTableLockAt: lock }), pl, NOW).lockAt).toBe(lock);
    expect(
      discoverCardFacts(league({ leagueMode: 'table', leagueTableLockAt: '2026-08-01T00:00:00Z' }), pl, NOW).lockAt,
    ).toBeNull();
  });

  it('a tournament pool has no matchweek and counts down to its deadline', () => {
    const pool = league({ predictionMode: 'full_tournament', predictionDeadline: '2026-10-12T00:00:00Z' });
    expect(discoverCardFacts(pool, null, NOW)).toEqual({ matchweek: null, lockAt: '2026-10-12T00:00:00Z' });
  });

  it('a league pool with no clock, or a season that is over, shows neither', () => {
    expect(discoverCardFacts(league(), null, NOW)).toEqual({ matchweek: null, lockAt: null });
    expect(discoverCardFacts(league(), seasonClocks(rows, NOW).get('over')!, NOW)).toEqual({ matchweek: null, lockAt: null });
  });
});

describe('formatCountdown', () => {
  const at = (ms: number) => new Date(NOW.getTime() + ms).toISOString();
  const H = 3_600_000;

  it('minutes, hours, then days', () => {
    expect(formatCountdown(at(25 * 60_000), NOW)).toEqual({ text: '25m', soon: true });
    expect(formatCountdown(at(14.75 * H), NOW)).toEqual({ text: '14h', soon: true });
    expect(formatCountdown(at(30 * H), NOW)).toEqual({ text: '30h', soon: false });
    expect(formatCountdown(at(75 * H), NOW)).toEqual({ text: '3d', soon: false });
  });

  it('nothing for a lock that has passed or does not exist', () => {
    expect(formatCountdown(at(-1), NOW)).toBeNull();
    expect(formatCountdown(null, NOW)).toBeNull();
  });
});
