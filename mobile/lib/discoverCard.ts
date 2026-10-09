// =============================================================
// WHAT A DISCOVER CARD TELLS SOMEONE DECIDING WHETHER TO JOIN
// =============================================================
// Card A (picked 2026-10-09): Players · Matchweek · Picks lock. The last two
// are derived here from the season's matchweeks, which is why this is a module
// and not arithmetic in the card.
//
// ⚠ "OPEN" IS THE FIRST MATCHWEEK WHOSE LOCK HAS NOT PASSED — derived, never
// stored (see the matchweek rhythm notes). A matchweek that has locked but is
// still being played is NOT the one a joiner picks in; the next one is. So the
// card's "Matchweek 6/38" is the week you would play next, and "Picks lock"
// counts down to THAT week's lock.
//
// ⚠ NO REACT NATIVE IMPORTS — the root vitest reaches this file.
// =============================================================

import { isLeaguePoolMode } from './design/poolMode';

/** One `league_matchweeks` row, as Discover reads it. */
export type MatchweekRow = {
  season_id: string;
  matchweek_number: number;
  lock_at: string | null;
};

/** Where one league season is, for every pool playing it. */
export type SeasonClock = {
  /** The matchweek a joiner would pick in next, or null once the season is over. */
  openMatchweek: number | null;
  openLockAt: string | null;
  total: number;
  /** Every matchweek's lock, for a pool that starts later than the open one. */
  lockAt: Record<number, string | null>;
};

/** One clock per season, from all of their matchweeks. */
export function seasonClocks(rows: MatchweekRow[], now: Date): Map<string, SeasonClock> {
  const bySeason = new Map<string, MatchweekRow[]>();
  for (const r of rows) {
    const list = bySeason.get(r.season_id) ?? [];
    list.push(r);
    bySeason.set(r.season_id, list);
  }
  const out = new Map<string, SeasonClock>();
  for (const [seasonId, list] of bySeason) {
    list.sort((a, b) => a.matchweek_number - b.matchweek_number);
    const open = list.find((r) => r.lock_at != null && new Date(r.lock_at).getTime() > now.getTime()) ?? null;
    out.set(seasonId, {
      openMatchweek: open?.matchweek_number ?? null,
      openLockAt: open?.lock_at ?? null,
      total: list.reduce((max, r) => Math.max(max, r.matchweek_number), 0),
      lockAt: Object.fromEntries(list.map((r) => [r.matchweek_number, r.lock_at])),
    });
  }
  return out;
}

export type CardPool = {
  predictionMode: string | null;
  leagueMode: string | null;
  /** `pools.league_start_matchweek` — a pool can start later than the open matchweek. */
  leagueStartMatchweek: number | null;
  /** Predict the Table's one deadline. */
  leagueTableLockAt: string | null;
  /** A World Cup pool's deadline. ⚠ On a league pool this is the season's LAST kickoff — never shown. */
  predictionDeadline: string | null;
};

export type DiscoverCardFacts = {
  /** Null for a tournament pool, and for a league season with nothing left to pick. */
  matchweek: { current: number; total: number; startsAt: number | null } | null;
  /** When a joiner's next picks lock, or null if nothing is waiting to be picked. */
  lockAt: string | null;
};

export function discoverCardFacts(pool: CardPool, clock: SeasonClock | null, now: Date): DiscoverCardFacts {
  const future = (iso: string | null) => (iso && new Date(iso).getTime() > now.getTime() ? iso : null);

  if (!isLeaguePoolMode(pool.predictionMode)) {
    return { matchweek: null, lockAt: future(pool.predictionDeadline) };
  }
  if (!clock || clock.openMatchweek == null) return { matchweek: null, lockAt: null };

  const startsAt =
    pool.leagueStartMatchweek != null && pool.leagueStartMatchweek > clock.openMatchweek
      ? pool.leagueStartMatchweek
      : null;

  const matchweek = { current: clock.openMatchweek, total: clock.total, startsAt };

  // Predict the Table is one decision with its own deadline, not a weekly lock.
  if (pool.leagueMode === 'table') return { matchweek, lockAt: future(pool.leagueTableLockAt) };

  const lockAt = startsAt != null ? future(clock.lockAt[startsAt] ?? null) : clock.openLockAt;
  return { matchweek, lockAt };
}

/**
 * "45m", "14h", "3d". `soon` under a day — the card tints it.
 *
 * ⚠ THE URGENCY IS THE FIXTURE'S, NOT OURS: the lock is the first kickoff of
 * the matchweek. Nothing here invents a deadline (gate 5).
 */
export function formatCountdown(lockAt: string | null, now: Date): { text: string; soon: boolean } | null {
  if (!lockAt) return null;
  const ms = new Date(lockAt).getTime() - now.getTime();
  if (ms <= 0) return null;
  const minutes = Math.floor(ms / 60_000);
  const hours = Math.floor(minutes / 60);
  const soon = hours < 24;
  if (hours < 1) return { text: `${Math.max(1, minutes)}m`, soon };
  if (hours < 48) return { text: `${hours}h`, soon };
  return { text: `${Math.floor(hours / 24)}d`, soon };
}

/** "26 Aug", in the reader's own calendar. */
export function formatSince(iso: string): string {
  const d = new Date(iso);
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
  return `${d.getDate()} ${month}`;
}
