import { useCallback, useEffect, useState } from 'react';

import {
  fetchBracketAnalytics,
  type BadgeInfo,
  type BPAnalyticsResponse,
  type LevelInfo,
} from './api';

// Static BP badge metadata mirrored from web (BP_BADGE_DEFINITIONS in
// app/pools/[pool_id]/analytics/bracketPickerXpSystem.ts). Used to render
// the Badges section before the API returns real data — e.g. when no
// matches have completed yet and the server (on older deployments) still
// returns a 404 instead of a zero-state response.
const FALLBACK_BP_BADGES: BadgeInfo[] = [
  { id: 'bp_cartographer', name: 'Cartographer', xp_bonus: 50, condition: 'Perfect Group Order in any group', rarity: 'Uncommon', tier: 'Bronze' },
  { id: 'bp_world_map', name: 'World Map', xp_bonus: 100, condition: 'Perfect Group Order in 3+ groups', rarity: 'Rare', tier: 'Silver' },
  { id: 'bp_bracket_prophet', name: 'Bracket Prophet', xp_bonus: 75, condition: 'Bracket survives through R16', rarity: 'Rare', tier: 'Silver' },
  { id: 'bp_architect', name: 'Architect', xp_bonus: 100, condition: 'Bracket survives through QF', rarity: 'Very Rare', tier: 'Gold' },
  { id: 'bp_sniper', name: 'Sniper', xp_bonus: 60, condition: 'Correctly predict champion', rarity: 'Rare', tier: 'Silver' },
  { id: 'bp_final_four', name: 'Final Four', xp_bonus: 80, condition: 'All 4 semi-finalists correct', rarity: 'Very Rare', tier: 'Gold' },
  { id: 'bp_perfect_bracket', name: 'Perfect Bracket', xp_bonus: 500, condition: 'Every pick correct', rarity: 'Legendary', tier: 'Platinum' },
  { id: 'bp_upset_specialist', name: 'Upset Specialist', xp_bonus: 60, condition: '3+ underdogs advance beyond expectations', rarity: 'Rare', tier: 'Silver' },
  { id: 'bp_group_guardian', name: 'Group Guardian', xp_bonus: 75, condition: 'All 12 groups qualifiers correct', rarity: 'Rare', tier: 'Silver' },
  { id: 'bp_quick_draw', name: 'Quick Draw', xp_bonus: 25, condition: 'Submit within first 24 hours', rarity: 'Common', tier: 'Bronze' },
  { id: 'bp_full_bracket', name: 'Full Bracket', xp_bonus: 30, condition: 'Submit complete bracket', rarity: 'Common', tier: 'Bronze' },
];

// Full level table mirrored from web (LEVELS in
// app/pools/[pool_id]/analytics/xpSystem.ts). Used by the zero-state so
// the Level Runway renders the full progression chart pre-tournament.
const FALLBACK_LEVELS: LevelInfo[] = [
  { level: 1, name: 'Rookie', xp_required: 0, badge: null },
  { level: 2, name: 'Matchday Fan', xp_required: 100, badge: null },
  { level: 3, name: 'Armchair Pundit', xp_required: 300, badge: null },
  { level: 4, name: 'Club Analyst', xp_required: 600, badge: 'Pundit Badge' },
  { level: 5, name: 'Stadium Regular', xp_required: 1100, badge: null },
  { level: 6, name: 'Tactician', xp_required: 1800, badge: 'Tactician Badge' },
  { level: 7, name: 'Scout', xp_required: 2700, badge: 'Scout Badge' },
  { level: 8, name: 'Manager', xp_required: 3900, badge: null },
  { level: 9, name: 'Oracle', xp_required: 5500, badge: 'Oracle Badge' },
  { level: 10, name: 'Legend', xp_required: 7500, badge: 'Legend Badge' },
];

function makeEmptyAnalytics(): BPAnalyticsResponse {
  return {
    xp: {
      total_xp: 0,
      total_group_base_xp: 0,
      total_group_bonus_xp: 0,
      total_third_place_xp: 0,
      total_knockout_base_xp: 0,
      total_knockout_bonus_xp: 0,
      total_badge_xp: 0,
      current_level: FALLBACK_LEVELS[0],
      next_level: FALLBACK_LEVELS[1] ?? null,
      xp_to_next_level: FALLBACK_LEVELS[1]?.xp_required ?? 0,
      level_progress: 0,
      bonus_events: [],
      earned_badges: [],
      all_badges: FALLBACK_BP_BADGES,
      levels: FALLBACK_LEVELS,
      group_xp: [],
      third_place_xp: [],
      third_place_perfect_bonus_xp: 0,
      knockout_xp: [],
    },
    pool_comparison: null,
  };
}

function isNoCompletedMatchesError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return /no completed matches/i.test(err.message);
}

export function useEntryBracketAnalytics(
  poolId: string | undefined,
  entryId: string | undefined,
) {
  const [data, setData] = useState<BPAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!poolId || !entryId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchBracketAnalytics(poolId, entryId);
      setData(res);
    } catch (err) {
      // Older deployments 404 with "No completed matches yet" pre-tournament.
      // Synthesize a zero-state so the Form tab can still render its
      // structure (hero card + badges) with placeholders.
      if (isNoCompletedMatchesError(err)) {
        setData(makeEmptyAnalytics());
      } else {
        setError(
          err instanceof Error ? err.message : 'Failed to load bracket analytics',
        );
        console.warn('[useEntryBracketAnalytics]', err);
      }
    } finally {
      setLoading(false);
    }
  }, [poolId, entryId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, error, refresh: load };
}
