import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
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
      .gt('total_points', 0)
    for (const row of (scoringRows ?? []) as Array<{ pool_members: { pool_id: string } | { pool_id: string }[] }>) {
      const pm = Array.isArray(row.pool_members) ? row.pool_members[0] : row.pool_members
      if (pm?.pool_id) hasScoringByPool.set(pm.pool_id, true)
    }
  }

  // Enrich pools with member counts and stored v2 scores
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

      return {
        ...pool,
        role: m.role,
        match_points: matchPoints,
        bonus_points: bonusPoints,
        total_points: matchPoints + bonusPoints,
        // Best (lowest) rank across all of this user's entries in the pool.
        current_rank: (() => {
          const ranks = entries
            .map((e: any) => e.current_rank)
            .filter((r: number | null | undefined): r is number => r != null)
          return ranks.length > 0 ? Math.min(...ranks) : null
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

  // Stats for hero
  const totalPools = pools.length
  const activePools = pools.filter((p: any) => p.status === 'open' || p.status === 'active').length
  const totalPoints = pools.reduce((sum: number, p: any) => sum + (p.total_points ?? 0), 0)

  return (
    <PoolsClient
      user={userData}
      pools={pools}
      stats={{ totalPools, activePools, totalPoints }}
    />
  )
}
