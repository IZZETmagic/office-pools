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
import { getScoringSource, readEntryScoring, readMatchScores, readBonusScores } from '@/lib/scoring/readSource'
import type {
  PoolData,
  MemberData,
  EntryData,
  MatchData,
  SettingsData,
  PredictionData,
  TeamData,
  MatchScoreData,
  BonusScoreData,
} from '@/app/pools/[pool_id]/types'

export const POOL_CACHE_TTL_SECONDS = 45

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
  allPredictions: PredictionData[]
  conductData: {
    match_id: string
    team_id: string
    yellow_cards: number
    indirect_red_cards: number
    direct_red_cards: number
    yellow_direct_red_cards: number
  }[]
  matchScores: MatchScoreData[]
  bonusScores: BonusScoreData[]
  bpProvisionalScoring: boolean
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
      .select('*, users!inner(user_id, username, full_name, email), pool_entries(*)')
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
      pool: null, members: [], matches: [], settings: null, teams: [], allPredictions: [],
      conductData: [], matchScores: [], bonusScores: [], bpProvisionalScoring: false,
    }
  }

  // Matches for this tournament (+ team joins).
  const { data: matchesRaw } = await admin
    .from('matches')
    .select(
      `*, home_team:teams!matches_home_team_id_fkey(country_name, country_code, flag_url), away_team:teams!matches_away_team_id_fkey(country_name, country_code, flag_url)`,
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

  // The heavy, per-pool, all-entries pulls — all paginated, all admin client.
  const [bonusScores, matchScores, allPredictions] = await Promise.all([
    safeRead(readBonusScores(admin, allEntryIds, source), [] as BonusScoreData[]),
    safeRead(readMatchScores(admin, allEntryIds, source), [] as MatchScoreData[]),
    allEntryIds.length
      ? fetchAllPages<PredictionData>('predictions', (from, to) =>
          admin
            .from('predictions')
            .select('*')
            .in('entry_id', allEntryIds)
            .order('entry_id', { ascending: true })
            .order('match_id', { ascending: true })
            .range(from, to),
        throwOnFetchError,
      )
      : Promise.resolve([]),
  ])

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

  return {
    pool, members, matches, settings, teams, allPredictions, conductData, matchScores,
    bonusScores, bpProvisionalScoring,
  }
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
