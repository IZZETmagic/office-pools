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
        brand_landing_url
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

  // Enrich pools with member counts and stored v2 scores
  const pools = await Promise.all(
    (userPools ?? []).map(async (m: any) => {
      const pool = m.pools

      // Get member count
      const { count: memberCount } = await supabase
        .from('pool_members')
        .select('*', { count: 'exact', head: true })
        .eq('pool_id', pool.pool_id)

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
        current_rank: bestEntry?.current_rank ?? null,
        has_submitted_predictions: anySubmitted,
        joined_at: m.joined_at,
        memberCount: memberCount ?? 0,
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
