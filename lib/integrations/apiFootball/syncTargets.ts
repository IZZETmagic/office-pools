// =============================================================
// SYNC TARGETS — which competitions the fixtures cron should sync
// =============================================================
// The sync cron used to read one competition from three env globals
// (API_FOOTBALL_TOURNAMENT_ID / _LEAGUE_ID / _SEASON), which made "run a second
// competition" a redeploy rather than a row. This resolves the same three
// values per tournament from the `tournaments` table instead — the config lives
// in data, which is P4 of the system-design goals ("N competitions run
// concurrently with no per-competition deploy").
//
// ⚠ Deploy-order safety. The columns read here (`external_league_id`,
// `external_season`, `format`) are added by migration 024, which is NOT applied
// to production as of 2026-08-14. If this code shipped first, the select would
// 400 and — per the discarded-PostgREST-errors failure mode — return no rows,
// silently stopping ALL fixture syncing including the World Cup's.
//
// So the error is checked explicitly and a failure falls back to the env-var
// single-target behaviour, logging loudly. That makes the deploy order
// non-load-bearing in both directions: this is safe to ship before 024, and
// correct after it. It is deliberately NOT a silent fallback — a permanent
// fallback means the table config is being ignored, which is worth seeing.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { CompetitionFormat } from '@/lib/competitionFormat'

export type SyncTarget = {
  tournamentId: string
  /** api-football league id (1 = World Cup, 39 = Premier League). */
  league: number
  /** api-football season, its start-year convention (2025 = the 2025/26 season). */
  season: number
  format: CompetitionFormat
  name: string
  /** How this target was resolved — surfaced in the run notes. */
  source: 'tournaments_row' | 'env_fallback'
}

/** The pre-024 behaviour: one competition, from env, defaulting to WC 2026. */
export function envFallbackTarget(): SyncTarget {
  return {
    tournamentId:
      process.env.API_FOOTBALL_TOURNAMENT_ID || '00000000-0000-0000-0000-000000000001',
    league: parseInt(process.env.API_FOOTBALL_LEAGUE_ID ?? '1', 10),
    season: parseInt(process.env.API_FOOTBALL_SEASON ?? '2026', 10),
    format: 'groups_knockout',
    name: 'env-configured competition',
    source: 'env_fallback',
  }
}

/**
 * Every competition the cron should sync this run.
 *
 * Selection rule is simply "has external ingest config" rather than a status or
 * date window. Two reasons: `tournaments.status` is authored and already stale
 * in production (the completed World Cup still reads 'upcoming'), and a
 * date-windowed rule silently stops syncing a competition whose dates were
 * entered wrong — a failure that looks exactly like the feed being down. A
 * competition with nothing in its live window costs one indexed `matches`
 * select and returns immediately, so the price of being permissive is small
 * and the price of being wrong is a season that quietly stops updating.
 */
export async function loadSyncTargets(
  supabase: SupabaseClient,
  onError?: (stage: string, message: string) => void
): Promise<SyncTarget[]> {
  const { data, error } = await supabase
    .from('tournaments')
    .select('tournament_id, name, external_league_id, external_season, external_provider, format')
    .not('external_league_id', 'is', null)

  if (error) {
    onError?.(
      'load_sync_targets',
      `tournaments ingest config unreadable (${error.message}) — falling back to env vars. ` +
        `Expected only while migration 024 is unapplied.`
    )
    return [envFallbackTarget()]
  }

  const targets: SyncTarget[] = []
  for (const row of data ?? []) {
    const r = row as {
      tournament_id: string
      name: string | null
      external_league_id: number | null
      external_season: number | null
      external_provider: string | null
      format: string | null
    }

    // Only api-football is implemented. A row naming another provider is
    // skipped loudly rather than synced with the wrong client.
    if (r.external_provider && r.external_provider !== 'api_football') {
      onError?.(
        'load_sync_targets',
        `tournament ${r.tournament_id} names provider '${r.external_provider}', which has no client — skipped`
      )
      continue
    }
    if (r.external_league_id == null || r.external_season == null) {
      onError?.(
        'load_sync_targets',
        `tournament ${r.tournament_id} has external_league_id but no external_season — skipped`
      )
      continue
    }

    targets.push({
      tournamentId: r.tournament_id,
      league: r.external_league_id,
      season: r.external_season,
      format: r.format === 'league' ? 'league' : 'groups_knockout',
      name: r.name ?? r.tournament_id,
      source: 'tournaments_row',
    })
  }

  // No configured row at all (e.g. 024 applied but the backfill did not match)
  // is not the same as an unreadable table — still better to sync the World Cup
  // from env than to sync nothing.
  if (targets.length === 0) {
    onError?.(
      'load_sync_targets',
      'no tournaments carry external ingest config — falling back to env vars'
    )
    return [envFallbackTarget()]
  }

  return targets
}
