import { roundLabel } from '@/lib/competitionRounds'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getShadowReadPools, readEntryScoring, readRecentForm } from '@/lib/scoring/readSource'
import { redirect } from 'next/navigation'
import { resolveEntryLevel } from '@/lib/entryLevel'
import { pickBestEntry } from '@/lib/bestEntry'
import { readLeagueCardFacts } from '@/lib/league/poolCards'
import type { EntryScoring } from '@/lib/scoring/readSource'
import { PoolsClient } from './PoolsClient'

/**
 * The fields of a `pool_members` row the league branches below read.
 *
 * Narrow on purpose. The rest of this file predates it and still destructures
 * membership rows as `any`; this covers the columns the league work touches so
 * a mistyped one is a compile error rather than `undefined` flowing into a
 * query filter — which is the shape of the bug that emptied these cards.
 */
type LeagueMembership = {
  pools: {
    pool_id: string
    prediction_mode: string
    tournament_id: string | null
    league_mode: string | null
    league_season_id: string | null
    league_table_lock_at: string | null
  }
  // The three columns `pickBestEntry` sorts on, plus the id. Both are NULL for
  // every league entry — which is exactly why the league branches replace what
  // they feed, not how the best entry is chosen: with all ranks null the tie
  // falls to the first entry, and a league member has one.
  pool_entries?: Array<{
    entry_id: string
    current_rank?: number | null
    scored_total_points?: number | null
  }> | null
}

export default async function PoolsPage() {
  const supabase = await createClient()

  // Auth check
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: userData } = await supabase
    .from('users')
    .select('user_id, username, full_name, is_super_admin')
    .eq('auth_user_id', user.id)
    .single()

  if (!userData) redirect('/login')

  // Fetch ALL user pools (past and present) with pool details and entries
  const { data: userPools } = await supabase
    .from('pool_members')
    .select(`
      member_id,
      role,
      joined_at,
      pools!inner(
        pool_id,
        pool_name,
        pool_code,
        description,
        status,
        archived_at,
        is_private,
        prediction_deadline,
        prediction_mode,
        tournament_id,
        league_mode,
        league_season_id,
        league_table_lock_at,
        created_at,
        brand_name,
        brand_emoji,
        brand_color,
        brand_accent,
        brand_landing_url,
        brand_logo_url
      ),
      pool_entries(
        entry_id,
        entry_name,
        entry_number,
        has_submitted_predictions,
        predictions_submitted_at,
        total_points,
        current_rank,
        match_points,
        bonus_points,
        scored_total_points
      )
    `)
    .eq('user_id', userData.user_id)
    .order('joined_at', { ascending: false })

  // Determine which pools have started scoring. Signal: any entry in the
  // pool has total_points > 0. This mirrors recalculatePool's gate at
  // lib/scoring/core.ts:222 (scores fire for live OR completed matches
  // with non-null _ft scores), so the card flips on at the same instant
  // the leaderboard does — including the first live-scored match, not
  // only after full-time.
  const poolIdsForScoring = Array.from(
    new Set((userPools ?? []).map((m: any) => m.pools.pool_id))
  )
  // Hoisted above the scoring gate below, which needs it: that gate reads
  // `league_entry_totals`, which is RLS-protected.
  const scoringAdmin = createAdminClient()
  const hasScoringByPool = new Map<string, boolean>()
  if (poolIdsForScoring.length > 0) {
    const { data: scoringRows } = await supabase
      .from('pool_entries')
      .select('pool_members!inner(pool_id)')
      .in('pool_members.pool_id', poolIdsForScoring)
      .gt('scored_total_points', 0)
    for (const row of (scoringRows ?? []) as Array<{ pool_members: { pool_id: string } | { pool_id: string }[] }>) {
      const pm = Array.isArray(row.pool_members) ? row.pool_members[0] : row.pool_members
      if (pm?.pool_id) hasScoringByPool.set(pm.pool_id, true)
    }
    // The same gate for a league, over the table a league is actually scored
    // into. Without this arm the gate is false for every league pool forever,
    // so the Rank tile rendered "—" even where league_entry_totals held a rank.
    //
    // ⚠ AND IT IS STILL A GATE, not a shortcut to `final_rank != null`. The
    // league engine ranks every entry from the moment the pool exists — a pool
    // with four entries and no fixture played yet has four rows, all on zero,
    // all ranked. "#1 of 4" before a ball is kicked is exactly what this
    // suppresses.
    const leaguePoolIds = ((userPools ?? []) as unknown as LeagueMembership[])
      .filter((m) => m.pools.prediction_mode === 'league_pickem')
      .map((m) => m.pools.pool_id)
    if (leaguePoolIds.length > 0) {
      // ⚠ ADMIN, NOT `supabase`. This one query used the request-scoped client
      // while every other read of `league_entry_totals` on this page uses the
      // admin one — and the table is RLS-protected, so it came back EMPTY. The
      // error was discarded too (`const { data }`), so nothing said so.
      //
      // The visible symptom was the Rank tile reading "—" on every league card
      // while `final_rank` sat in the table beside the points that DID render:
      // points came through the admin read, the rank was suppressed by this
      // gate. It is still a gate — total_points > 0 — so "#1 of 4" before a ball
      // is kicked stays suppressed, which is what the gate is for.
      const { data: leagueScored, error: leagueScoredErr } = await scoringAdmin
        .from('league_entry_totals')
        .select('pool_id')
        .in('pool_id', leaguePoolIds)
        .gt('total_points', 0)
      if (leagueScoredErr) console.error('league scoring gate:', leagueScoredErr.message)
      for (const row of (leagueScored ?? []) as Array<{ pool_id: string }>) {
        hasScoringByPool.set(row.pool_id, true)
      }
    }
  }

  // Per-entry XP level (the real XP system, same as the in-pool Form tab) so
  // cards can show the user's HIGHEST level across their entries. Batched into
  // one query keyed by entry_id. entry_xp_state is populated during scoring;
  // entries without a row default to level 1 (Rookie).
  //
  // League entries are excluded, not merely ignored downstream: neither table
  // below can ever hold a row for one, so including them is two `.in()` filters
  // carrying ids that are guaranteed to miss.
  const allEntryIds = ((userPools ?? []) as unknown as LeagueMembership[])
    .filter((m) => m.pools.prediction_mode !== 'league_pickem')
    .flatMap((m) => (m.pool_entries ?? []).map((e) => e.entry_id))
  const levelByEntry = new Map<string, number>()
  if (allEntryIds.length > 0) {
    const { data: xpRows } = await supabase
      .from('entry_xp_state')
      .select('entry_id, current_level')
      .in('entry_id', allEntryIds)
    for (const row of (xpRows ?? []) as Array<{ entry_id: string; current_level: number | null }>) {
      levelByEntry.set(row.entry_id, row.current_level ?? 1)
    }
  }

  // For entries WITHOUT a scored snapshot we compute the pre-tournament level
  // live (submission badges), which needs each entry's prediction count and the
  // tournament's match count. Only fetch counts for entries that need them.
  const entriesNeedingCount = allEntryIds.filter((id: string) => !levelByEntry.has(id))
  const predCountByEntry = new Map<string, number>()
  if (entriesNeedingCount.length > 0) {
    const { data: predRows } = await supabase
      .from('predictions')
      .select('entry_id')
      .in('entry_id', entriesNeedingCount)
    for (const row of (predRows ?? []) as Array<{ entry_id: string }>) {
      predCountByEntry.set(row.entry_id, (predCountByEntry.get(row.entry_id) ?? 0) + 1)
    }
  }
  // Serial, one query per tournament, and league tournaments are left out — a
  // league's fixtures are in `league_fixtures`, so this counts 0 for every one
  // of them and then feeds that 0 to a level calculation league pools no longer
  // show.
  const matchCountByTournament = new Map<string, number>()
  const tournamentIds = Array.from(
    new Set(
      ((userPools ?? []) as unknown as LeagueMembership[])
        .filter((m) => m.pools.prediction_mode !== 'league_pickem')
        .map((m) => m.pools.tournament_id)
        .filter(Boolean),
    )
  )
  for (const tid of tournamentIds) {
    const { count } = await supabase
      .from('matches')
      .select('*', { count: 'exact', head: true })
      .eq('tournament_id', tid)
    matchCountByTournament.set(tid as string, count ?? 0)
  }


  // The competition's colour key for the card stripe. `external_league_id` is
  // the api-football league id and is the SAME key CreatePoolModal already uses
  // to build a competition's crest URL, so the crest and the colour cannot
  // drift apart. One batched read for every tournament on the page.
  const leagueIdByTournament = new Map<string, number>()
  {
    const ids = Array.from(
      new Set(((userPools ?? []) as unknown as LeagueMembership[]).map((m) => m.pools.tournament_id).filter(Boolean)),
    ) as string[]
    if (ids.length > 0) {
      const { data: comps } = await supabase
        .from('tournaments')
        .select('tournament_id, external_league_id')
        .in('tournament_id', ids)
      for (const row of (comps ?? []) as Array<{ tournament_id: string; external_league_id: number | null }>) {
        if (row.external_league_id != null) leagueIdByTournament.set(row.tournament_id, row.external_league_id)
      }
    }
  }

  // Enrich pools with member counts and stored v2 scores
  // --- scoring source resolution (one pass, before the per-pool work) -------
  // These surfaces used to read match_scores / pool_entries.current_rank
  // directly, so they showed PROD's numbers even for pools whose leaderboard
  // had been cut over to shadow — same member, same score, two sources.
  //
  // The shadow_* tables are RLS deny-all (RLS on, zero policies), so they are
  // readable only by the service role. `supabase` above is the USER client and
  // would silently return zero rows. scoringAdmin is used ONLY to read scoring
  // for entry ids that came out of the RLS-checked membership query, so it
  // never widens what this user can see.
  const shadowPools = await getShadowReadPools(scoringAdmin)

  // ⚠ THE SOURCE IS THREE-VALUED, NOT TWO. This used to be
  // `shadowPools.has(pool_id) ? 'shadow' : 'prod'`, written out by hand here and
  // again on the dashboard, and it has no way to say 'league'. So every league
  // pool was read as a World Cup pool: points and rank came from
  // `pool_entries`, which is NULL for all 13 of them in production, while
  // `league_entry_totals` held the real numbers and ranks right beside it.
  //
  // `getScoringSource` is the function that answers this — it keys off the
  // mode, so a new league pool is correct the moment it exists. It is not used
  // directly only because it takes one pool at a time and would mean a query
  // per card; `getShadowReadPools` above is the batched half of it, and the
  // league half needs no query at all.
  const sourceFor = (pool: { pool_id: string; prediction_mode: string }): 'prod' | 'shadow' | 'league' =>
    pool.prediction_mode === 'league_pickem'
      ? 'league'
      : shadowPools.has(pool.pool_id)
        ? 'shadow'
        : 'prod'

  // Batch the scoring read: one call per source for every entry on the page,
  // rather than one per pool. Prod pools need neither — their values are
  // already on the pool_entries rows fetched above.
  const entryIdsBySource = { shadow: [] as string[], league: [] as string[] }
  for (const m of ((userPools ?? []) as unknown as LeagueMembership[])) {
    const source = sourceFor(m.pools)
    if (source === 'prod') continue
    for (const e of m.pool_entries ?? []) entryIdsBySource[source].push(e.entry_id)
  }
  const scoredByEntry = new Map<string, EntryScoring>()
  for (const source of ['shadow', 'league'] as const) {
    if (entryIdsBySource[source].length === 0) continue
    const read = await readEntryScoring(scoringAdmin, entryIdsBySource[source], source)
    for (const [k, v] of read) scoredByEntry.set(k, v)
  }

  // League facts the World Cup tables cannot answer: which matchweek is open,
  // when it locks, and whether this member has done it. See lib/league/poolCards.ts.
  const leagueFacts = await readLeagueCardFacts(
    scoringAdmin,
    ((userPools ?? []) as unknown as LeagueMembership[])
      .filter((m) => m.pools.prediction_mode === 'league_pickem')
      .map((m) => {
        const entries = m.pool_entries ?? []
        // The same "best" entry whose points, rank and form the card shows, so
        // the deadline and the action pill describe that entry too.
        return {
          poolId: m.pools.pool_id,
          seasonId: m.pools.league_season_id,
          leagueMode: m.pools.league_mode,
          tableLockAt: m.pools.league_table_lock_at,
          entryId: pickBestEntry(entries, scoredByEntry)?.entry_id ?? entries[0]?.entry_id ?? null,
        }
      }),
  )

  const pools = await Promise.all(
    (userPools ?? []).map(async (m: any) => {
      const pool = m.pools

      // Get member count
      const { count: memberCount } = await supabase
        .from('pool_members')
        .select('*', { count: 'exact', head: true })
        .eq('pool_id', pool.pool_id)

      // Get total entries count — denominator for the "Rank X of Y" KPI on
      // the card (pools can have multi-entry members, so entry count is
      // the correct basis for a leaderboard position). pool_entries has
      // no pool_id; join via pool_members to filter.
      const { count: totalEntries } = await supabase
        .from('pool_entries')
        .select('entry_id, pool_members!inner(pool_id)', { count: 'exact', head: true })
        .eq('pool_members.pool_id', pool.pool_id)

      // Get entries for this member
      const entries = ((m as any).pool_entries || []) as any[]
      // "Best" = lowest leaderboard rank, so the card's rank, points, and
      // form dots all describe the same entry.
      // `scoredByEntry` is passed because a shadow or league pool's ranks are
      // NOT on `pool_entries` — without it this picks an arbitrary entry and the
      // card shows one entry's points under another's rank.
      const bestEntry = pickBestEntry(entries, scoredByEntry)
      const defaultEntry = bestEntry || entries[0]
      const defaultEntryId = defaultEntry?.entry_id

      // For progressive pools, determine prediction status from round submissions
      // (pool_entries.has_submitted_predictions is not set by round submission flow)
      let anySubmitted = entries.some((e: any) => e.has_submitted_predictions)
      let currentRoundLabel: string | null = null
      if (pool.prediction_mode === 'progressive' && defaultEntryId) {
        const [{ data: roundStates }, { data: roundSubs }] = await Promise.all([
          supabase
            .from('pool_round_states')
            .select('round_key, state')
            .eq('pool_id', pool.pool_id),
          supabase
            .from('entry_round_submissions')
            .select('round_key, has_submitted')
            .eq('entry_id', defaultEntryId),
        ])
        const submittedRounds = new Set(
          (roundSubs ?? []).filter((s: any) => s.has_submitted).map((s: any) => s.round_key)
        )
        const openRounds = (roundStates ?? [])
          .filter((r: any) => r.state === 'open')
          .map((r: any) => r.round_key as string)
        const unsubmittedOpenRounds = openRounds.filter(rk => !submittedRounds.has(rk))

        if (unsubmittedOpenRounds.length > 0) {
          // There's an open round that needs predictions
          anySubmitted = false
          const { ROUND_LABELS } = await import('@/lib/tournament')
          currentRoundLabel = roundLabel(unsubmittedOpenRounds[0])
        } else if (submittedRounds.size > 0) {
          // All open rounds are submitted (or no rounds are open) — user is all set
          anySubmitted = true
        }
      }

      // Read stored v2 scores instead of computing on-the-fly. For a
      // shadow-enabled pool these come from shadow_entry_totals; the fallback
      // keeps prod's pool_entries values byte-identical when the flag is off.
      const scoring = defaultEntryId ? scoredByEntry.get(defaultEntryId) : undefined
      const matchPoints = scoring?.match_points ?? defaultEntry?.match_points ?? 0
      const bonusPoints = scoring?.bonus_points ?? defaultEntry?.bonus_points ?? 0

      // Form dots + points/rank must come from the SAME source the pool's
      // leaderboard uses, or a member sees one score here and another in the
      // pool. Shadow tables are RLS deny-all (0 policies) so they are readable
      // only by the service role — hence scoringAdmin, scoped to entries this
      // user already proved access to via the RLS'd query above.
      const source = sourceFor(pool)

      let form: string[] = []
      if (defaultEntryId) {
        form = await readRecentForm(scoringAdmin, defaultEntryId, source, 5)
      }

      // League pools answer the deadline and the action pill from their own
      // rhythm, not from the World Cup columns. `prediction_deadline` on a
      // league pool is the season end and `has_submitted_predictions` is NULL
      // by design — see lib/league/poolCards.ts.
      const league = leagueFacts.get(pool.pool_id)

      return {
        ...pool,
        role: m.role,
        match_points: matchPoints,
        bonus_points: bonusPoints,
        total_points: matchPoints + bonusPoints,
        // Best (lowest) rank across all of this user's entries — the card
        // shows the user's best leaderboard position, and points/form above
        // come from this same entry (bestEntry = lowest rank by construction).
        current_rank: scoring?.current_rank ?? defaultEntry?.current_rank ?? null,
        // Highest XP level across all of this user's entries — matches the
        // in-pool Form tab (scored snapshot if present, else live pre-tournament
        // submission-badge level). Defaults to 1.
        //
        // ⚠ NULL for a league pool, and the card shows the matchweek in its
        // place. XP is World Cup machinery end to end: `entry_xp_state` is
        // written by World Cup scoring and `computePreTournamentLevel` counts
        // rows in `predictions`. Both are empty for a league entry, so this
        // returned 1 for everyone — and there is no in-pool Analytics tab on a
        // league pool to check it against, because none of it applies.
        highest_level: league ? null : (() => {
          const totalMatches = matchCountByTournament.get(pool.tournament_id) ?? 0
          const levels = entries.map((e: any) =>
            resolveEntryLevel({
              snapshotLevel: levelByEntry.get(e.entry_id) ?? null,
              predictionCount: predCountByEntry.get(e.entry_id) ?? 0,
              totalMatches,
            })
          )
          return levels.length > 0 ? Math.max(...levels) : 1
        })(),
        has_submitted_predictions: league ? league.hasSubmitted : anySubmitted,
        joined_at: m.joined_at,
        memberCount: memberCount ?? 0,
        totalEntries: totalEntries ?? 0,
        hasScoringStarted: hasScoringByPool.get(pool.pool_id) ?? false,
        // ⚠ THE UNIT IS THE OPEN MATCHWEEK FOR A LEAGUE, not the season. These
        // feed the action pill's "6 of 10 picked". Over 380 fixtures "12 of
        // 380" would be true and useless — the weekly question is the one a
        // member is actually asking. Same pair, same reasoning, as
        // app/dashboard/page.tsx.
        totalMatches: league ? league.totalPicks : (matchCountByTournament.get(pool.tournament_id) ?? 0),
        predictedMatches: league
          ? league.madePicks
          : (defaultEntryId ? (predCountByEntry.get(defaultEntryId) ?? 0) : 0),
        form,
        currentRoundLabel,
        // The card's clock. A league's next decision is this matchweek's lock
        // (or, in Table mode, the one-off table lock) — never the season end
        // sitting in `prediction_deadline`.
        prediction_deadline: league ? league.deadlineAt : pool.prediction_deadline,
        externalLeagueId: leagueIdByTournament.get(pool.tournament_id) ?? null,
        openMatchweekNumber: league?.openMatchweekNumber ?? null,
        inPlayMatchweekNumber: league?.inPlayMatchweekNumber ?? null,
        matchweekCount: league?.matchweekCount ?? null,
        // Showdown's four tiles. NULL for every other mode.
        showdown: league?.showdown ?? null,
        lms: league?.lms ?? null,
        table: league?.table ?? null,
      }
    })
  )

  // Archived pools (migration 040) are excluded from this list entirely and
  // from every stat on it. They live under Profile → Archived, read-only, and
  // come back here the moment an admin restores them.
  const visiblePools = pools.filter(p => !p.archived_at)

  // Stats for hero
  const totalPools = visiblePools.length
  const activePools = visiblePools.filter(p => p.status === 'open').length
  const totalPoints = visiblePools.reduce((sum: number, p: any) => sum + (p.total_points ?? 0), 0)

  return (
    <PoolsClient
      user={userData}
      pools={visiblePools}
      stats={{ totalPools, activePools, totalPoints }}
    />
  )
}
