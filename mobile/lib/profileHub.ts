// =============================================================
// The Profile hub's pure logic — badge tallies and the tile / footer copy
// =============================================================
// Kept free of React and Supabase so it is testable from the root vitest run
// (mobile/lib/__tests__/profileHub.test.ts).
// =============================================================

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
};

export type BadgeTally = {
  id: string;
  count: number;
  /** Distinct pools it was earned in, in first-seen order. */
  pools: { poolId: string; poolName: string | null }[];
};

/** One entry per badge, most-earned first, ties alphabetical. */
export function tallyBadges(rows: BadgeUnlockRow[]): BadgeTally[] {
  const byBadge = new Map<string, BadgeTally>();
  for (const row of rows) {
    if (TRANSIENT_BADGES.has(row.badgeId)) continue;
    let tally = byBadge.get(row.badgeId);
    if (!tally) {
      tally = { id: row.badgeId, count: 0, pools: [] };
      byBadge.set(row.badgeId, tally);
    }
    tally.count += 1;
    if (!tally.pools.some((p) => p.poolId === row.poolId)) {
      tally.pools.push({ poolId: row.poolId, poolName: row.poolName });
    }
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

/** The Trophy Room tile's teaser. Null while loading, so the tile shows nothing rather than "0". */
export function trophyTeaser(total: number | null): string | null {
  if (total === null) return null;
  if (total === 0) return 'Your first badge is waiting';
  return total === 1 ? '1 badge earned' : `${total.toLocaleString()} badges earned`;
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
