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

/** One cell of a Seasons row: a bold figure with an optional small line under it. */
export type SeasonCell = { value: string; sub?: string; muted?: boolean };

/**
 * A Seasons row's two cells, plus the column headers they sit under.
 *
 * Built from `poolCardBlocks`, the same per-mode blocks the Pools tab card
 * uses, so the two surfaces cannot disagree about a figure.
 *
 * ⚠ THE LABELS MOVE TO THE HEADER. Every row used to carry its own ("Points
 * provisional", "Rounds in 2", "Matchweek of 38"), at its own width, so the
 * bold numbers never lined up (Ryan, 2026-09-28). Rows in one mode group share
 * headers, so each cell is just the figure.
 *
 * ⚠ THE RANK COLUMN IS ALWAYS THE RANK. Before scoring starts it reads "—"
 * rather than letting Points slide into the rank column — which is what made
 * one Pick'em row misalign with the rest.
 *
 * ⚠ LAST MAN STANDING HAS NO RANK BLOCK — `poolCardBlocks` decides that, and it
 * is inherited here: its columns are Rounds and Clubs.
 */
export function seasonRowCells(p: BlockInput): {
  headers: [string, string];
  cells: [SeasonCell, SeasonCell];
} {
  const blocks = poolCardBlocks(p);
  const stats = blocks.filter(
    (b): b is Extract<(typeof blocks)[number], { kind: 'stat' }> => b.kind === 'stat',
  );
  const statCell = (i: number): SeasonCell =>
    stats[i]
      ? { value: stats[i].value, sub: stats[i].sub, muted: stats[i].muted }
      : { value: '—', muted: true };
  const header = (i: number) => stats[i]?.label ?? '';

  const rank = blocks.find(
    (b): b is Extract<(typeof blocks)[number], { kind: 'rank' }> => b.kind === 'rank',
  );
  if (rank) {
    const rankCell: SeasonCell =
      rank.show && rank.rank !== null
        ? { value: ordinal(rank.rank), sub: `of ${rank.totalEntries}` }
        : { value: '—', muted: true };
    return { headers: ['Rank', header(0)], cells: [rankCell, statCell(0)] };
  }
  return { headers: [header(0), header(1)], cells: [statCell(0), statCell(1)] };
}

export type SeasonModeGroup<P extends SeasonPoolInput = SeasonPoolInput> = {
  /** Mode + headers — two pools only share a group when their columns match. */
  key: string;
  predictionMode: string | null;
  leagueMode: string | null;
  headers: [string, string];
  pools: P[];
};

/** Order a competition's modes read in: the weekly games first, the season-long ones after. */
const MODE_ORDER = ['pickem', 'showdown', 'table', 'last_man_standing'];

/**
 * A competition's pools split by mode, so each group can carry its column
 * headers once. Pool order inside a group is kept (open first, then name).
 *
 * ⚠ KEYED ON MODE *AND* HEADERS. A Showdown pool whose duel facts have not
 * arrived falls back to Pick'em blocks; grouping on mode alone would put a
 * "Points" figure under a "Duel pts" header.
 */
export function groupByMode<P extends SeasonPoolInput>(pools: P[]): SeasonModeGroup<P>[] {
  const groups = new Map<string, SeasonModeGroup<P>>();
  for (const p of pools) {
    const { headers } = seasonRowCells(p);
    const mode = p.league?.leagueMode ?? p.leagueMode ?? p.predictionMode ?? '';
    const key = `${mode}|${headers.join('|')}`;
    let g = groups.get(key);
    if (!g) {
      g = { key, predictionMode: p.predictionMode, leagueMode: p.leagueMode, headers, pools: [] };
      groups.set(key, g);
    }
    g.pools.push(p);
  }
  const rankOf = (g: SeasonModeGroup<P>) => {
    const i = MODE_ORDER.indexOf(g.key.split('|')[0]);
    return i === -1 ? MODE_ORDER.length : i;
  };
  return [...groups.values()].sort((a, b) => rankOf(a) - rankOf(b) || a.key.localeCompare(b.key));
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
