// =============================================================
// SYNC TARGETS — which competitions the fixtures cron should sync
// =============================================================
// The sync cron used to read one competition from three env globals
// (API_FOOTBALL_TOURNAMENT_ID / _LEAGUE_ID / _SEASON), which made "run a second
// competition" a redeploy rather than a row. Config now lives in data.
//
// Since L1 there are TWO places a competition's ingest config can live:
//
//   `tournaments`     — bracket competitions, fixtures in `matches`
//   `league_seasons`  — leagues, fixtures in `league_fixtures`
//
// so a target is a DISCRIMINATED UNION and the storage it points at is part of
// its identity. `format` was deliberately removed from the type: carrying both
// `format` and `kind` means carrying two discriminants that can disagree.
//
// ⚠ Deploy-order safety on the tournaments arm. The columns it reads
// (`external_league_id`, `external_season`, `format`) came from migration 024.
// The error is checked explicitly and a failure falls back to the env-var
// single-target behaviour, logging loudly — a silent fallback would mean the
// table config is being ignored, which is worth seeing.

import type { SupabaseClient } from '@supabase/supabase-js'

type SyncTargetBase = {
  /** api-football league id (1 = World Cup, 39 = Premier League). */
  league: number
  /** api-football season, start-year convention (2026 = the 2026/27 season). */
  season: number
  /** Human name. Goes into run notes and every error message. */
  name: string
  source: 'tournaments_row' | 'league_seasons_row' | 'env_fallback'
}

/** A bracket competition whose fixtures live in `matches`. */
export type WorldCupSyncTarget = SyncTargetBase & { kind: 'world_cup'; tournamentId: string }
/** A league whose fixtures live in `league_fixtures`. */
export type LeagueSyncTarget = SyncTargetBase & { kind: 'league'; seasonId: string }
export type SyncTarget = WorldCupSyncTarget | LeagueSyncTarget

export type SyncTargetDiagnostics = {
  onError?: (stage: string, message: string) => void
  /**
   * Expected-but-noteworthy facts. NOT errors: an `errors[]` entry flips
   * `ok:false` and drives the status panel's error count, so a permanent,
   * expected supersession there would be a red light every 60 seconds — alarm
   * fatigue that would hide a real failure.
   */
  onNote?: (message: string) => void
}

/**
 * Formats that mean "fixtures live in `matches`".
 *
 * A POSITIVE list, never an else-branch. The inverted "not-league ⇒ World Cup"
 * default is the corruption class `advancementTriggerFor`
 * (lib/competitionFormat.ts) exists to kill: it takes an unrecognised
 * competition and quietly runs bracket logic over it.
 */
const BRACKET_FORMATS = new Set(['groups_knockout', 'knockout'])

/** The pre-024 behaviour: one competition, from env, defaulting to WC 2026. */
export function envFallbackTarget(): WorldCupSyncTarget {
  return {
    // Stamped, never derived. This function's format was always a hard-coded
    // literal — there is nothing here to infer a kind from.
    kind: 'world_cup',
    tournamentId:
      process.env.API_FOOTBALL_TOURNAMENT_ID || '00000000-0000-0000-0000-000000000001',
    league: parseInt(process.env.API_FOOTBALL_LEAGUE_ID ?? '1', 10),
    season: parseInt(process.env.API_FOOTBALL_SEASON ?? '2026', 10),
    name: 'env-configured competition',
    source: 'env_fallback',
  }
}

/** `provider|league|season` — the triple that identifies one competition-instance. */
function ingestKey(provider: string | null, league: number | null, season: number | null): string {
  return `${provider ?? 'api_football'}|${league}|${season}`
}

/**
 * Every competition the cron should sync this run.
 *
 * Selection rule is "has external ingest config" rather than a status or date
 * window. Three reasons: `tournaments.status` is authored and already stale in
 * production (the completed World Cup still reads 'upcoming'); a date-windowed
 * rule silently stops syncing a competition whose dates were entered wrong — a
 * failure that looks exactly like the feed being down; and
 * `league_seasons.first_kickoff_at`/`last_kickoff_at` are NULL on the live
 * Premier League row, so a date filter would drop the one season we are trying
 * to sync. A competition with nothing in its live window costs one indexed
 * select and returns immediately.
 */
export async function loadSyncTargets(
  supabase: SupabaseClient,
  diag: SyncTargetDiagnostics = {},
): Promise<SyncTarget[]> {
  const worldCup: WorldCupSyncTarget[] = []
  const leagues: LeagueSyncTarget[] = []
  const leagueKeys = new Map<string, { seasonId: string; name: string }>()
  const conflictedKeys = new Set<string>()

  // ------------------------------------------------------------------
  // 1. League arm — FIRST, because its keys feed the dedupe below.
  // ------------------------------------------------------------------
  // No `WHERE external_league_id IS NOT NULL`: the column is `integer NOT NULL`,
  // so the predicate is vacuous. `.range()` rather than a bare select — an
  // unbounded PostgREST select silently truncates at 1,000 rows.
  const { data: seasons, error: seasonErr } = await supabase
    .from('league_seasons')
    .select(
      'season_id, competition_name, season_label, external_provider, external_league_id, external_season',
    )
    .order('season_start_year', { ascending: false })
    .range(0, 999)

  if (seasonErr) {
    // Continue to the tournaments arm regardless. A league read failure must
    // never stop the World Cup — and falling back to env here would emit a
    // World Cup target twice.
    diag.onError?.(
      'load_sync_targets',
      `league_seasons unreadable (${seasonErr.message}) — no league will sync this run`,
    )
  }

  for (const row of seasons ?? []) {
    const r = row as {
      season_id: string
      competition_name: string | null
      season_label: string | null
      external_provider: string | null
      external_league_id: number | null
      external_season: number | null
    }

    if (r.external_provider && r.external_provider !== 'api_football') {
      diag.onError?.(
        'load_sync_targets',
        `league_seasons ${r.season_id} names provider '${r.external_provider}', which has no client — skipped`,
      )
      continue
    }
    if (r.external_league_id == null || r.external_season == null) {
      diag.onError?.(
        'load_sync_targets',
        `league_seasons ${r.season_id} has no external_league_id/external_season — skipped`,
      )
      continue
    }

    const name = [r.competition_name, r.season_label].filter(Boolean).join(' ') || r.season_id
    const key = ingestKey(r.external_provider, r.external_league_id, r.external_season)
    leagueKeys.set(key, { seasonId: r.season_id, name })
    leagues.push({
      kind: 'league',
      seasonId: r.season_id,
      league: r.external_league_id,
      season: r.external_season,
      name,
      source: 'league_seasons_row',
    })
  }

  // ------------------------------------------------------------------
  // 2. Tournaments arm — select and filter unchanged from before L3.
  // ------------------------------------------------------------------
  const { data, error } = await supabase
    .from('tournaments')
    .select('tournament_id, name, external_league_id, external_season, external_provider, format')
    .not('external_league_id', 'is', null)

  if (error) {
    diag.onError?.(
      'load_sync_targets',
      `tournaments ingest config unreadable (${error.message}) — falling back to env vars. ` +
        `Expected only while migration 024 is unapplied.`,
    )
    // The league arm may still have produced targets; the env fallback covers
    // only the bracket side.
    return [...[envFallbackTarget()], ...leagues]
  }

  let tournamentRowsExamined = 0

  for (const row of data ?? []) {
    const r = row as {
      tournament_id: string
      name: string | null
      external_league_id: number | null
      external_season: number | null
      external_provider: string | null
      format: string | null
    }
    tournamentRowsExamined++

    if (r.external_provider && r.external_provider !== 'api_football') {
      diag.onError?.(
        'load_sync_targets',
        `tournament ${r.tournament_id} names provider '${r.external_provider}', which has no client — skipped`,
      )
      continue
    }
    if (r.external_league_id == null || r.external_season == null) {
      diag.onError?.(
        'load_sync_targets',
        `tournament ${r.tournament_id} has external_league_id but no external_season — skipped`,
      )
      continue
    }

    const key = ingestKey(r.external_provider, r.external_league_id, r.external_season)
    const collision = leagueKeys.get(key)

    if (collision && r.format === 'league') {
      // Supersession: the same competition, and the league arm is the side that
      // actually holds the fixtures. A note, not an error — it is permanent and
      // expected for as long as the archived Premier League pool keeps its
      // `tournaments` row alive (the FK is ON DELETE CASCADE, so the row cannot
      // be deleted without deleting a real customer's pool).
      diag.onNote?.(
        `tournaments row ${r.tournament_id} (${r.name ?? 'unnamed'}) is superseded by ` +
          `league_seasons ${collision.seasonId} — synced as a league`,
      )
      continue
    }

    if (collision) {
      // A NON-league tournaments row colliding on the triple is a CONFLICT, not
      // a supersession. Emit NEITHER and shout: a league_seasons row carrying
      // (api_football, 1, 2026) — the World Cup's own triple — would otherwise
      // silently stop syncing 623 pools, reported only as a note.
      diag.onError?.(
        'load_sync_targets',
        `tournament ${r.tournament_id} (format '${r.format ?? 'null'}') and league_seasons ` +
          `${collision.seasonId} both claim ${key} — neither synced; resolve the conflict`,
      )
      conflictedKeys.add(key)
      continue
    }

    if (r.format === 'league') {
      // Never falls through to the World Cup path.
      diag.onError?.(
        'load_sync_targets',
        `tournament ${r.tournament_id} declares format 'league' but no league_seasons row carries ` +
          `${key} — nothing to sync it into`,
      )
      continue
    }

    if (!BRACKET_FORMATS.has(r.format ?? '')) {
      diag.onError?.(
        'load_sync_targets',
        `tournament ${r.tournament_id} has format '${r.format ?? 'null'}', which no sync arm handles — skipped`,
      )
      continue
    }

    worldCup.push({
      kind: 'world_cup',
      tournamentId: r.tournament_id,
      league: r.external_league_id,
      season: r.external_season,
      name: r.name ?? r.tournament_id,
      source: 'tournaments_row',
    })
  }

  // World Cup targets first, so the bracket competition is never starved by a
  // long league run. Asserted in a test so it cannot drift.
  const targets: SyncTarget[] = [
    ...worldCup,
    ...leagues.filter((l) => !conflictedKeys.has(ingestKey('api_football', l.league, l.season))),
  ]

  // ------------------------------------------------------------------
  // 3. Safety net — past BOTH arms, and keyed on `kind`, not on emptiness.
  // ------------------------------------------------------------------
  // Left on the tournaments arm (where it used to be), a future world in which
  // only `league_seasons` carries config would inject a phantom World Cup
  // target every tick. Keyed on total emptiness, an individually-skipped World
  // Cup row would silently stop syncing while a league keeps `targets.length`
  // non-zero — a hole, not a feature.
  if (!targets.some((t) => t.kind === 'world_cup') && tournamentRowsExamined > 0) {
    diag.onError?.(
      'load_sync_targets',
      'no bracket competition resolved from tournaments — falling back to env vars',
    )
    targets.push(envFallbackTarget())
  }

  if (targets.length === 0) {
    diag.onError?.(
      'load_sync_targets',
      'no competition carries external ingest config — falling back to env vars',
    )
    return [envFallbackTarget()]
  }

  return targets
}

/**
 * Which competitions this run's recalculation sweep covers.
 *
 * The drain fallback is World-Cup-only ON PURPOSE. `pools.tournament_id` is a
 * `tournaments` FK; a league target has no tournament id, and `undefined`
 * inside `.in('tournament_id', …)` yields zero rows at HTTP 200 — the World Cup
 * drain sweep stopping in silence. That regression is introduced by the union
 * itself, not by the league arm, which is why this is a pure exported function
 * with its own test rather than an inline `.map()`.
 *
 * League pools get their own drain in L8.
 */
export function resolveSweepTournamentIds(
  targets: readonly SyncTarget[],
  touchedTournamentIds: ReadonlySet<string>,
): string[] {
  if (touchedTournamentIds.size > 0) return [...touchedTournamentIds]
  return targets
    .filter((t): t is WorldCupSyncTarget => t.kind === 'world_cup')
    .map((t) => t.tournamentId)
}
