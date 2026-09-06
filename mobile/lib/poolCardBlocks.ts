// =============================================================
// WHAT THE POOLS TAB CARD'S STAT STRIP SAYS, PER MODE
// =============================================================
// The strip used to be five hardcoded blocks — Rank, Points, Level, Form,
// Picks — for every pool whatever it was playing. That is the World Cup's
// shape, and three of the four league modes do not write those numbers:
//
//   · Showdown led on ACCURACY points while its leaderboard ranks on
//     `duel_points`, so the headline number and the rank beside it disagreed.
//   · Table showed five Form dots for a mode with ONE decision a season, so
//     they were grey from August to May.
//   · Last Man Standing showed Points in a mode with no points at all, and a
//     Rank whose stored value is `entry_id` order.
//
// ⚠ THIS MIRRORS `kpiTiles` IN lib/pools/card.ts — the same per-mode calls,
// argued out there — but it is NOT a copy of it, and the differences are
// deliberate: this card has FIVE blocks to the web's four, it keeps the picks
// RING the web has never had, and it leads on Rank where the web leads on the
// mode's score. Facts per mode must not drift; layout is allowed to.
//
// ⚠ NO REACT NATIVE IMPORTS. Metro and the root vitest both reach this file,
// which is how mobile logic gets asserted at all — see lib/resultsSections.ts.
// =============================================================

import type { HomeLeagueFacts } from './api';

/** What a block renders as. `rank` and `ring` carry their own renderers. */
export type PoolCardBlock =
  | { kind: 'rank'; rank: number | null; totalEntries: number; show: boolean }
  | { kind: 'stat'; label: string; value: string; sub?: string; muted?: boolean }
  | { kind: 'dots'; label: string; palette: 'form' | 'duel'; dots: string[] }
  | { kind: 'ring'; label: string };

/**
 * The subset of a pool the strip reads.
 *
 * Structural rather than importing `PoolSummary`, because that type lives in a
 * module that pulls in Supabase and React Native and would drag both into every
 * test of this file.
 */
export type BlockInput = {
  predictionMode: string | null;
  leagueMode: string | null;
  currentRank: number | null;
  totalEntries: number;
  totalPoints: number;
  hasScoringStarted: boolean;
  level: { number: number; name: string } | null;
  formResults: string[];
  league?: HomeLeagueFacts | null;
};

function rankBlock(p: BlockInput): PoolCardBlock {
  return {
    kind: 'rank',
    rank: p.currentRank,
    totalEntries: p.totalEntries,
    show: p.hasScoringStarted && p.currentRank !== null && p.totalEntries > 0,
  };
}

const RING: PoolCardBlock = { kind: 'ring', label: 'Picks' };

export function poolCardBlocks(p: BlockInput): PoolCardBlock[] {
  const L = p.league;
  const mode = L?.leagueMode ?? p.leagueMode;

  // ── Showdown ───────────────────────────────────────────────────────────
  // The mode is a LAYER over the weekly accuracy number, so accuracy is not
  // what decides anything here — `duel_points` is, and it leads
  // `league_finalize_ranks`. Putting it in the headline block means it and the
  // Rank beside it can never disagree.
  if (mode === 'showdown' && L?.showdown) {
    const sd = L.showdown;
    return [
      rankBlock(p),
      { kind: 'stat', label: 'Duel pts', value: fmt(sd.duelPoints) },
      // Byes are deliberately absent: a bye is not a result, and W/T/L is the
      // record a football follower already reads.
      { kind: 'stat', label: 'Record', value: `${sd.won}-${sd.tied}-${sd.lost}`, sub: 'W-T-L' },
      // ⚠ DUEL dots, not accuracy tiers. Reusing the gold/green/blue of
      // exact/winner_gd/winner would say the two strips mean the same thing.
      { kind: 'dots', label: 'Form', palette: 'duel', dots: sd.recentDuels },
      RING,
    ];
  }

  // ── Last Man Standing ──────────────────────────────────────────────────
  // ⚠ NO RANK BLOCK, and its absence is the decision. The stored rank in this
  // mode is `entry_id` order — every rung of `league_finalize_ranks`' cascade
  // is zero here and the "picked first" rung is infinity, because LMS picks
  // live in `league_lms_picks` and not `league_predictions`. Measured on
  // production 5 Sep 2026. Survival is also binary, so there is no rank to show
  // even if the number were right: numbering three survivors #1/#2/#3 invents a
  // hierarchy the football has not produced.
  //
  // ⚠ AND NO POINTS BLOCK. The mode has none, by design.
  if (mode === 'last_man_standing' && L?.lms) {
    const lms = L.lms;
    return [
      // The season score. Rounds repeat all season (migration 087), so this —
      // not survival — is what the mode is actually played for.
      {
        kind: 'stat',
        label: 'Rounds',
        value: fmt(lms.roundsWon),
        sub: lms.roundNumber != null ? `in ${lms.roundNumber}` : undefined,
      },
      // ⚠ PER ROUND, not per season: a club is spent for the round you spend it
      // in, and a new round opens with everybody back in and every club free.
      // The denominator is the season's own — 20 in England, 18 in Germany.
      clubsBlock(lms.clubsUsed, lms.clubPool),
      {
        kind: 'stat',
        label: 'Still in',
        value: String(lms.survivorsLeft),
        sub: lms.roundEntrants > 0 ? `of ${lms.roundEntrants}` : undefined,
        // Dimmed once you are out: still true, still worth watching, but it has
        // stopped being about you.
        muted: lms.isEliminated,
      },
      RING,
    ];
  }

  // ── Predict the Table ──────────────────────────────────────────────────
  // ⚠ NO FORM BLOCK. The mode has no weekly decision, so five dots would be
  // grey from August to May — which is what they were. `spotOn` and
  // `averageOff` are what move instead.
  if (mode === 'table' && L?.table) {
    const t = L.table;
    return [
      rankBlock(p),
      {
        kind: 'stat',
        label: 'Points',
        value: fmt(p.totalPoints),
        // Scoring runs live all season, but `league_standings` is upserted
        // CURRENT STATE, so a June feed correction could restate an award.
        // "Provisional" is that distinction, said out loud.
        sub: t.isFinal ? 'final' : 'provisional',
      },
      spotOnBlock(t),
      {
        kind: 'stat',
        label: 'Avg off',
        value: t.averageOff == null ? '—' : t.averageOff.toFixed(1),
        sub: t.averageOff == null ? undefined : 'places',
        muted: t.averageOff == null,
      },
      RING,
    ];
  }

  // ── League Pick'em ─────────────────────────────────────────────────────
  // The richest league mode: rank, points and form are all real here. Level is
  // the one World Cup block that goes — `entry_xp_state` is never written for a
  // league, so it would be a permanent "Lv.1".
  if (L) {
    return [
      rankBlock(p),
      { kind: 'stat', label: 'Points', value: fmt(p.totalPoints) },
      matchweekBlock(L),
      { kind: 'dots', label: 'Form', palette: 'form', dots: p.formResults },
      RING,
    ];
  }

  // ── World Cup ──────────────────────────────────────────────────────────
  // Unchanged, and reached whenever the server sent no league facts — which
  // includes an API older than that field. Falling back to the shape that has
  // always worked beats blanking a card.
  return [
    rankBlock(p),
    { kind: 'stat', label: 'Points', value: fmt(p.totalPoints) },
    ...(p.level
      ? [{ kind: 'stat' as const, label: p.level.name, value: `Lv.${p.level.number}` }]
      : []),
    { kind: 'dots', label: 'Form', palette: 'form', dots: p.formResults },
    RING,
  ];
}

function clubsBlock(used: number, pool: number): PoolCardBlock {
  // A denominator of zero would render "7 of 0" — the season's `club_count`
  // could not be read, so the tile shows the count alone rather than a fraction
  // that is arithmetically nonsense.
  if (pool <= 0) return { kind: 'stat', label: 'Clubs', value: String(used), sub: 'used', muted: used === 0 };
  return { kind: 'stat', label: 'Clubs', value: String(used), sub: `of ${pool}`, muted: used === 0 };
}

/**
 * ⚠ AN UNPLAYED SEASON IS NOT A TABLE FULL OF MISSES. Every club's actual
 * position is NULL until it has a standings row, so a zero here in August would
 * be a judgement on a table nobody has had a chance to be right about.
 */
function spotOnBlock(t: NonNullable<HomeLeagueFacts['table']>): PoolCardBlock {
  if (!t.hasTable) return { kind: 'stat', label: 'Spot on', value: '—', sub: 'no table', muted: true };
  if (t.averageOff == null) return { kind: 'stat', label: 'Spot on', value: '—', sub: 'not started', muted: true };
  return { kind: 'stat', label: 'Spot on', value: String(t.spotOn), sub: `of ${t.clubCount}`, muted: t.spotOn === 0 };
}

/**
 * ⚠ "3 of 38" IS READ, NEVER WRITTEN AS 38. Twenty clubs play 38 rounds; the
 * Bundesliga and Ligue 1 are eighteen clubs and 34.
 */
function matchweekBlock(L: HomeLeagueFacts): PoolCardBlock {
  if (L.openMatchweek == null) {
    return { kind: 'stat', label: 'Matchweek', value: '—', muted: true };
  }
  return {
    kind: 'stat',
    label: 'Matchweek',
    value: String(L.openMatchweek),
    sub: L.matchweekCount ? `of ${L.matchweekCount}` : undefined,
  };
}

function fmt(n: number): string {
  return n.toLocaleString();
}
