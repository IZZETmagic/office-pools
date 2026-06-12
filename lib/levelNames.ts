// Shared XP level → display-name mapping.
//
// Single source of truth for surfaces (pool cards, dashboard) that show a
// level number from `entry_xp_state.current_level` but need the matching
// name WITHOUT pulling in the full analytics XP module. These names MUST stay
// in sync with `LEVELS` in app/pools/[pool_id]/analytics/xpSystem.ts.

export const LEVEL_NAMES: Record<number, string> = {
  1: 'Rookie',
  2: 'Matchday Fan',
  3: 'Armchair Pundit',
  4: 'Club Analyst',
  5: 'Stadium Regular',
  6: 'Tactician',
  7: 'Scout',
  8: 'Manager',
  9: 'Oracle',
  10: 'Legend',
}

/** Map an XP level number to its display name (defaults to Rookie). */
export function getLevelName(level: number): string {
  return LEVEL_NAMES[level] ?? 'Rookie'
}
