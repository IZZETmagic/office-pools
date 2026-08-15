// ============================================================================
// Per-pool shared data fetch — SCALE_PLAN.md Phase 1a (caching).
//
// Everything in here is IDENTICAL for every viewer of a given pool (standings,
// predictions, scores, bonuses, bracket data, matches). It is fetched with the
// ADMIN client so the result is deterministic regardless of who is viewing —
// which is what makes it safe to cache and share. NOTHING per-user lives here
// (auth, membership, the viewer's own picks stay in page.tsx, uncached).
//
// `getPoolDataUncached` = the raw fetch (today's behaviour, just relocated).
// `getPoolDataCached`    = the same, wrapped in unstable_cache with a per-pool
//                          tag + short TTL. Phase 1b adds revalidateTag on the
//                          `pool-data-${poolId}` tag from the scoring sweep.
//
// Master switch: sync_settings.pool_cache_enabled (default false). page.tsx
// reads the flag per request and calls cached or uncached accordingly, so the
// cache can be turned off instantly with no deploy.
//
// 1000-ROW RULE (SCALE_PLAN §3 trap #1): every potentially >1000-row fetch here
// is paginated. Do not add an un-paginated `.in()`/`.eq()` list fetch.
// ============================================================================
import { unstable_cache, revalidateTag } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getScoringSource, readEntryScoring, readMatchScoresNarrow, readBonusScores } from '@/lib/scoring/readSource'
import type {
  PoolData,
  MemberData,
  EntryData,
  MatchData,
  SettingsData,
  PredictionData,
  TeamData,
  MatchScoreNarrow,
  BonusScoreData,
  PodiumResult,
  EntryStatsData,
  MatchdayMVPData,
  MatchAccuracyData,
} from '@/app/pools/[pool_id]/types'

export const POOL_CACHE_TTL_SECONDS = 45

// The exact columns behind `PredictionData` — nothing more. `predictions` has 11
// columns; only these 8 are ever read. Shared so every bulk prediction fetch
// stays narrow and can't drift back to `select('*')`.
export const PREDICTION_COLUMNS =
  'prediction_id, entry_id, match_id, predicted_home_score, predicted_away_score, predicted_home_pso, predicted_away_pso, predicted_winner_team_id'

// The exact columns behind `MatchData` — nothing more. `matches` has 30 columns;
// the type declares 23, so `*` was dragging created_at, updated_at,
// external_match_id, data_source, last_synced_at, result_pushes_sent_at and
// live_added over the wire for every fixture. Verified zero reads of those in the
// web UI before narrowing. 100 kB -> 72 kB on a 104-match tournament.
export const MATCH_COLUMNS =
  'match_id, tournament_id, match_number, stage, group_letter, round_number, home_team_id, away_team_id, ' +
  'home_team_placeholder, away_team_placeholder, match_date, venue, status, ' +
  'home_score_ft, away_score_ft, home_score_pso, away_score_pso, winner_team_id, ' +
  'is_completed, completed_at, status_detail, original_match_date, live_minute, live_period'

// The exact columns behind `MemberData` — nothing more. `pool_members` has 10;
// the type declares 6. The four dropped (payment_method, payment_notes,
// has_seen_how_to_play, last_read_at) are read ELSEWHERE from their own queries —
// has_seen_how_to_play from page.tsx's membership lookup, last_read_at from
// hooks/useUnreadBanter — never off this array. 66 kB -> 44 kB on 192 members.
//
// `pool_entries(*)` stays wide on purpose: EntryData declares all 21 columns the
// table has, and every one is read somewhere in the web app. Narrowing it would
// mean changing the type, and a narrowed SELECT under a wide type hands consumers
// `undefined` silently.
export const POOL_MEMBER_COLUMNS = 'member_id, pool_id, user_id, role, joined_at, entry_fee_paid'

// Single source of truth for a pool's cache tag — used both when caching
// (getPoolDataCached) and when invalidating (invalidatePoolCache), so the two
// can never drift apart.
export function poolCacheTag(poolId: string): string {
  return `pool-data-${poolId}`
}

// Phase 1b: called from the scoring sweep after a pool is recalculated, so the
// cached leaderboard refreshes within seconds of a score change instead of
// waiting out the TTL. Wrapped so it can NEVER affect scoring:
//   - revalidateTag only runs in a request/route context; if the sweep ever
//     runs outside one, this no-ops and the short TTL is the backstop.
//   - any error is swallowed; scoring correctness must not depend on the cache.
export function invalidatePoolCache(poolId: string): void {
  try {
    // The per-tab bulk arrays are scored data too — a recalc changes match_scores,
    // so this tag must expire with the main one or an open Analytics tab would
    // serve pre-goal scores for up to the TTL.
    revalidateTag(poolBulkCacheTag(poolId), { expire: 0 })
    // { expire: 0 } = expire the tag immediately (Next 16). This is the
    // documented path for an external/background trigger (our cron-driven
    // scoring sweep) that needs the data fresh now, and it's the clean
    // replacement for the deprecated single-arg form against unstable_cache.
    // Next request for this pool re-fetches once (our budgeted ~1 fetch per
    // pool per score change); the 45s TTL is the backstop if this is skipped.
    revalidateTag(poolCacheTag(poolId), { expire: 0 })
  } catch (err) {
    console.warn(`[poolData] invalidatePoolCache skipped for ${poolId}:`, (err as Error)?.message)
  }
}

export type PoolSharedData = {
  pool: PoolData | null
  members: MemberData[]
  matches: MatchData[]
  settings: SettingsData | null
  teams: TeamData[]
  conductData: {
    match_id: string
    team_id: string
    yellow_cards: number
    indirect_red_cards: number
    direct_red_cards: number
    yellow_direct_red_cards: number
  }[]
  bonusScores: BonusScoreData[]
  bpProvisionalScoring: boolean
  // Final tournament podium (from tournament_awards), or null until finalized.
  // Drives the "Tournament Podium" pick-vs-actual section in the points breakdown.
  tournamentAwards: PodiumResult | null
  // Precomputed per-entry leaderboard stats (one row per entry) — replaces the
  // browser-side derivation over every prediction + score row in the pool.
  entryStats: EntryStatsData[]
  // Best haul on the most recently completed match, or null before any is played.
  matchdayMVP: MatchdayMVPData | null
  // One row per completed match: how many of the pool picked it, how many were
  // right. Counted in SQL (migration 038) so Banter's Matchday Pulse no longer
  // needs every prediction in the pool to show three percentages.
  matchAccuracy: MatchAccuracyData[]
}
// NOTE: the bracket_picker all-entries data (allBP*) is intentionally NOT here.
// Its RLS makes it per-VIEWER (a non-admin member can only read their own
// picks), so it is not shared per-pool data and must NOT be cached with the
// admin client — page.tsx fetches it per-viewer with the user client to
// preserve exactly what each member sees today.

// Paginate any select to defeat PostgREST's 1000-row silent cap.
export async function fetchAllPages<T>(
  label: string,
  run: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  throwOnError = false,
): Promise<T[]> {
  const out: T[] = []
  const pageSize = 1000
  let offset = 0
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data: page, error } = await run(offset, offset + pageSize - 1)
    if (error) {
      console.error(`[poolData] ${label} page@${offset} error:`, error.message)
      // throwOnError=true for CACHED fetches (getPoolDataUncached): throwing
      // means unstable_cache never stores a partial/errored result for the TTL
      // — the request just retries. throwOnError=false (default) preserves the
      // prior swallow-and-return-partial behaviour for uncached per-viewer
      // callers (page.tsx / bracket-analytics), which render partial today.
      if (throwOnError) {
        throw new Error(`getPoolData ${label} failed at offset ${offset}: ${error.message}`)
      }
      break
    }
    if (!page || page.length === 0) break
    out.push(...page)
    offset += page.length
    if (page.length < pageSize) break
  }
  return out
}

export async function getPoolDataUncached(poolId: string, throwOnFetchError = false): Promise<PoolSharedData> {
  const admin = createAdminClient()

  // Pool, members(+users+entries), settings, teams — small, pool-wide.
  const [poolRes, membersRes, settingsRes, teamsRes] = await Promise.all([
    admin.from('pools').select('*').eq('pool_id', poolId).single(),
    admin
      .from('pool_members')
      .select(`${POOL_MEMBER_COLUMNS}, users!inner(user_id, username, full_name, email), pool_entries(*)`)
      .eq('pool_id', poolId),
    admin.from('pool_settings').select('*').eq('pool_id', poolId).single(),
    admin
      .from('teams')
      .select('team_id, country_name, country_code, group_letter, fifa_ranking_points, flag_url')
      .order('group_letter', { ascending: true })
      .order('fifa_ranking_points', { ascending: false }),
  ])

  const pool = poolRes.data as PoolData | null
  if (!pool) {
    // Caller (page.tsx) handles the redirect; return an empty shell.
    return {
      pool: null, members: [], matches: [], settings: null, teams: [],
      conductData: [], bonusScores: [], bpProvisionalScoring: false,
      tournamentAwards: null, entryStats: [], matchdayMVP: null, matchAccuracy: [],
    }
  }

  // Matches for this tournament (+ team joins).
  const { data: matchesRaw } = await admin
    .from('matches')
    .select(
      `${MATCH_COLUMNS}, home_team:teams!matches_home_team_id_fkey(country_name, country_code, flag_url), away_team:teams!matches_away_team_id_fkey(country_name, country_code, flag_url)`,
    )
    .eq('tournament_id', pool.tournament_id)
    .order('match_number', { ascending: true })

  // Strip knockout team assignments until all groups complete (unchanged logic).
  const allGroupsComplete = (matchesRaw || [])
    .filter((m: any) => m.stage === 'group')
    .every((m: any) => m.is_completed)
  const matches: MatchData[] = (matchesRaw || []).map((m: any) => {
    const homeTeam = Array.isArray(m.home_team) ? m.home_team[0] ?? null : m.home_team
    const awayTeam = Array.isArray(m.away_team) ? m.away_team[0] ?? null : m.away_team
    const isKnockout = m.stage !== 'group'
    if (isKnockout && !allGroupsComplete) {
      return { ...m, home_team_id: null, away_team_id: null, home_team: null, away_team: null }
    }
    return { ...m, home_team: homeTeam, away_team: awayTeam }
  })

  // Members: attach + sort entries (unchanged logic).
  const members = (membersRes.data || []).map((m: any) => {
    const entries = (m.pool_entries || []) as EntryData[]
    entries.sort((a: EntryData, b: EntryData) => a.entry_number - b.entry_number)
    return { ...m, pool_entries: undefined, entries } as MemberData
  })

  const settings = settingsRes.data as SettingsData | null
  const teams = (teamsRes.data || []) as TeamData[]
  const allEntryIds = members.flatMap((m) => m.entries || []).map((e) => e.entry_id)

  // Scoring read source (prod columns by default, or the shadow engine for pools
  // flipped via sync_settings.shadow_read_enabled_pools). Prod mode reads the
  // identical columns ⇒ byte-identical. A read failure falls back like the other
  // fetches here: rethrow on the cached path (never cache partial), swallow on
  // the uncached one.
  const safeRead = async <T>(p: Promise<T>, fallback: T): Promise<T> => {
    try {
      return await p
    } catch (e) {
      if (throwOnFetchError) throw e
      console.error('[poolData] read-source error:', (e as Error)?.message)
      return fallback
    }
  }
  const source = await safeRead(getScoringSource(admin, poolId, pool.prediction_mode), 'prod' as const)
  const entryScoring = await safeRead(readEntryScoring(admin, allEntryIds, source), new Map())
  for (const m of members) {
    for (const e of (m.entries || [])) {
      const s = entryScoring.get(e.entry_id)
      if (!s) continue
      e.match_points = s.match_points
      e.bonus_points = s.bonus_points
      e.point_adjustment = s.point_adjustment
      e.scored_total_points = s.scored_total_points
      e.current_rank = s.current_rank
      e.previous_rank = s.previous_rank
    }
  }

  // match_conduct — scoped to this tournament's matches (was an UNFILTERED
  // whole-table pull in page.tsx; SCALE_PLAN §3 0.4). Derive match ids locally.
  const matchIds = matches.map((m) => m.match_id)
  const conductData = matchIds.length
    ? await fetchAllPages<PoolSharedData['conductData'][number]>('match_conduct', (from, to) =>
        admin
          .from('match_conduct')
          .select('match_id, team_id, yellow_cards, indirect_red_cards, direct_red_cards, yellow_direct_red_cards')
          .in('match_id', matchIds)
          .order('match_id', { ascending: true })
          .range(from, to),
      throwOnFetchError,
    )
    : []

  // NOTE: the two pool-wide arrays that used to be fetched here —
  // `match_scores` (3,515 kB) and `predictions` (3,815 kB) on the largest pool —
  // are NO LONGER part of pool open. They were 95% of a 7,721 kB payload and the
  // default tab (leaderboard) does not read either any more: it reads the
  // precomputed `entryStats` below.
  //
  // The tabs that genuinely need them (analytics, community, results, members,
  // the entries list) load them when opened, via getPoolBulkData /
  // GET /api/pools/:id/bulk. Crucially the PREDICTIONS half must stay behind the
  // reveal gate, which is why the route applies it per viewer rather than this
  // shared, cached fetch doing it once for everyone.
  const bonusScores = await safeRead(readBonusScores(admin, allEntryIds, source), [] as BonusScoreData[])

  // Precomputed leaderboard stats — ONE row per entry, replacing a browser-side
  // derivation over every prediction + score row in the pool. Written by the
  // scoring path (lib/push/badges.ts → computePoolEntryAnalytics on every
  // recalc), so it moves with the score rather than lagging behind it.
  //
  // Entries with no predictions have no row; the leaderboard falls back to the
  // same all-zero shape it renders for them today.
  const entryStats = await safeRead(readEntryStats(admin, allEntryIds, throwOnFetchError), [] as EntryStatsData[])

  // Matchday MVP — the best single-match haul on the most recently completed
  // match. This used to scan the pool-wide match_scores array in the browser;
  // it needs ONE match's rows, so it reads exactly those (via the same source
  // reader, so shadow-read pools stay consistent with their leaderboard).
  const lastCompleted = matches
    .filter((m) => m.is_completed && m.home_score_ft !== null && m.away_score_ft !== null)
    .sort((a, b) => b.match_number - a.match_number)[0]
  let matchdayMVP: MatchdayMVPData | null = null
  if (lastCompleted && allEntryIds.length) {
    const rows = await safeRead(
      readMatchScoresNarrow(admin, allEntryIds, source, [lastCompleted.match_id]),
      [] as MatchScoreNarrow[],
    )
    let best: MatchScoreNarrow | null = null
    for (const r of rows) {
      if (r.total_points > (best?.total_points ?? 0)) best = r
    }
    // Matches the client's rule: no MVP when nobody scored on that match.
    if (best && best.total_points > 0) {
      matchdayMVP = {
        entry_id: best.entry_id,
        match_points: best.total_points,
        match_number: lastCompleted.match_number,
      }
    }
  }

  // Per-match pool accuracy — counted in the database (migration 038). ~104 tiny
  // rows; the alternative was every prediction in the pool, in the browser.
  const { data: accuracyRows } = await admin.rpc('pool_match_prediction_accuracy', {
    p_pool_id: poolId,
  })
  const matchAccuracy = (accuracyRows ?? []) as MatchAccuracyData[]

  // (Bracket all-entries data is fetched per-viewer in page.tsx — see note on
  // PoolSharedData above. It is per-VIEWER, not shared, so it is not cached.)

  // Provisional bracket scoring kill-switch (pool-wide flag).
  const { data: bpProvisionalRow } = await admin
    .from('sync_settings')
    .select('setting_value')
    .eq('setting_key', 'bp_provisional_scoring')
    .maybeSingle()
  const bpProvisionalScoring =
    bpProvisionalRow?.setting_value === true || bpProvisionalRow?.setting_value === 'true'

  // Final podium (champion/runner-up/third). Populated manually at tournament end;
  // null until then. Names/flags resolved from the already-loaded teams list so we
  // avoid extra joins and FK-hint coupling.
  const { data: awardsRow } = await admin
    .from('tournament_awards')
    .select('champion_team_id, runner_up_team_id, third_place_team_id')
    .eq('tournament_id', pool.tournament_id)
    .maybeSingle()
  const teamById = new Map(teams.map((t) => [t.team_id, t]))
  const toPodiumTeam = (id: string | null | undefined) => {
    if (!id) return null
    const t = teamById.get(id)
    return t ? { team_id: t.team_id, country_name: t.country_name, flag_url: t.flag_url ?? null } : null
  }
  const tournamentAwards: PodiumResult | null = awardsRow
    ? {
        champion: toPodiumTeam(awardsRow.champion_team_id),
        runnerUp: toPodiumTeam(awardsRow.runner_up_team_id),
        thirdPlace: toPodiumTeam(awardsRow.third_place_team_id),
      }
    : null

  return {
    pool, members, matches, settings, teams, conductData,
    bonusScores, bpProvisionalScoring, tournamentAwards, entryStats, matchdayMVP,
    matchAccuracy,
  }
}

// entry_xp_state, chunked by entry id AND paged inside each chunk. A single
// `.in()` over every entry would both overflow the request URL on a large pool
// and silently cap at PostgREST's 1000-row limit (SCALE_PLAN §3 trap #1).
export async function readEntryStats(
  admin: ReturnType<typeof createAdminClient>,
  entryIds: string[],
  throwOnFetchError = false,
): Promise<EntryStatsData[]> {
  if (entryIds.length === 0) return []
  const CHUNK = 200
  const out: EntryStatsData[] = []
  for (let i = 0; i < entryIds.length; i += CHUNK) {
    const slice = entryIds.slice(i, i + CHUNK)
    const rows = await fetchAllPages<EntryStatsData>('entry_xp_state', (from, to) =>
      admin
        .from('entry_xp_state')
        .select(
          'entry_id, hit_rate, exact_count, total_completed, contrarian_wins, crowd_agreement_pct, total_xp, current_level, highest_level_reached, last_five, current_streak',
        )
        .in('entry_id', slice)
        .order('entry_id', { ascending: true })
        .range(from, to),
      throwOnFetchError,
    )
    out.push(...rows)
  }
  return out
}

// Per-pool cached wrapper. Built per-call so the cache key AND the invalidation
// tag are scoped to this poolId (unstable_cache's options.tags is static, so we
// bake poolId into both keyParts and the tag here). Phase 1b: the scoring sweep
// calls revalidateTag(`pool-data-${poolId}`) to refresh on score change.
export function getPoolDataCached(poolId: string): Promise<PoolSharedData> {
  return unstable_cache(
    // throwOnFetchError=true: never cache a partial/errored result (a thrown
    // error isn't cached — the request just retries). The uncached fallback
    // path keeps the prior swallow-partial behaviour (default false).
    () => getPoolDataUncached(poolId, true),
    ['pool-shared-data', poolId],
    { tags: [poolCacheTag(poolId)], revalidate: POOL_CACHE_TTL_SECONDS },
  )()
}

// Read the master switch (tiny indexed read; intentionally NOT cached so the
// off-switch is instant).
export async function isPoolCacheEnabled(): Promise<boolean> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('sync_settings')
    .select('setting_value')
    .eq('setting_key', 'pool_cache_enabled')
    .maybeSingle()
  return data?.setting_value === true || data?.setting_value === 'true'
}

export async function getPoolData(poolId: string): Promise<PoolSharedData> {
  return (await isPoolCacheEnabled()) ? getPoolDataCached(poolId) : getPoolDataUncached(poolId)
}

// ============================================================================
// BULK (per-tab) DATA — the two pool-wide arrays, split out of pool open.
//
// Only the tabs that actually read them pay for them, and only when opened:
// analytics, community, results, members, and the entries list. The default tab
// (leaderboard) reads neither, which is what took pool open from 7,721 kB to
// ~445 kB on the largest pool.
//
// ⚠ PREDICTIONS ARE UNGATED HERE — this is the raw admin read, identical for
// every viewer, which is what makes it cacheable. The reveal gate (never ship
// another member's unlocked picks) is applied PER VIEWER by the route in
// app/api/pools/[pool_id]/bulk. Never return this straight to a client.
// ============================================================================
export type PoolBulkData = {
  allPredictions: PredictionData[]
  matchScores: MatchScoreNarrow[]
}

export function poolBulkCacheTag(poolId: string): string {
  return `pool-bulk-${poolId}`
}

export async function getPoolBulkDataUncached(
  poolId: string,
  throwOnFetchError = false,
): Promise<PoolBulkData> {
  const admin = createAdminClient()

  const { data: pool } = await admin
    .from('pools')
    .select('pool_id, prediction_mode')
    .eq('pool_id', poolId)
    .single()
  if (!pool) return { allPredictions: [], matchScores: [] }

  const { data: memberRows } = await admin
    .from('pool_members')
    .select('pool_entries(entry_id)')
    .eq('pool_id', poolId)
  const allEntryIds = ((memberRows ?? []) as Array<{ pool_entries?: Array<{ entry_id: string }> | null }>)
    .flatMap((m) => m.pool_entries ?? [])
    .map((e) => e.entry_id)
    .filter(Boolean)

  if (allEntryIds.length === 0) return { allPredictions: [], matchScores: [] }

  const source = await getScoringSource(admin, poolId, pool.prediction_mode)

  const [matchScores, allPredictions] = await Promise.all([
    // Narrow: the 14 wide columns are read by PointsBreakdownModal and
    // results/MatchCard, which both look at ONE entry and fetch them on demand.
    readMatchScoresNarrow(admin, allEntryIds, source),
    fetchAllPages<PredictionData>('predictions', (from, to) =>
      admin
        .from('predictions')
        // Name the columns — this is the single most expensive statement in the
        // product (~33% of all DB execution time). `*` dragged confidence_level
        // + created_at + updated_at through json_agg and over the wire;
        // PredictionData is exactly these 8 fields.
        .select(PREDICTION_COLUMNS)
        .in('entry_id', allEntryIds)
        .order('entry_id', { ascending: true })
        .order('match_id', { ascending: true })
        .range(from, to),
      throwOnFetchError,
    ),
  ])

  return { allPredictions, matchScores }
}

export function getPoolBulkDataCached(poolId: string): Promise<PoolBulkData> {
  return unstable_cache(
    () => getPoolBulkDataUncached(poolId, true),
    ['pool-bulk-data', poolId],
    // Same TTL as pool open, and its own tag so a score change refreshes it too
    // (invalidatePoolCache clears both).
    { tags: [poolBulkCacheTag(poolId)], revalidate: POOL_CACHE_TTL_SECONDS },
  )()
}

export async function getPoolBulkData(poolId: string): Promise<PoolBulkData> {
  return (await isPoolCacheEnabled()) ? getPoolBulkDataCached(poolId) : getPoolBulkDataUncached(poolId)
}
