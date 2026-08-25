import { roundLabel } from '@/lib/competitionRounds'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getShadowReadPools, readEntryScoring, readRecentForm } from '@/lib/scoring/readSource'
import { redirect } from 'next/navigation'
import { resolveEntryLevel } from '@/lib/entryLevel'
import { pickBestEntry } from '@/lib/bestEntry'
import { PoolsClient } from './PoolsClient'

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
  }

  // Per-entry XP level (the real XP system, same as the in-pool Form tab) so
  // cards can show the user's HIGHEST level across their entries. Batched into
  // one query keyed by entry_id. entry_xp_state is populated during scoring;
  // entries without a row default to level 1 (Rookie).
  const allEntryIds = (userPools ?? []).flatMap((m: any) =>
    ((m.pool_entries || []) as any[]).map((e: any) => e.entry_id)
  )
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
  const matchCountByTournament = new Map<string, number>()
  const tournamentIds = Array.from(
    new Set((userPools ?? []).map((m: any) => m.pools.tournament_id).filter(Boolean))
  )
  for (const tid of tournamentIds) {
    const { count } = await supabase
      .from('matches')
      .select('*', { count: 'exact', head: true })
      .eq('tournament_id', tid)
    matchCountByTournament.set(tid as string, count ?? 0)
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
  const scoringAdmin = createAdminClient()
  const shadowPools = await getShadowReadPools(scoringAdmin)

  // Batch the scoring read: one call for every entry on the page, rather than
  // one per pool. Only entries in shadow-enabled pools need it — prod values
  // are already on the pool_entries rows fetched above.
  const shadowEntryIds = (userPools ?? []).flatMap((m: any) =>
    shadowPools.has(m.pools?.pool_id)
      ? ((m.pool_entries || []) as any[]).map((e) => e.entry_id)
      : [],
  )
  const scoredByEntry = shadowEntryIds.length > 0
    ? await readEntryScoring(scoringAdmin, shadowEntryIds, 'shadow')
    : new Map()

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
      const bestEntry = pickBestEntry(entries)
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
      const source = shadowPools.has(pool.pool_id) ? 'shadow' as const : 'prod' as const

      let form: string[] = []
      if (defaultEntryId) {
        form = await readRecentForm(scoringAdmin, defaultEntryId, source, 5)
      }

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
        highest_level: (() => {
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
        has_submitted_predictions: anySubmitted,
        joined_at: m.joined_at,
        memberCount: memberCount ?? 0,
        totalEntries: totalEntries ?? 0,
        hasScoringStarted: hasScoringByPool.get(pool.pool_id) ?? false,
        form,
        currentRoundLabel,
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
