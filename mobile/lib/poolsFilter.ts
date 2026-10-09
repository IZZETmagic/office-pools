// =============================================================
// WHICH OF MY POOLS DOES THE POOLS TAB SHOW, AND IN WHAT ORDER?
// =============================================================
// The rules behind the Pools tab's filter sheet. They lived inside the screen
// (app/(tabs)/pools.tsx) until the sheet gained a fifth axis, Competition, and
// a rule that decides which options are offered at all — two things worth
// asserting, and nothing inside a screen can be imported by a test.
//
// ⚠ NO REACT NATIVE IMPORTS. Metro and the root vitest both reach this file;
// see lib/needsPredictions.ts for the same move. Imports are relative because
// the root vitest does not know the `@/` alias.
// =============================================================

import { getCompetitionMonogram, getCompetitionName } from './design/competition';
import { isLeaguePoolMode, LEAGUE_MODES, type LeagueMode } from './design/poolMode';
import type { PoolSummary } from './useHomeData';

// Mirrors the values pools.status can actually hold. Migration 025b constrains
// the column to ('open','completed'), so there is nothing else to filter on —
// an 'archived' option used to sit here and could never match a row.
export type StatusFilter = 'all' | 'open' | 'completed';

/**
 * One pool game. The three bracket modes are `pools.prediction_mode`; the four
 * league games are `pools.league_mode`.
 *
 * ⚠ THE FOUR LEAGUE GAMES ARE NOT OPTIONAL EXTRAS HERE — without them this
 * filter could not see a league pool at all. It once held only the bracket
 * modes and matched them against `predictionMode`, which is `league_pickem`
 * for all four league games, so picking ANY type hid every league pool (17 in
 * production on 2026-09-05) and no selection could ever show one.
 */
export type PoolType = 'full_tournament' | 'progressive' | 'bracket_picker' | LeagueMode;
export type TypeFilter = 'all' | PoolType;
export type PredictionFilter = 'all' | 'submitted' | 'pending';
export type SortMode = 'smart' | 'newest' | 'name' | 'points';
/** `tournaments.external_league_id` — the api-football id — or 'all'. */
export type CompetitionFilter = 'all' | number;

export type PoolsFilters = {
  status: StatusFilter;
  type: TypeFilter;
  predictions: PredictionFilter;
  competition: CompetitionFilter;
  sort: SortMode;
};

export const DEFAULT_FILTERS: PoolsFilters = {
  status: 'all',
  type: 'all',
  predictions: 'all',
  competition: 'all',
  sort: 'smart',
};

/** Only the fields the rules read, so a test can build a pool in one line. */
export type FilterablePool = Pick<
  PoolSummary,
  | 'status'
  | 'predictionMode'
  | 'leagueMode'
  | 'needsPredictions'
  | 'externalLeagueId'
  | 'brandName'
  | 'joinedAt'
  | 'poolName'
  | 'totalPoints'
>;

const BRACKET_TYPES = new Set<string>(['full_tournament', 'progressive', 'bracket_picker']);

/**
 * The order the sheet offers the games in. League games lead because a league
 * season is what is running now; the bracket modes belong to tournaments.
 */
export const POOL_TYPE_ORDER: readonly PoolType[] = [
  ...LEAGUE_MODES,
  'full_tournament',
  'progressive',
  'bracket_picker',
];

/**
 * Which game a pool is playing, or null for a mode nothing here knows.
 *
 * ⚠ A league pool with a NULL `leagueMode` reads as Pick'em — the same fallback
 * the card's pill and the web both use (three production pools carry NULL
 * there and all three are Pick'em).
 */
export function poolTypeOf(pool: Pick<FilterablePool, 'predictionMode' | 'leagueMode'>): PoolType | null {
  if (isLeaguePoolMode(pool.predictionMode)) {
    return (LEAGUE_MODES as readonly string[]).includes(pool.leagueMode ?? '')
      ? (pool.leagueMode as LeagueMode)
      : 'pickem';
  }
  return pool.predictionMode && BRACKET_TYPES.has(pool.predictionMode)
    ? (pool.predictionMode as PoolType)
    : null;
}

function matches(pool: FilterablePool, filters: PoolsFilters): boolean {
  if (filters.status !== 'all' && pool.status !== filters.status) return false;
  if (filters.type !== 'all' && poolTypeOf(pool) !== filters.type) return false;
  if (filters.competition !== 'all' && pool.externalLeagueId !== filters.competition) return false;
  // `needsPredictions` is the canonical "does the user still have to predict
  // something?" check — see lib/needsPredictions.ts. Filtering on it keeps the
  // Picks control in step with the card's own pill and the Home tab's count.
  if (filters.predictions === 'pending' && !pool.needsPredictions) return false;
  if (filters.predictions === 'submitted' && pool.needsPredictions) return false;
  return true;
}

/** The pools the tab shows, in the order it shows them. */
export function applyFilters<T extends FilterablePool>(pools: T[], filters: PoolsFilters): T[] {
  const next = pools.filter((p) => matches(p, filters));

  next.sort((a, b) => {
    // ⚠ BRANDED POOLS ALWAYS LEAD, whatever the sort says — the sponsorship
    // rule. The sheet does not hide this: a "Name A–Z" list with a "W" pool on
    // top would otherwise look broken.
    const aBranded = a.brandName ? 0 : 1;
    const bBranded = b.brandName ? 0 : 1;
    if (aBranded !== bBranded) return aBranded - bBranded;

    switch (filters.sort) {
      case 'newest':
        return new Date(b.joinedAt).getTime() - new Date(a.joinedAt).getTime();
      case 'name':
        return a.poolName.localeCompare(b.poolName);
      case 'points':
        return b.totalPoints - a.totalPoints;
      case 'smart':
      default:
        if (a.needsPredictions !== b.needsPredictions) {
          return a.needsPredictions ? -1 : 1;
        }
        if (a.totalPoints !== b.totalPoints) return b.totalPoints - a.totalPoints;
        return a.poolName.localeCompare(b.poolName);
    }
  });

  return next;
}

/**
 * How many filters are narrowing the list — the number on the button's badge.
 * Sort is not one: it reorders, it never hides a pool.
 */
export function countActiveFilters(filters: PoolsFilters): number {
  let n = 0;
  if (filters.status !== 'all') n++;
  if (filters.type !== 'all') n++;
  if (filters.predictions !== 'all') n++;
  if (filters.competition !== 'all') n++;
  return n;
}

/** Every filter back to "all", keeping the sort the member chose. */
export function clearFilters(filters: PoolsFilters): PoolsFilters {
  return { ...DEFAULT_FILTERS, sort: filters.sort };
}

export type CompetitionOption = {
  id: number;
  /** "Premier League", not the rail's "PREMIER LEAGUE". */
  name: string;
  monogram: string;
};

function titleCase(name: string): string {
  return name
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/**
 * The competitions the member has pools in, alphabetically.
 *
 * ⚠ BUILT FROM ALL OF THEIR POOLS, NOT THE FILTERED ONES, so the row never
 * reshapes under a finger: tapping "Completed" must not make a chip vanish
 * from the row beside it. A competition nobody has named yet has no chip — its
 * pools still show under "all".
 */
export function competitionOptions(pools: FilterablePool[]): CompetitionOption[] {
  const seen = new Map<number, CompetitionOption>();
  for (const p of pools) {
    const id = p.externalLeagueId;
    if (id == null || seen.has(id)) continue;
    const name = getCompetitionName(id);
    const monogram = getCompetitionMonogram(id);
    if (!name || !monogram) continue;
    seen.set(id, { id, name: titleCase(name), monogram });
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The games the sheet offers, given the competition chosen.
 *
 * ⭐ NO DEAD ENDS. A competition decides which games can exist in it — a
 * Premier League pool is never a Progressive one — so under a competition only
 * the games actually played there are offered. Nothing else narrows this list:
 * status and picks change from week to week, and a row that rearranged itself
 * every time one of them was tapped would be impossible to aim at.
 *
 * The selected game is always offered, so it can always be tapped off.
 */
export function typeOptions(pools: FilterablePool[], filters: PoolsFilters): PoolType[] {
  const present = new Set<PoolType>();
  for (const p of pools) {
    if (filters.competition !== 'all' && p.externalLeagueId !== filters.competition) continue;
    const t = poolTypeOf(p);
    if (t) present.add(t);
  }
  if (filters.type !== 'all') present.add(filters.type);
  return POOL_TYPE_ORDER.filter((t) => present.has(t));
}

/**
 * Whether a row is worth drawing at all: one with a single option cannot
 * narrow anything. Decided over ALL the member's pools, for the same reason as
 * `competitionOptions` — the sheet keeps its shape while it is being used.
 */
export function showsCompetitionRow(pools: FilterablePool[]): boolean {
  return competitionOptions(pools).length >= 2;
}

export function showsTypeRow(pools: FilterablePool[]): boolean {
  return typeOptions(pools, DEFAULT_FILTERS).length >= 2;
}

/**
 * Choose a competition (or 'all'), dropping a chosen game that cannot exist in
 * it.
 *
 * ⚠ WITHOUT THIS, Progressive + Premier League is an empty list the member
 * reached in two taps, with the Progressive tile no longer on screen to undo.
 * The tile they chose disappears with the reason in plain sight: the
 * competition they just tapped.
 */
export function withCompetition(
  pools: FilterablePool[],
  filters: PoolsFilters,
  competition: CompetitionFilter,
): PoolsFilters {
  const next = { ...filters, competition };
  if (next.type === 'all') return next;
  const available = typeOptions(pools, { ...next, type: 'all' });
  return available.includes(next.type) ? next : { ...next, type: 'all' };
}

/** The `(predictionMode, leagueMode)` pair a game is coloured and named by. */
export function modePairOf(type: PoolType): { mode: string; leagueMode: string | null } {
  return BRACKET_TYPES.has(type)
    ? { mode: type, leagueMode: null }
    : { mode: 'league_pickem', leagueMode: type };
}
