// =============================================================
// The Profile hub's pure logic — badge tallies and the tile / footer copy
// =============================================================
// Kept free of React and Supabase so it is testable from the root vitest run
// (mobile/lib/__tests__/profileHub.test.ts).
// =============================================================

import { ordinal } from './ordinal';
import { poolCardBlocks, type BlockInput } from './poolCardBlocks';

/**
 * Badges that describe a CURRENT state rather than an achievement — `top_dog`
 * is held while you lead and handed on when you don't. Counting its unlocks
 * would put a trophy on the shelf for every afternoon somebody was top.
 */
export const TRANSIENT_BADGES = new Set(['top_dog']);

export type BadgeUnlockRow = {
  badgeId: string;
  poolId: string;
  poolName: string | null;
  /** ISO timestamp. Null only in hand-built test rows. */
  unlockedAt?: string | null;
};

export type BadgeTally = {
  id: string;
  count: number;
  /** Distinct pools it was earned in, in first-seen order. */
  pools: { poolId: string; poolName: string | null }[];
  /** Every unlock, newest first — the tap-a-badge list. */
  unlocks: { poolId: string; poolName: string | null; unlockedAt: string | null }[];
};

/** One entry per badge, most-earned first, ties alphabetical. */
export function tallyBadges(rows: BadgeUnlockRow[]): BadgeTally[] {
  const byBadge = new Map<string, BadgeTally>();
  for (const row of rows) {
    if (TRANSIENT_BADGES.has(row.badgeId)) continue;
    let tally = byBadge.get(row.badgeId);
    if (!tally) {
      tally = { id: row.badgeId, count: 0, pools: [], unlocks: [] };
      byBadge.set(row.badgeId, tally);
    }
    tally.count += 1;
    tally.unlocks.push({
      poolId: row.poolId,
      poolName: row.poolName,
      unlockedAt: row.unlockedAt ?? null,
    });
    if (!tally.pools.some((p) => p.poolId === row.poolId)) {
      tally.pools.push({ poolId: row.poolId, poolName: row.poolName });
    }
  }
  for (const tally of byBadge.values()) {
    tally.unlocks.sort((a, b) => (b.unlockedAt ?? '').localeCompare(a.unlockedAt ?? ''));
  }
  return [...byBadge.values()].sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
}

export function formatBadgeName(id: string): string {
  return id
    .replace(/^bp_/, '')
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Where a badge came from, as one short line: the pool, or "3 pools". */
export function badgeSource(tally: BadgeTally): string {
  if (tally.pools.length === 1) return tally.pools[0].poolName ?? '1 pool';
  return `${tally.pools.length} pools`;
}

// -------------------------------------------------------------
// Podium finishes
// -------------------------------------------------------------

/** The slice of a PoolSummary the podium needs — kept narrow so tests stay small. */
export type PodiumPoolInput = {
  poolId: string;
  poolName: string;
  status: string;
  leagueMode: string | null;
  currentRank: number | null;
  totalEntries: number;
  memberCount: number;
};

export type PodiumFinish = { poolId: string; poolName: string; rank: 1 | 2 | 3; field: number };

export type Podium = {
  first: number;
  second: number;
  third: number;
  /** Best first, then by pool name. */
  finishes: PodiumFinish[];
};

/**
 * 1st, 2nd and 3rd place finishes across FINISHED pools.
 *
 * The rules, each one sayable in a tooltip:
 *   · Only finished pools (`status = 'completed'`). A live rank is not a finish.
 *   · Archived pools don't count — same rule as badges (migration 040).
 *   · ⚠⚠ Last Man Standing never counts. Its stored rank is entry_id order
 *     (every tie-break rung is zero), and the Home data falls back to the raw
 *     `pool_entries.current_rank` when the scoring summary has no rank — so a
 *     "2nd" here would be the order people joined. Excluded by mode, not by
 *     trusting a null.
 *   · You must have finished above at least one other entry. 1st of 1 is not a
 *     title, and 3rd of 3 is last, not a podium.
 */
export function podiumFinishes(pools: PodiumPoolInput[], archivedIds: ReadonlySet<string>): Podium {
  const finishes: PodiumFinish[] = [];
  for (const p of pools) {
    if (p.status !== 'completed') continue;
    if (archivedIds.has(p.poolId)) continue;
    if (p.leagueMode === 'last_man_standing') continue;
    const rank = p.currentRank;
    if (rank !== 1 && rank !== 2 && rank !== 3) continue;
    const field = p.totalEntries || p.memberCount;
    if (field <= rank) continue;
    finishes.push({ poolId: p.poolId, poolName: p.poolName, rank, field });
  }
  finishes.sort((a, b) => a.rank - b.rank || a.poolName.localeCompare(b.poolName));
  return {
    first: finishes.filter((f) => f.rank === 1).length,
    second: finishes.filter((f) => f.rank === 2).length,
    third: finishes.filter((f) => f.rank === 3).length,
    finishes,
  };
}

/**
 * The Trophy Room tile's teaser. Null while loading, so the tile shows nothing
 * rather than a confident "0".
 */
export function trophyTeaser(badgeTotal: number | null, titles: number | null = 0): string | null {
  if (badgeTotal === null || titles === null) return null;
  const parts: string[] = [];
  if (titles > 0) parts.push(titles === 1 ? '1 title' : `${titles} titles`);
  if (badgeTotal > 0) parts.push(badgeTotal === 1 ? '1 badge' : `${badgeTotal.toLocaleString()} badges`);
  if (parts.length === 0) return 'Your first badge is waiting';
  return parts.join(' · ');
}

/**
 * The footer line. `runtimeVersion` is the one worth reading when checking which
 * OTA a phone is on — it is what an update has to match to be applied.
 *
 * ⚠ The update id is only present when the bundle came from EAS Update. Under
 * Metro it is null, and the footer says "dev" rather than inventing one.
 */
export function versionLabel(params: {
  appVersion: string | null | undefined;
  runtimeVersion: string | null | undefined;
  updateId: string | null | undefined;
  isDev: boolean;
}): string {
  const version = params.appVersion ?? '?';
  const parts = [`SportPool ${version}`];
  if (params.runtimeVersion && params.runtimeVersion !== version) {
    parts.push(`runtime ${params.runtimeVersion}`);
  }
  if (params.isDev) parts.push('dev');
  else if (params.updateId) parts.push(`update ${params.updateId.slice(0, 8)}`);
  return parts.join(' · ');
}

// -------------------------------------------------------------
// Seasons — every competition you've played, grouped
// -------------------------------------------------------------

export type SeasonTournament = {
  tournamentId: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
};

export type SeasonPoolInput = BlockInput & {
  poolId: string;
  poolName: string;
  status: string;
  tournamentId: string;
  memberCount: number;
};

export type SeasonSection<P extends SeasonPoolInput = SeasonPoolInput> = {
  tournamentId: string;
  name: string;
  /**
   * ⚠ DERIVED FROM YOUR POOLS, NOT `tournaments.status`. That column is not
   * maintained — the World Cup still reads "upcoming" after its final. A
   * competition is live for you while any of your pools in it is still open.
   */
  live: boolean;
  pools: P[];
};

/**
 * Pools grouped by competition. Live competitions first, then finished ones,
 * each newest first by end date; pools inside a section open first, then by
 * name.
 *
 * ⚠ ARCHIVED POOLS ARE LEFT OUT. They have their own place — the Archived Pools
 * row in settings — and Seasons, like the Trophy Room, is the record of what
 * you are still showing (Ryan, 2026-09-28).
 */
export function groupSeasons<P extends SeasonPoolInput>(
  pools: P[],
  tournaments: SeasonTournament[],
  archivedIds: ReadonlySet<string>,
): SeasonSection<P>[] {
  const byId = new Map(tournaments.map((t) => [t.tournamentId, t]));
  const sections = new Map<string, SeasonSection<P>>();

  for (const p of pools) {
    if (archivedIds.has(p.poolId)) continue;
    let section = sections.get(p.tournamentId);
    if (!section) {
      section = {
        tournamentId: p.tournamentId,
        name: byId.get(p.tournamentId)?.name ?? 'Competition',
        live: false,
        pools: [],
      };
      sections.set(p.tournamentId, section);
    }
    section.pools.push(p);
    if (p.status !== 'completed') section.live = true;
  }

  const endOf = (id: string) => byId.get(id)?.endDate ?? byId.get(id)?.startDate ?? '';
  const out = [...sections.values()];
  for (const s of out) {
    s.pools.sort(
      (a, b) =>
        Number(a.status === 'completed') - Number(b.status === 'completed') ||
        a.poolName.localeCompare(b.poolName),
    );
  }
  out.sort(
    (a, b) =>
      Number(b.live) - Number(a.live) ||
      endOf(b.tournamentId).localeCompare(endOf(a.tournamentId)) ||
      a.name.localeCompare(b.name),
  );
  return out;
}

export type SeasonStat = { value: string; label: string; muted?: boolean };

/**
 * The two figures a Seasons row shows, taken from the SAME per-mode blocks the
 * Pools tab card uses (`poolCardBlocks`) so the two surfaces cannot disagree.
 *
 * A rank reads "3rd · of 14"; a stat reads "112 · Points". Dots and the picks
 * ring are card furniture and are dropped. Last Man Standing has no rank block
 * at all — that decision lives in `poolCardBlocks`, and is inherited here.
 */
export function seasonRowStats(p: BlockInput): SeasonStat[] {
  const out: SeasonStat[] = [];
  for (const b of poolCardBlocks(p)) {
    if (b.kind === 'rank') {
      if (b.show && b.rank !== null) {
        out.push({ value: ordinal(b.rank), label: `of ${b.totalEntries}` });
      }
    } else if (b.kind === 'stat') {
      out.push({ value: b.value, label: b.sub ? `${b.label} ${b.sub}` : b.label, muted: b.muted });
    }
    if (out.length === 2) break;
  }
  return out;
}

/** The medal a FINISHED pool's row wears, or null. Same podium rules as the Trophy Room. */
export function finishMedal(p: PodiumPoolInput): 1 | 2 | 3 | null {
  const finish = podiumFinishes([p], new Set()).finishes[0];
  return finish ? finish.rank : null;
}

/** The Seasons tile's teaser — "2 live · 1 finished". Null while loading. */
export function seasonsTeaser(sections: { live: boolean }[] | null): string | null {
  if (sections === null) return null;
  if (sections.length === 0) return 'Your competitions will collect here';
  const live = sections.filter((s) => s.live).length;
  const done = sections.length - live;
  const parts: string[] = [];
  if (live > 0) parts.push(`${live} live`);
  if (done > 0) parts.push(`${done} finished`);
  return parts.join(' · ');
}
