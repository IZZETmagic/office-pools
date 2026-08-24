// ============================================================================
// Scoring READ source — the read-path cutover switch (Phase 1 of the shadow
// engine sunset; see drafts/2026-07-17_shadow_read_helper_plan.md).
//
// One place decides, per pool, whether scoring/rank data is read from the
// production columns (pool_entries / match_scores / bonus_scores) or the shadow
// engine's tables (shadow_entry_totals / shadow_match_scores / shadow_bonus_
// scores). Callers get back the SAME prod-shaped rows either way, so a call
// site changes only which reader it calls — never its downstream logic.
//
// Gate: sync_settings.shadow_read_enabled_pools — a JSONB array of pool_ids.
//   []/absent => every pool reads prod (the default; flag-off is a no-op).
//   Add a pool_id => that pool reads shadow, on web AND mobile (both clients
//   go through the same server reads). Remove it => instant rollback.
//
// Hard rules:
//   - RETIRED 2026-07-27: "bracket_picker always reads prod". It had no shadow
//     arm; it now does (migrations 034-036). Shadow matches prod exactly on
//     bp bonus rows (58,604, incl. byte-identical descriptions) and on totals
//     (859/859), so the mode no longer needs special-casing and honours the
//     flag like any other. `predictionMode` is kept on the signature for
//     callers and future mode-specific rules.
//     NOTE bracket_picker legitimately has ZERO shadow_match_scores — its
//     scoring is entirely bonus-based — so readMatchScores returning nothing
//     for a bp pool is correct, matching prod.
//   - In 'prod' mode the readers select the exact same columns from the exact
//     same tables as before, so behaviour is byte-identical while the flag is
//     off. Only 'shadow' mode maps column names / synthesises keys.
//
// NOTE (caching): lib/poolData.ts caches its result per pool. When a pool is
// added to / removed from the flag, invalidate that pool's cache
// (invalidatePoolCache) so the switch takes effect within one fetch, not one
// TTL.
// ============================================================================
import { createAdminClient } from '@/lib/supabase/server'
import type { MatchScoreData, MatchScoreNarrow, BonusScoreData } from '@/app/pools/[pool_id]/types'

type AdminClient = ReturnType<typeof createAdminClient>

export type ScoringSource = 'prod' | 'shadow' | 'league'

// The scoring/rank fields the read source owns. Everything else on an entry
// (entry_name, has_submitted_predictions, fee_paid, ...) is non-scoring and
// still comes from pool_entries in both modes — callers overlay these on top.
export type EntryScoring = {
  entry_id: string
  match_points: number
  bonus_points: number
  point_adjustment: number
  scored_total_points: number
  current_rank: number | null
  previous_rank: number | null
}

const SHADOW_READ_FLAG = 'shadow_read_enabled_pools'

// --- flag -------------------------------------------------------------------

// The set of pool_ids currently reading shadow. Tiny indexed read, intentionally
// NOT cached so the switch (and rollback) is instant — mirrors isPoolCacheEnabled.
export async function getShadowReadPools(admin: AdminClient): Promise<Set<string>> {
  const { data } = await admin
    .from('sync_settings')
    .select('setting_value')
    .eq('setting_key', SHADOW_READ_FLAG)
    .maybeSingle()
  const raw = data?.setting_value
  const list = Array.isArray(raw) ? raw : []
  return new Set(list.filter((x): x is string => typeof x === 'string'))
}

// Resolve the source for one pool. Every mode now honours the flag — see the
// header note on the retired bracket_picker hard rule.
//
// EXCEPT league pools, which read their OWN totals table.
//
// This used to return 'shadow' for a league, on the reasoning that the flag is
// an allowlist and a league pool omitted from it would read prod, find nothing,
// and render a leaderboard of zeros. The reasoning was right about the hazard
// and wrong about the destination: `shadow_entry_totals` is just as empty for a
// league as `pool_entries` is, so it produced exactly the zeros it was trying to
// avoid — silently, because empty is a valid result.
//
// A league is scored by `league_score_fixture` into `league_entry_totals`
// (migration 055). Keying off the mode is still right: a new league pool is
// correct the moment it exists, with no operational step to forget.
export async function getScoringSource(
  admin: AdminClient,
  poolId: string,
  predictionMode: string,
): Promise<ScoringSource> {
  if (predictionMode === 'league_pickem') return 'league'
  const pools = await getShadowReadPools(admin)
  return pools.has(poolId) ? 'shadow' : 'prod'
}

// --- pagination -------------------------------------------------------------

// Paginate an entry-scoped select past PostgREST's 1000-row cap. orderCols must
// be a UNIQUE sort so ranged pages neither skip nor duplicate a boundary row.
async function paginateByEntry<T = Record<string, unknown>>(
  admin: AdminClient,
  table: string,
  columns: string,
  entryIds: string[],
  orderCols: string[],
  eq?: Record<string, string>,
  inFilter?: { column: string; values: string[] },
): Promise<T[]> {
  const out: T[] = []
  const pageSize = 1000
  let offset = 0
  for (;;) {
    let q = admin.from(table).select(columns).in('entry_id', entryIds)
    if (eq) for (const [col, val] of Object.entries(eq)) q = q.eq(col, val)
    if (inFilter) q = q.in(inFilter.column, inFilter.values)
    for (const c of orderCols) q = q.order(c, { ascending: true })
    const { data, error } = await q.range(offset, offset + pageSize - 1)
    if (error) throw new Error(`readSource: ${table} page@${offset}: ${error.message}`)
    if (!data || data.length === 0) break
    out.push(...(data as T[]))
    offset += data.length
    if (data.length < pageSize) break
  }
  return out
}

// --- entry totals (rollup: points + ranks) ----------------------------------

const ZERO_SCORING = (entryId: string): EntryScoring => ({
  entry_id: entryId,
  match_points: 0,
  bonus_points: 0,
  point_adjustment: 0,
  scored_total_points: 0,
  current_rank: null,
  previous_rank: null,
})

// Returns a map keyed by entry_id for EVERY requested entry. Entries with no
// shadow row (unsubmitted, no adjustment) default to zero/unranked — the same
// thing prod shows for them.
export async function readEntryScoring(
  admin: AdminClient,
  entryIds: string[],
  source: ScoringSource,
): Promise<Map<string, EntryScoring>> {
  const out = new Map<string, EntryScoring>()
  if (entryIds.length === 0) return out

  if (source === 'league') {
    // Same six columns as shadow, and deliberately so: `league_entry_totals`
    // was shaped to match, which is why the league needs no new read contract
    // and every leaderboard surface works unchanged.
    type LeagueRow = {
      entry_id: string
      match_points: number | null
      bonus_points: number | null
      point_adjustment: number | null
      total_points: number | null
      final_rank: number | null
      previous_final_rank: number | null
    }
    const rows = await paginateByEntry<LeagueRow>(
      admin,
      'league_entry_totals',
      'entry_id, match_points, bonus_points, point_adjustment, total_points, final_rank, previous_final_rank',
      entryIds,
      ['entry_id'],
    )
    for (const r of rows) {
      out.set(r.entry_id, {
        entry_id: r.entry_id,
        match_points: r.match_points ?? 0,
        bonus_points: r.bonus_points ?? 0,
        // Stored directly, unlike shadow's, which folds it into the total and
        // has to be recovered by subtraction.
        point_adjustment: r.point_adjustment ?? 0,
        scored_total_points: r.total_points ?? 0,
        current_rank: r.final_rank ?? null,
        previous_rank: r.previous_final_rank ?? null,
      })
    }
  } else if (source === 'shadow') {
    type Row = {
      entry_id: string
      match_points: number | null
      bonus_points: number | null
      total_points: number | null
      final_rank: number | null
      previous_final_rank: number | null
    }
    const rows = await paginateByEntry<Row>(
      admin,
      'shadow_entry_totals',
      'entry_id, match_points, bonus_points, total_points, final_rank, previous_final_rank',
      entryIds,
      ['entry_id'],
    )
    for (const r of rows) {
      const mp = r.match_points ?? 0
      const bp = r.bonus_points ?? 0
      const tp = r.total_points ?? 0
      out.set(r.entry_id, {
        entry_id: r.entry_id,
        match_points: mp,
        bonus_points: bp,
        // point_adjustment is folded into shadow's total; recover it (matches
        // prod's stored point_adjustment for every scored entry).
        point_adjustment: tp - mp - bp,
        scored_total_points: tp,
        current_rank: r.final_rank ?? null,
        previous_rank: r.previous_final_rank ?? null,
      })
    }
  } else {
    type Row = {
      entry_id: string
      match_points: number | null
      bonus_points: number | null
      scored_total_points: number | null
      point_adjustment: number | null
      current_rank: number | null
      previous_rank: number | null
    }
    const rows = await paginateByEntry<Row>(
      admin,
      'pool_entries',
      'entry_id, match_points, bonus_points, scored_total_points, point_adjustment, current_rank, previous_rank',
      entryIds,
      ['entry_id'],
    )
    for (const r of rows) {
      out.set(r.entry_id, {
        entry_id: r.entry_id,
        match_points: r.match_points ?? 0,
        bonus_points: r.bonus_points ?? 0,
        point_adjustment: r.point_adjustment ?? 0,
        scored_total_points: r.scored_total_points ?? 0,
        current_rank: r.current_rank ?? null,
        previous_rank: r.previous_rank ?? null,
      })
    }
  }

  for (const id of entryIds) if (!out.has(id)) out.set(id, ZERO_SCORING(id))
  return out
}

// --- per-match scores (breakdown surface) -----------------------------------


/**
 * Readers that do not yet have a league arm.
 *
 * ⚠ WHY THIS EXISTS. Adding `'league'` to `ScoringSource` made seven
 * `source === 'shadow' ? shadow_match_scores : match_scores` ternaries wrong at
 * a stroke: a league source falls to the ELSE, reads the World Cup's
 * `match_scores`, finds nothing, and returns an empty result at HTTP 200. The
 * compiler cannot see it, because a ternary is not an exhaustive switch.
 *
 * Empty is what would happen anyway — the point is that it becomes VISIBLE.
 * These surfaces (per-match breakdown, recent form, classification) are not in
 * the vertical slice; the leaderboard path (`readEntryScoring` and
 * `readMatchScoresNarrow`) has real league arms above.
 */
function leagueNotImplemented(fn: string): true {
  console.error(
    `[readSource] ${fn} has no league arm yet — returning empty rather than reading ` +
      `the World Cup's match_scores. See drafts/2026-08-22_league_vertical_slice.md §5.`,
  )
  return true
}

const MATCH_SCORE_SHARED_COLS =
  'entry_id, match_id, pool_id, match_number, stage, score_type, base_points, multiplier, ' +
  'pso_points, total_points, teams_match, predicted_home_score, predicted_away_score, ' +
  'actual_home_score, actual_away_score, predicted_home_pso, predicted_away_pso, ' +
  'actual_home_pso, actual_away_pso, predicted_home_team_id, predicted_away_team_id, calculated_at'

export async function readMatchScores(
  admin: AdminClient,
  entryIds: string[],
  source: ScoringSource,
  opts?: { matchId?: string; matchIds?: string[] },
): Promise<MatchScoreData[]> {
  if (source === 'league' && leagueNotImplemented('readMatchScores')) return []

  if (entryIds.length === 0) return []
  const table = source === 'shadow' ? 'shadow_match_scores' : 'match_scores'
  // prod match_scores has a uuid `id` PK; shadow's PK is (entry_id, match_id).
  const columns = source === 'shadow' ? MATCH_SCORE_SHARED_COLS : 'id, ' + MATCH_SCORE_SHARED_COLS
  const rows = await paginateByEntry<Record<string, unknown>>(
    admin,
    table,
    columns,
    entryIds,
    ['entry_id', 'match_id'],
    opts?.matchId ? { match_id: opts.matchId } : undefined,
    // Used by the /live endpoint to pull only in-play matches. Bounded by how
    // many matches kick off at once, never by the size of the fixture list.
    opts?.matchIds?.length ? { column: 'match_id', values: opts.matchIds } : undefined,
  )
  return rows.map((r) => ({
    // synthesise a stable id for shadow rows (unused downstream, but the type +
    // any React key expects one); prod keeps its real id.
    id: (r.id as string | undefined) ?? `${r.entry_id as string}:${r.match_id as string}`,
    ...(r as Omit<MatchScoreData, 'id'>),
  })) as MatchScoreData[]
}

// --- bonus scores -----------------------------------------------------------

export async function readBonusScores(
  admin: AdminClient,
  entryIds: string[],
  source: ScoringSource,
): Promise<BonusScoreData[]> {
  if (source === 'league' && leagueNotImplemented('readBonusScores')) return []

  if (entryIds.length === 0) return []
  const shared =
    'entry_id, bonus_type, bonus_category, related_group_letter, related_match_id, points_earned, description'

  if (source === 'shadow') {
    const rows = await paginateByEntry<Record<string, unknown>>(
      admin,
      'shadow_bonus_scores',
      shared,
      entryIds,
      // (entry_id, bonus_type, related_group_letter, related_match_id) is the
      // shadow natural key — a unique, stable pagination order.
      ['entry_id', 'bonus_type', 'related_group_letter', 'related_match_id'],
    )
    return rows.map((r) => ({
      // shadow has no bonus_id PK; synthesise from the natural key (stable +
      // unique — safe as a React key / for de-dup).
      bonus_id: `${r.entry_id as string}:${r.bonus_type as string}:${(r.related_group_letter as string) ?? ''}:${(r.related_match_id as string) ?? ''}`,
      entry_id: r.entry_id as string,
      bonus_type: r.bonus_type as string,
      bonus_category: r.bonus_category as string,
      related_group_letter: (r.related_group_letter as string | null) ?? null,
      related_match_id: (r.related_match_id as string | null) ?? null,
      points_earned: r.points_earned as number,
      description: r.description as string,
    })) as BonusScoreData[]
  }

  const rows = await paginateByEntry<Record<string, unknown>>(
    admin,
    'bonus_scores',
    'bonus_id, ' + shared,
    entryIds,
    ['entry_id', 'bonus_id'],
  )
  return rows.map((r) => ({
    bonus_id: r.bonus_id as string,
    entry_id: r.entry_id as string,
    bonus_type: r.bonus_type as string,
    bonus_category: r.bonus_category as string,
    related_group_letter: (r.related_group_letter as string | null) ?? null,
    related_match_id: (r.related_match_id as string | null) ?? null,
    points_earned: r.points_earned as number,
    description: r.description as string,
  })) as BonusScoreData[]
}

// --- recent form (last N results) -------------------------------------------

/**
 * The last N match results for ONE entry, newest-last, as score_type strings —
 * the ▪▪▪▪▪ form dots on the My Pools / Dashboard / Profile cards.
 *
 * Deliberately NOT built on readMatchScores. That returns EVERY match score for
 * the given entries, which is right for the leaderboard but wrong here: these
 * cards need 5 rows per entry, and a user in 10 pools would pull ~1,040 rows to
 * display 50. This keeps the original bounded query (`order by match_number
 * desc limit N`) and only switches which table it reads — correct source AND
 * minimal egress, which is the whole point of routing these surfaces through
 * readSource in the first place.
 *
 * Both tables expose score_type + match_number, so the query shape is identical.
 */
export async function readRecentForm(
  admin: AdminClient,
  entryId: string,
  source: ScoringSource,
  limit = 5,
): Promise<string[]> {
  if (source === 'league' && leagueNotImplemented('readRecentForm')) return []

  const table = source === 'shadow' ? 'shadow_match_scores' : 'match_scores'
  const { data, error } = await admin
    .from(table)
    .select('score_type, match_number')
    .eq('entry_id', entryId)
    .order('match_number', { ascending: false })
    .limit(limit)
  // Form is decorative — a failure must not take down the pools list.
  if (error) return []
  return (data ?? []).reverse().map((s: { score_type: string }) => s.score_type)
}

/**
 * Minimal per-match classification for a set of entries: which result type each
 * prediction earned and how many points. Used by the Profile page to label a
 * user's predictions across every pool they're in.
 *
 * Five columns, not the 22 in MATCH_SCORE_SHARED_COLS. readMatchScores is the
 * right call when the caller renders a full breakdown; here it would ship ~5x
 * the bytes to render a label. Paginated, so it also fixes the silent
 * PostgREST 1,000-row truncation the previous direct `.in()` query had — a user
 * in enough pools would simply stop seeing older predictions classified.
 *
 * Ordered by match_number so callers can derive recent form and streaks from
 * the same rows without a second query.
 */
export type MatchScoreClassification = {
  entry_id: string
  match_id: string
  match_number: number
  score_type: 'exact' | 'winner_gd' | 'winner' | 'miss'
  total_points: number
}

export async function readMatchScoreClassification(
  admin: AdminClient,
  entryIds: string[],
  source: ScoringSource,
): Promise<MatchScoreClassification[]> {
  if (source === 'league' && leagueNotImplemented('readMatchScoreClassification')) return []

  if (entryIds.length === 0) return []
  const table = source === 'shadow' ? 'shadow_match_scores' : 'match_scores'
  return paginateByEntry<MatchScoreClassification>(
    admin,
    table,
    'entry_id, match_id, match_number, score_type, total_points',
    entryIds,
    ['entry_id', 'match_number'],
  )
}

export type MatchScoreEvent = {
  entry_id: string
  pool_id: string
  match_id: string
  match_number: number
  score_type: 'exact' | 'winner_gd' | 'winner' | 'miss'
  total_points: number
  actual_home_score: number | null
  actual_away_score: number | null
  calculated_at: string
}

/**
 * The N most recently scored matches for a set of entries — the activity feed's
 * source. Bounded by `limit` rather than paginated: the feed shows recent events,
 * so pulling every historical row to discard all but the newest would be pure
 * egress.
 *
 * Callers with entries spanning both sources should call this once per source
 * and merge: the global top-N is always a subset of (top-N from each), so
 * concatenating and re-sorting is exact, not an approximation.
 */
export async function readRecentMatchScoreEvents(
  admin: AdminClient,
  entryIds: string[],
  source: ScoringSource,
  limit = 200,
): Promise<MatchScoreEvent[]> {
  if (source === 'league' && leagueNotImplemented('readRecentMatchScoreEvents')) return []

  if (entryIds.length === 0) return []
  const table = source === 'shadow' ? 'shadow_match_scores' : 'match_scores'
  const { data, error } = await admin
    .from(table)
    .select(
      'entry_id, pool_id, match_id, match_number, score_type, total_points, ' +
        'actual_home_score, actual_away_score, calculated_at',
    )
    .in('entry_id', entryIds)
    .order('calculated_at', { ascending: false })
    .limit(limit)
  if (error) return []
  return (data ?? []) as unknown as MatchScoreEvent[]
}


/** The 8 columns the pool-wide payload needs — see MatchScoreNarrow. */
const MATCH_SCORE_NARROW_COLS = 'entry_id, match_id, pool_id, match_number, stage, score_type, total_points'

export async function readMatchScoresNarrow(
  admin: AdminClient,
  entryIds: string[],
  source: ScoringSource,
  matchIds?: string[],
): Promise<MatchScoreNarrow[]> {
  if (entryIds.length === 0) return []

  // The league arm. `league_match_scores` carries the same facts under
  // different names — fixture_id/fixture_number rather than
  // match_id/match_number — so they are aliased in the select and `stage` is
  // supplied in JS, since a league has no stage column to read.
  if (source === 'league') {
    const leagueRows = await paginateByEntry<Record<string, unknown>>(
      admin,
      'league_match_scores',
      'entry_id, match_id:fixture_id, pool_id, match_number:fixture_number, score_type, total_points',
      entryIds,
      ['entry_id', 'fixture_id'],
      undefined,
      matchIds?.length ? { column: 'fixture_id', values: matchIds } : undefined,
    )
    return leagueRows.map((r) => ({
      id: `${r.entry_id as string}:${r.match_id as string}`,
      // 'regular_season' matches what lib/league/read.ts puts on a fixture, so
      // anything grouping by stage sees one consistent value across both.
      stage: 'regular_season',
      ...(r as Omit<MatchScoreNarrow, 'id' | 'stage'>),
    })) as MatchScoreNarrow[]
  }

  const table = source === 'shadow' ? 'shadow_match_scores' : 'match_scores'
  const columns = source === 'shadow' ? MATCH_SCORE_NARROW_COLS : 'id, ' + MATCH_SCORE_NARROW_COLS
  const rows = await paginateByEntry<Record<string, unknown>>(
    admin, table, columns, entryIds, ['entry_id', 'match_id'], undefined,
    matchIds?.length ? { column: 'match_id', values: matchIds } : undefined,
  )
  return rows.map((r) => ({
    id: (r.id as string | undefined) ?? `${r.entry_id as string}:${r.match_id as string}`,
    ...(r as Omit<MatchScoreNarrow, 'id'>),
  })) as MatchScoreNarrow[]
}
