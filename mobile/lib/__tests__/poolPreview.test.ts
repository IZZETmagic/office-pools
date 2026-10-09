import { describe, expect, it } from 'vitest';

import { seasonClocks } from '../discoverCard';
import { LEAGUE_ID } from '../design/competition';
import { DUEL_TIE, DUEL_WIN } from '../duelPoints';
import { howItWorks, leaguePointsCards, longModeName, shareMessage, type PreviewPool } from '../poolPreview';

// 2026-10-09 19:45 UTC: matchweek 6 (10 matches) locks 10:30, kicks off 11:30.
const NOW = new Date('2026-10-09T19:45:00Z');
const clock = seasonClocks(
  [
    { season_id: 'pl', matchweek_number: 6, lock_at: '2026-10-10T10:30:00Z', first_kickoff_at: '2026-10-10T11:30:00Z', fixture_count: 10 },
    { season_id: 'pl', matchweek_number: 7, lock_at: '2026-10-17T10:30:00Z', first_kickoff_at: '2026-10-17T11:30:00Z', fixture_count: 10 },
    { season_id: 'pl', matchweek_number: 38, lock_at: '2027-05-23T14:00:00Z', first_kickoff_at: '2027-05-23T15:00:00Z', fixture_count: 10 },
  ],
  NOW,
).get('pl')!;

/** galacticoco on 2026-10-09: Premier League Pick'em, NULL league_mode and depth. */
function pool(over: Partial<PreviewPool> = {}): PreviewPool {
  return {
    poolName: 'galacticoco',
    poolCode: 'ABC123',
    predictionMode: 'league_pickem',
    leagueMode: null,
    leagueDepth: null,
    leagueStartMatchweek: null,
    leagueTableLockAt: null,
    predictionDeadline: '2027-05-30T15:00:00Z',
    externalLeagueId: LEAGUE_ID.premierLeague,
    seasonClock: clock,
    ...over,
  };
}

const PRICES = { group_exact_score: 100, group_correct_difference: 75, group_correct_result: 50 };

describe('howItWorks', () => {
  it('Pick’em by score: the match count, the lock read off the data, and where you would start', () => {
    expect(howItWorks(pool(), NOW)).toEqual([
      'Each matchweek, predict the score of all 10 Premier League matches.',
      'Picks for each matchweek lock an hour before its first kick-off.',
      'Picks for matchweeks 1–5 have closed. Your first picks would be for matchweek 6.',
    ]);
  });

  it('Pick’em by result says call, not predict the score', () => {
    expect(howItWorks(pool({ leagueDepth: 'results' }), NOW)[0]).toBe(
      'Each matchweek, call all 10 Premier League matches — home win, draw or away win.',
    );
  });

  it('Showdown adds the duel, with the real duel points', () => {
    expect(howItWorks(pool({ leagueMode: 'showdown' }), NOW)[1]).toBe(
      `Each week you are also paired with one other player — beat their total for ${DUEL_WIN} points, tie it for ${DUEL_TIE}.`,
    );
  });

  it('a pool that starts later says so', () => {
    expect(howItWorks(pool({ leagueStartMatchweek: 7 }), NOW)).toContain(
      'This pool starts at matchweek 7 — your first picks would be for that week.',
    );
  });

  it('the lock line follows the data, not an assumption', () => {
    const atKickoff = seasonClocks(
      [{ season_id: 's', matchweek_number: 2, lock_at: '2026-10-10T11:30:00Z', first_kickoff_at: '2026-10-10T11:30:00Z', fixture_count: 10 }],
      NOW,
    ).get('s')!;
    expect(howItWorks(pool({ seasonClock: atKickoff }), NOW)).toContain('Picks for each matchweek lock at its first kick-off.');
  });

  it('Last Man Standing: one club a week, and a late joiner waits for the next round', () => {
    const lines = howItWorks(pool({ leagueMode: 'last_man_standing' }), NOW);
    expect(lines[0]).toBe('Each matchweek, pick one club to win. Get it wrong and you are out.');
    expect(lines).toContain('If a round is already under way, you join the next one.');
  });

  it('Predict the Table: one decision, and an honest line once its deadline has gone', () => {
    expect(howItWorks(pool({ leagueMode: 'table', leagueTableLockAt: '2026-08-01T00:00:00Z' }), NOW)).toContain(
      'The deadline for this table has passed.',
    );
  });

  it('a World Cup mode uses the create flow’s own description', () => {
    expect(howItWorks(pool({ predictionMode: 'progressive', seasonClock: null }), NOW)[0]).toMatch(/round-by-round/);
  });
});

describe('leaguePointsCards', () => {
  it('predict the score: three tiers from the pool’s own settings, and they do not stack', () => {
    expect(leaguePointsCards(pool(), PRICES)).toEqual([
      {
        title: 'Points per match',
        rows: [
          { label: 'Exact score', points: 100 },
          { label: 'Right winner, right margin', points: 75 },
          { label: 'Right winner', points: 50 },
        ],
        footnote: 'Only the best one you reach counts — they do not stack.',
      },
    ]);
  });

  it('⚠ a results call is worth the TOP price, not the result price (066)', () => {
    expect(leaguePointsCards(pool({ leagueDepth: 'results' }), PRICES)?.[0].rows).toEqual([
      { label: 'Right result', points: 100 },
    ]);
  });

  it('Showdown adds the duel card', () => {
    const cards = leaguePointsCards(pool({ leagueMode: 'showdown' }), PRICES)!;
    expect(cards[1].rows).toEqual([
      { label: 'Win', points: DUEL_WIN },
      { label: 'Tie', points: DUEL_TIE },
      { label: 'Loss', points: 0 },
    ]);
  });

  it('nothing to price for Last Man Standing, the Table (members-only prices), or missing settings', () => {
    expect(leaguePointsCards(pool({ leagueMode: 'last_man_standing' }), PRICES)).toBeNull();
    expect(leaguePointsCards(pool({ leagueMode: 'table' }), PRICES)).toBeNull();
    expect(leaguePointsCards(pool(), null)).toBeNull();
  });
});

describe('shareMessage', () => {
  it('names the pool, competition and game — never “my”, never World Cup for a league pool', () => {
    const { message, url } = shareMessage(pool());
    expect(message).toBe(
      'galacticoco — a Premier League Matchweek Pick’em pool on SportPool.\n\nJoin with code ABC123: https://sportpool.io/join/ABC123',
    );
    expect(url).toBe('https://sportpool.io/join/ABC123');
    expect(message).not.toMatch(/\bmy\b|World Cup/i);
  });

  it('a World Cup pool says World Cup', () => {
    expect(shareMessage(pool({ predictionMode: 'full_tournament', externalLeagueId: LEAGUE_ID.worldCup })).message).toMatch(
      /^galacticoco — a World Cup Full Tournament pool on SportPool\./,
    );
  });
});

describe('longModeName', () => {
  it('uses the create flow’s labels', () => {
    expect(longModeName('last_man_standing')).toBe('Last Man Standing');
    expect(longModeName(null)).toBeNull();
  });
});
