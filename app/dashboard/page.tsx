import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DashboardClient } from './DashboardClient'
import type { MatchWithResult } from '@/lib/bonusCalculation'
import type { Team, MatchConductData } from '@/lib/tournament'

export default async function DashboardPage() {
  const supabase = await createClient()

  // STEP 1: Get authenticated user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // STEP 2: Look up user_id from users table
  const { data: userData } = await supabase
    .from('users')
    .select('user_id, username, full_name, is_super_admin')
    .eq('auth_user_id', user.id)
    .single()

  if (!userData) redirect('/login')

  // STEP 3: Fetch user's pools via pool_members (with entries)
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
        prediction_deadline,
        tournament_id,
        prediction_mode,
        brand_name,
        brand_emoji,
        brand_color,
        brand_accent,
        brand_logo_url
      ),
      pool_entries(
        entry_id,
        entry_name,
        entry_number,
        has_submitted_predictions,
        predictions_submitted_at,
        predictions_last_saved_at,
        auto_submitted,
        created_at,
        total_points,
        current_rank,
        previous_rank,
        last_rank_update,
        match_points,
        bonus_points,
        scored_total_points,
        point_adjustment
      )
    `)
    .eq('user_id', userData.user_id)
    .order('joined_at', { ascending: false })

  // STEP 4a: Fetch live matches — only from tournaments the user has pools in
  // Collect unique tournament IDs from user's pools
  const userTournamentIds = [...new Set((userPools ?? []).map((m: any) => m.pools.tournament_id))]

  let liveMatches: any[] | null = null
  if (userTournamentIds.length > 0) {
    const { data } = await supabase
      .from('matches')
      .select(`
        match_id,
        match_number,
        stage,
        match_date,
        status,
        home_score_ft,
        away_score_ft,
        home_team:teams!matches_home_team_id_fkey(country_name, flag_url),
        away_team:teams!matches_away_team_id_fkey(country_name, flag_url),
        home_team_placeholder,
        away_team_placeholder
      `)
      .eq('status', 'live')
      .in('tournament_id', userTournamentIds)
      .order('match_date', { ascending: true })
    liveMatches = data
  }

  // STEP 4b: Fetch upcoming matches — only from tournaments the user has pools in
  let upcomingMatches: any[] | null = null
  if (userTournamentIds.length > 0) {
    const { data } = await supabase
      .from('matches')
      .select(`
        match_id,
        match_number,
        stage,
        match_date,
        status,
        venue,
        home_team:teams!matches_home_team_id_fkey(country_name, country_code, flag_url),
        away_team:teams!matches_away_team_id_fkey(country_name, country_code, flag_url),
        home_team_placeholder,
        away_team_placeholder
      `)
      .in('status', ['scheduled', 'upcoming'])
      .in('tournament_id', userTournamentIds)
      .order('match_date', { ascending: true })
      .limit(5)
    upcomingMatches = data
  }

  // Normalize team data (Supabase may return arrays for FK joins)
  const normalizedLiveMatches = (liveMatches ?? []).map((m: any) => ({
    ...m,
    home_team: Array.isArray(m.home_team) ? m.home_team[0] ?? null : m.home_team,
    away_team: Array.isArray(m.away_team) ? m.away_team[0] ?? null : m.away_team,
  }))

  const normalizedUpcomingMatches = (upcomingMatches ?? []).map((m: any) => ({
    ...m,
    home_team: Array.isArray(m.home_team) ? m.home_team[0] ?? null : m.home_team,
    away_team: Array.isArray(m.away_team) ? m.away_team[0] ?? null : m.away_team,
  }))

  // STEP 4c: Fetch shared data needed for bonus calculation (teams, conduct)
  const [{ data: allTeams }, { data: conductRes }] = await Promise.all([
    supabase
      .from('teams')
      .select('team_id, country_name, country_code, group_letter, fifa_ranking_points, flag_url')
      .order('group_letter', { ascending: true })
      .order('fifa_ranking_points', { ascending: false }),
    supabase
      .from('match_conduct')
      .select('match_id, team_id, yellow_cards, indirect_red_cards, direct_red_cards, yellow_direct_red_cards'),
  ])

  const teams: Team[] = (allTeams ?? []).map((t: any) => ({
    ...t,
    group_letter: t.group_letter?.trim() || '',
    country_code: t.country_code?.trim() || '',
  }))

  const conductData: MatchConductData[] = (conductRes ?? []) as MatchConductData[]

  // STEP 5: Enrich each pool with calculated points (match + bonus), member count, match counts
  const pools = await Promise.all(
    (userPools ?? []).map(async (m: any) => {
      const pool = m.pools

      // Get member count
      const { count: memberCount } = await supabase
        .from('pool_members')
        .select('*', { count: 'exact', head: true })
        .eq('pool_id', pool.pool_id)

      // Get total matches count
      const { count: totalMatchesCount } = await supabase
        .from('matches')
        .select('*', { count: 'exact', head: true })
        .eq('tournament_id', pool.tournament_id)

      // Get ALL matches for this tournament (needed for bonus calculation)
      const { data: allMatches } = await supabase
        .from('matches')
        .select('*, home_team:teams!matches_home_team_id_fkey(country_name, flag_url), away_team:teams!matches_away_team_id_fkey(country_name, flag_url)')
        .eq('tournament_id', pool.tournament_id)
        .order('match_number', { ascending: true })

      // Normalize match join results
      const normalizedMatches: MatchWithResult[] = (allMatches ?? []).map((match: any) => ({
        ...match,
        home_team: Array.isArray(match.home_team) ? match.home_team[0] ?? null : match.home_team,
        away_team: Array.isArray(match.away_team) ? match.away_team[0] ?? null : match.away_team,
      }))

      // Get entries for this member
      const entries = ((m as any).pool_entries || []) as any[]
      const bestEntry = entries.length > 0
        ? entries.reduce((best: any, e: any) => (e.total_points > best.total_points ? e : best), entries[0])
        : null
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
          currentRoundLabel = ROUND_LABELS[unsubmittedOpenRounds[0] as keyof typeof ROUND_LABELS] ?? unsubmittedOpenRounds[0]
        } else if (submittedRounds.size > 0) {
          // All open rounds are submitted (or no rounds are open) — user is all set
          anySubmitted = true
        }
      }

      // Read stored v2 scores instead of computing on-the-fly
      const matchPoints = defaultEntry?.match_points ?? 0
      const bonusPoints = defaultEntry?.bonus_points ?? 0

      // Fetch last 5 match results from match_scores for form display
      let form: string[] = []
      if (defaultEntryId) {
        const { data: recentScores } = await supabase
          .from('match_scores')
          .select('score_type, match_number')
          .eq('entry_id', defaultEntryId)
          .order('match_number', { ascending: false })
          .limit(5)

        form = (recentScores ?? [])
          .reverse()
          .map((s: any) => s.score_type)
      }

      // Build per-entry progress (prediction counts for each entry)
      const entryIds = entries.map((e: any) => e.entry_id)
      let entryPredCounts: Record<string, number> = {}
      if (entryIds.length > 0) {
        const { data: entryPreds } = await supabase
          .from('predictions')
          .select('entry_id')
          .in('entry_id', entryIds)
        if (entryPreds) {
          for (const p of entryPreds) {
            entryPredCounts[p.entry_id] = (entryPredCounts[p.entry_id] || 0) + 1
          }
        }
      }

      const entriesProgress = entries.map((e: any) => ({
        entry_id: e.entry_id,
        entry_name: e.entry_name,
        predictedMatches: entryPredCounts[e.entry_id] || 0,
        has_submitted: e.has_submitted_predictions || false,
      }))

      const adjustment = bestEntry?.point_adjustment ?? 0

      return {
        ...pool,
        role: m.role,
        match_points: matchPoints,
        bonus_points: bonusPoints,
        total_points: matchPoints + bonusPoints + adjustment,
        current_rank: bestEntry?.current_rank ?? null,
        has_submitted_predictions: anySubmitted,
        predictions_submitted_at: bestEntry?.predictions_submitted_at ?? null,
        predictions_last_saved_at: bestEntry?.predictions_last_saved_at ?? null,
        joined_at: m.joined_at,
        memberCount: memberCount ?? 0,
        totalMatches: totalMatchesCount ?? 0,
        completedMatches: normalizedMatches.filter((m: any) => m.is_completed).length,
        predictedMatches: entryPredCounts[defaultEntryId] || 0,
        entries: entriesProgress,
        form,
        currentRoundLabel,
      }
    })
  )

  // Filter to only active pools for dashboard display
  const activePools = pools.filter((p: any) => p.status === 'open' || p.status === 'active')

  // Calculate stats from active pools
  const totalPools = activePools.length
  const totalPoints = activePools.reduce((sum: number, p: any) => sum + (p.total_points ?? 0), 0)
  const bestRank = activePools
    .filter((p: any) => p.current_rank != null)
    .reduce((best: number | null, p: any) => {
      if (best === null) return p.current_rank
      return p.current_rank < best ? p.current_rank : best
    }, null as number | null)

  // Build activity feed from multiple sources (from all pools, not just active)
  const allActivities: any[] = []
  for (const m of (userPools ?? [])) {
    const pool = (m as any).pools
    const poolName = pool.pool_name
    const poolId = pool.pool_id
    const entries = ((m as any).pool_entries || []) as any[]

    // 1. JOINED event
    allActivities.push({
      type: 'joined' as const,
      poolName,
      poolId,
      date: m.joined_at,
      hasPredictions: entries.some((e: any) => e.has_submitted_predictions),
    })

    // 2. SUBMITTED / AUTO_SUBMITTED events (per entry)
    for (const entry of entries) {
      if (entry.predictions_submitted_at) {
        if (entry.auto_submitted) {
          allActivities.push({
            type: 'auto_submitted' as const,
            poolName,
            poolId,
            date: entry.predictions_submitted_at,
            entryName: entry.entry_name,
          })
        } else {
          allActivities.push({
            type: 'submitted' as const,
            poolName,
            poolId,
            date: entry.predictions_submitted_at,
            entryName: entry.entry_name,
          })
        }
      }
    }

    // 3. ENTRY_CREATED events (only additional entries, not the auto-created first one)
    for (const entry of entries) {
      if (entry.entry_number > 1 && entry.created_at) {
        allActivities.push({
          type: 'entry_created' as const,
          poolName,
          poolId,
          date: entry.created_at,
          entryName: entry.entry_name,
        })
      }
    }

    // 4. DEADLINE_PASSED event (only if deadline is in the past)
    if (pool.prediction_deadline) {
      const deadlineDate = new Date(pool.prediction_deadline)
      if (deadlineDate < new Date()) {
        allActivities.push({
          type: 'deadline_passed' as const,
          poolName,
          poolId,
          date: pool.prediction_deadline,
        })
      }
    }

    // 5. RANK MOVEMENT events (per entry with rank change)
    for (const entry of entries) {
      if (
        entry.current_rank !== null &&
        entry.previous_rank !== null &&
        entry.last_rank_update &&
        entry.current_rank !== entry.previous_rank
      ) {
        const delta = entry.previous_rank - entry.current_rank
        if (delta > 0) {
          allActivities.push({
            type: 'rank_up' as const,
            poolName,
            poolId,
            date: entry.last_rank_update,
            rankDelta: delta,
            newRank: entry.current_rank,
            entryName: entry.entry_name,
          })
        } else {
          allActivities.push({
            type: 'rank_down' as const,
            poolName,
            poolId,
            date: entry.last_rank_update,
            rankDelta: Math.abs(delta),
            newRank: entry.current_rank,
            entryName: entry.entry_name,
          })
        }
      }
    }
  }

  // 6. MENTIONED events — messages where current user is @mentioned
  const poolIds = (userPools ?? []).map((m: any) => m.pools.pool_id)
  if (poolIds.length > 0) {
    const { data: mentionMessages } = await supabase
      .from('pool_messages')
      .select('message_id, pool_id, user_id, created_at')
      .contains('mentions', [userData.user_id])
      .in('pool_id', poolIds)
      .order('created_at', { ascending: false })
      .limit(20)

    if (mentionMessages && mentionMessages.length > 0) {
      const mentionerIds = [...new Set(mentionMessages.map((m: any) => m.user_id))]
      const { data: mentioners } = await supabase
        .from('users')
        .select('user_id, username')
        .in('user_id', mentionerIds)

      const mentionerMap = new Map(
        (mentioners ?? []).map((u: any) => [u.user_id, u.username])
      )

      for (const msg of mentionMessages) {
        const pool = (userPools ?? []).find((p: any) => p.pools.pool_id === msg.pool_id)
        if (pool) {
          allActivities.push({
            type: 'mentioned' as const,
            poolName: (pool as any).pools.pool_name,
            poolId: msg.pool_id,
            date: msg.created_at,
            mentionedBy: mentionerMap.get(msg.user_id) ?? 'someone',
          })
        }
      }
    }
  }

  // 7. POINTS_ADJUSTED events — admin point adjustments on user's entries
  const allEntryIds = (userPools ?? []).flatMap((m: any) =>
    ((m as any).pool_entries || []).map((e: any) => e.entry_id)
  )
  if (allEntryIds.length > 0) {
    const { data: adjustments } = await supabase
      .from('point_adjustments')
      .select('id, entry_id, pool_id, amount, reason, created_at')
      .in('entry_id', allEntryIds)
      .order('created_at', { ascending: false })
      .limit(20)

    for (const adj of adjustments ?? []) {
      const pool = (userPools ?? []).find((p: any) => p.pools.pool_id === adj.pool_id)
      if (pool) {
        allActivities.push({
          type: 'points_adjusted' as const,
          poolName: (pool as any).pools.pool_name,
          poolId: adj.pool_id,
          date: adj.created_at,
          adjustment: adj.amount,
          reason: adj.reason,
        })
      }
    }
  }

  const activities = allActivities
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 15)

  return (
    <DashboardClient
      user={userData}
      pools={activePools}
      liveMatches={normalizedLiveMatches}
      upcomingMatches={normalizedUpcomingMatches}
      activities={activities}
      totalPools={totalPools}
      totalPoints={totalPoints}
      bestRank={bestRank}
    />
  )
}
