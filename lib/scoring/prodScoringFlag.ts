// ============================================================================
// Production-scoring kill-switch — the WRITE half of the shadow cutover.
//
// `sync_settings.prod_scoring_enabled` (default TRUE). When flipped to false,
// the Node recalc (recalculatePool) and the DB trigger (trigger_calculate_points
// → process_match_result) STOP computing prod scores — the shadow engine becomes
// the sole scorer. Reversible instantly (flip the flag back + let prod catch up).
//
// FAIL-SAFE: any read error returns TRUE (prod scoring stays ON). A transient
// sync_settings hiccup must never silently disable production scoring.
//
// While prod scoring is OFF the side-effect pushes (match-results, badges) read
// the shadow score table instead of match_scores — `pushScoreTable()` picks it.
// ============================================================================
import { createAdminClient } from '@/lib/supabase/server'

type Admin = ReturnType<typeof createAdminClient>

let _cache: { value: boolean; at: number } | null = null
const TTL_MS = 15_000 // matches the diff-writes flag cache; a flip lands within a sweep or two

export async function isProdScoringEnabled(admin: Admin): Promise<boolean> {
  const now = Date.now()
  if (_cache && now - _cache.at < TTL_MS) return _cache.value
  try {
    const { data } = await admin
      .from('sync_settings')
      .select('setting_value')
      .eq('setting_key', 'prod_scoring_enabled')
      .maybeSingle()
    // Absent => enabled (default ON). Only an explicit false disables it.
    const value = !(data?.setting_value === false || data?.setting_value === 'false')
    _cache = { value, at: now }
    return value
  } catch {
    return true // fail-safe
  }
}

// The score table the side-effect pushes should read: prod when scoring is on,
// shadow when it's off (shadow_match_scores is a column-for-column drop-in).
export async function pushScoreTable(admin: Admin): Promise<'match_scores' | 'shadow_match_scores'> {
  return (await isProdScoringEnabled(admin)) ? 'match_scores' : 'shadow_match_scores'
}
