// =============================================================
// WHAT THE POOL PREVIEW TELLS SOMEONE ABOUT TO JOIN
// =============================================================
// Preview A (Ryan, 2026-10-09): the Discover card at the top, then "How it
// works" in plain lines, then the pool's own points, then Share and Join.
//
// ⚠ IT USED TO DESCRIBE A WORLD CUP POOL WHATEVER IT OPENED ON. A Premier
// League Pick'em pool got "Group Stage" and "Penalty Shootout" scoring, a
// deadline that was the season's last kick-off, a mode pill reading "Pool",
// and a Share button that said "Join MY World Cup prediction pool" — sent by
// somebody who was not in it.
//
// ⚠ EVERY NUMBER IS READ. Prices come from `pool_settings.group_*` (readable
// by any signed-in member — the same columns the league engine prices
// against), lock timing from the open matchweek, match counts from the
// matchweek. The in-pool rules screen (`LeaguePickemScoring`) cannot be reused
// here: its endpoint answers members only.
//
// ⚠ NO REACT NATIVE IMPORTS — the root vitest reaches this file.
// =============================================================

import { LEAGUE_MODES as LEAGUE_MODE_OPTIONS, WC_MODES } from './createPool';
import { discoverCardFacts, predictionStyleOf, type SeasonClock } from './discoverCard';
import { getCompetitionName } from './design/competition';
import { DUEL_LOSS, DUEL_TIE, DUEL_WIN } from './duelPoints';
import { poolTypeOf, type PoolType } from './poolsFilter';

export type PreviewPool = {
  poolName: string;
  poolCode: string;
  predictionMode: string | null;
  leagueMode: string | null;
  leagueDepth: string | null;
  leagueStartMatchweek: number | null;
  leagueTableLockAt: string | null;
  predictionDeadline: string | null;
  externalLeagueId: number | null;
  seasonClock: SeasonClock | null;
};

/** The game's full name — "Matchweek Pick’em", not the card pill's "Pick’em". */
export function longModeName(type: PoolType | null): string | null {
  if (!type) return null;
  return [...LEAGUE_MODE_OPTIONS, ...WC_MODES].find((m) => m.value === type)?.label ?? null;
}

function titleCase(name: string): string {
  return name
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function competitionNameOf(pool: PreviewPool): string | null {
  const name = getCompetitionName(pool.externalLeagueId);
  return name ? titleCase(name) : null;
}

function lockLine(clock: SeasonClock | null): string {
  const lead = clock?.openLockLeadMinutes;
  if (lead == null) return 'Picks for each matchweek lock before its first kick-off.';
  if (lead === 0) return 'Picks for each matchweek lock at its first kick-off.';
  if (lead === 60) return 'Picks for each matchweek lock an hour before its first kick-off.';
  return `Picks for each matchweek lock ${lead} minutes before its first kick-off.`;
}

/**
 * When a joiner's first picks would be — the season's facts only. ⚠ It does
 * not say what the others have scored, because that depends on when THIS pool
 * started, which a NULL `league_start_matchweek` does not record.
 */
function firstPicksLine(pool: PreviewPool, now: Date): string | null {
  const facts = discoverCardFacts(pool, pool.seasonClock, now);
  if (!facts.matchweek) return null;
  const { current, startsAt } = facts.matchweek;
  if (startsAt != null) return `This pool starts at matchweek ${startsAt} — your first picks would be for that week.`;
  if (current <= 1) return 'Your first picks would be for matchweek 1.';
  const closed = current === 2 ? 'Picks for matchweek 1 have closed.' : `Picks for matchweeks 1–${current - 1} have closed.`;
  return `${closed} Your first picks would be for matchweek ${current}.`;
}

/** "How it works", one sentence a line. */
export function howItWorks(pool: PreviewPool, now: Date): string[] {
  const type = poolTypeOf(pool);
  const competition = competitionNameOf(pool);
  const clock = pool.seasonClock;
  const matches = clock?.openFixtureCount
    ? `all ${clock.openFixtureCount}${competition ? ` ${competition}` : ''} matches`
    : `every${competition ? ` ${competition}` : ''} match`;

  switch (type) {
    case 'pickem':
    case 'showdown': {
      const lines = [
        predictionStyleOf(pool) === 'results'
          ? `Each matchweek, call ${matches} — home win, draw or away win.`
          : `Each matchweek, predict the score of ${matches}.`,
      ];
      if (type === 'showdown') {
        lines.push(
          `Each week you are also paired with one other player — beat their total for ${DUEL_WIN} points, tie it for ${DUEL_TIE}.`,
        );
      }
      lines.push(lockLine(clock));
      const first = firstPicksLine(pool, now);
      if (first) lines.push(first);
      return lines;
    }
    case 'last_man_standing':
      // ⚠ A late joiner enters the NEXT round, by design — never one already
      // under way (see the league start-matchweek notes).
      return [
        'Each matchweek, pick one club to win. Get it wrong and you are out.',
        'You cannot pick the same club twice in a round.',
        lockLine(clock),
        'If a round is already under way, you join the next one.',
      ];
    case 'table': {
      const lock = discoverCardFacts(pool, clock, now).lockAt;
      return [
        'One decision: put every club in the order you think they will finish.',
        'It is scored against the real table all season.',
        lock ? 'Your table locks at the deadline shown above.' : 'The deadline for this table has passed.',
      ];
    }
    case 'full_tournament':
    case 'progressive':
    case 'bracket_picker':
      return [WC_MODES.find((m) => m.value === type)!.desc(null)];
    default:
      return [];
  }
}

export type PointsCard = {
  title: string;
  rows: Array<{ label: string; points: number }>;
  footnote?: string;
};

export type LeaguePrices = {
  group_exact_score: number;
  group_correct_difference: number;
  group_correct_result: number;
};

/**
 * The points cards for a league pool, or null where there is nothing to price.
 *
 * ⚠⚠ A RESULTS-DEPTH CALL IS WORTH `group_exact_score`, NOT
 * `group_correct_result`. Migration 066: getting the outcome right is the most
 * a results pick can achieve, so it is charged at the top price. The World Cup
 * screen once told members it was worth half that. Same rule as
 * `LeaguePickemScoring`.
 *
 * Last Man Standing has no points. Predict the Table has them, but in
 * `league_pool_settings`, which only members can read — the preview explains
 * its rules without numbers rather than guess at them.
 */
export function leaguePointsCards(pool: PreviewPool, prices: LeaguePrices | null): PointsCard[] | null {
  const type = poolTypeOf(pool);
  if ((type !== 'pickem' && type !== 'showdown') || !prices) return null;

  const cards: PointsCard[] =
    predictionStyleOf(pool) === 'results'
      ? [{ title: 'Points per match', rows: [{ label: 'Right result', points: prices.group_exact_score }] }]
      : [
          {
            title: 'Points per match',
            rows: [
              { label: 'Exact score', points: prices.group_exact_score },
              { label: 'Right winner, right margin', points: prices.group_correct_difference },
              { label: 'Right winner', points: prices.group_correct_result },
            ],
            footnote: 'Only the best one you reach counts — they do not stack.',
          },
        ];

  if (type === 'showdown') {
    cards.push({
      title: 'Points per duel',
      rows: [
        { label: 'Win', points: DUEL_WIN },
        { label: 'Tie', points: DUEL_TIE },
        { label: 'Loss', points: DUEL_LOSS },
      ],
      footnote: 'Added to your points from the matches.',
    });
  }
  return cards;
}

/**
 * What Share sends.
 *
 * ⚠ NOT "JOIN MY POOL". The person sharing from Discover is not in it — they
 * are passing it on — and it is not a World Cup pool unless it is one.
 */
export function shareMessage(pool: PreviewPool): { message: string; url: string } {
  const url = `https://sportpool.io/join/${pool.poolCode}`;
  const game = longModeName(poolTypeOf(pool));
  const competition = competitionNameOf(pool);
  const what = [competition, game].filter(Boolean).join(' ');
  const intro = what ? `${pool.poolName} — a ${what} pool on SportPool.` : `${pool.poolName} — a pool on SportPool.`;
  return { message: `${intro}\n\nJoin with code ${pool.poolCode}: ${url}`, url };
}
