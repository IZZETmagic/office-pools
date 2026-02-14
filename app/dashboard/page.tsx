import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Card } from '@/components/ui/Card'
import { Badge, getStatusVariant } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { calculatePoints, DEFAULT_POOL_SETTINGS, type PoolSettings } from '@/app/pools/[pool_id]/results/points'

export default async function DashboardPage() {
  const supabase = await createClient()

  // STEP 1: Get authenticated user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // STEP 2: Look up user_id from users table using auth_user_id
  const { data: userData } = await supabase
    .from('users')
    .select('user_id, username, full_name')
    .eq('auth_user_id', user.id)
    .single()

  if (!userData) redirect('/login')

  // STEP 3: Fetch user's pools via pool_members
  const { data: userPools } = await supabase
    .from('pool_members')
    .select(`
      member_id,
      role,
      total_points,
      current_rank,
      has_submitted_predictions,
      joined_at,
      pools!inner(
        pool_id,
        pool_name,
        pool_code,
        description,
        status,
        prediction_deadline,
        tournament_id
      )
    `)
    .eq('user_id', userData.user_id)
    .order('joined_at', { ascending: false })

  // STEP 4: Fetch upcoming matches (next 5 unplayed matches)
  const { data: upcomingMatches } = await supabase
    .from('matches')
    .select(`
      match_id,
      match_number,
      stage,
      match_date,
      status,
      home_team:teams!matches_home_team_id_fkey(country_name),
      away_team:teams!matches_away_team_id_fkey(country_name),
      home_team_placeholder,
      away_team_placeholder
    `)
    .in('status', ['scheduled', 'upcoming'])
    .order('match_date', { ascending: true })
    .limit(5)

  // STEP 5: Calculate actual points for each pool (same approach as pools page)
  const pools = await Promise.all(
    (userPools ?? []).map(async (m: any) => {
      const pool = m.pools

      // Get completed matches with scores
      const { data: completedMatches } = await supabase
        .from('matches')
        .select('match_id, stage, home_score_ft, away_score_ft')
        .eq('tournament_id', pool.tournament_id)
        .eq('status', 'completed')
        .not('home_score_ft', 'is', null)
        .not('away_score_ft', 'is', null)

      // Get user's predictions for this pool
      const { data: predictions } = await supabase
        .from('predictions')
        .select('match_id, predicted_home_score, predicted_away_score')
        .eq('member_id', m.member_id)

      // Get pool settings
      const { data: rawPoolSettings } = await supabase
        .from('pool_settings')
        .select('*')
        .eq('pool_id', pool.pool_id)
        .single()

      const poolSettings: PoolSettings = rawPoolSettings
        ? { ...DEFAULT_POOL_SETTINGS, ...rawPoolSettings }
        : DEFAULT_POOL_SETTINGS

      // Build prediction lookup and calculate points
      const predictionMap = new Map(
        (predictions ?? []).map((p: any) => [p.match_id, p])
      )

      let calculatedPoints = 0
      for (const match of (completedMatches ?? [])) {
        const pred = predictionMap.get(match.match_id)
        if (pred) {
          const result = calculatePoints(
            pred.predicted_home_score,
            pred.predicted_away_score,
            match.home_score_ft,
            match.away_score_ft,
            match.stage,
            poolSettings
          )
          calculatedPoints += result.points
        }
      }

      return {
        ...pool,
        role: m.role,
        total_points: calculatedPoints,
        current_rank: m.current_rank,
        has_submitted_predictions: m.has_submitted_predictions,
        joined_at: m.joined_at,
      }
    })
  )

  // Calculate stats
  const totalPools = pools.length
  const totalPoints = pools.reduce((sum: number, p: any) => sum + (p.total_points ?? 0), 0)
  const bestRank = pools
    .filter((p: any) => p.current_rank != null)
    .reduce((best: number | null, p: any) => {
      if (best === null) return p.current_rank
      return p.current_rank < best ? p.current_rank : best
    }, null as number | null)

  // Build activity feed from join dates and prediction status
  const activities = pools
    .map((p: any) => ({
      type: 'joined' as const,
      poolName: p.pool_name,
      poolId: p.pool_id,
      date: p.joined_at,
      hasPredictions: p.has_submitted_predictions,
    }))
    .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5)

  const matches = upcomingMatches ?? []

  // Format helpers
  function formatDate(dateStr: string) {
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  function formatDateTime(dateStr: string) {
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  function formatStage(stage: string) {
    const map: Record<string, string> = {
      group: 'Group Stage',
      round_32: 'Round of 32',
      round_16: 'Round of 16',
      quarter_final: 'Quarter Final',
      semi_final: 'Semi Final',
      finals: 'Final',
    }
    return map[stage] ?? stage
  }

  function timeAgo(dateStr: string) {
    const now = new Date()
    const then = new Date(dateStr)
    const diffMs = now.getTime() - then.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 30) return `${diffDays}d ago`
    return formatDate(dateStr)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation bar */}
      <nav className="bg-white shadow-sm px-6 py-4 flex justify-between items-center">
        <Link href="/dashboard" className="text-xl font-bold text-gray-900">
          ⚽ World Cup Pool
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/profile" className="text-sm text-gray-600 hover:text-gray-900 font-medium">
            My Profile
          </Link>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="text-sm text-gray-600 hover:text-gray-900 font-medium"
            >
              Sign Out
            </button>
          </form>
        </div>
      </nav>

      {/* Main content */}
      <main className="max-w-6xl mx-auto px-6 py-10">

        {/* Welcome header */}
        <h2 className="text-3xl font-bold text-gray-900 mb-1">
          Welcome, {userData.full_name || userData.username || 'Player'}!
        </h2>
        <p className="text-gray-500 mb-8">Your World Cup Pool Dashboard</p>

        {/* Quick stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card>
            <p className="text-sm text-gray-500 mb-1">Total Pools</p>
            <p className="text-3xl font-bold text-blue-600">{totalPools}</p>
          </Card>
          <Card>
            <p className="text-sm text-gray-500 mb-1">Total Points</p>
            <p className="text-3xl font-bold text-green-600">{totalPoints}</p>
          </Card>
          <Card>
            <p className="text-sm text-gray-500 mb-1">Best Rank</p>
            <p className="text-3xl font-bold text-purple-600">
              {bestRank ? `#${bestRank}` : '--'}
            </p>
          </Card>
        </div>

        {/* My Pools section */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-gray-900">My Pools</h3>
            <Button href="/pools" variant="outline" size="sm">
              Manage Pools
            </Button>
          </div>

          {pools.length === 0 ? (
            <Card padding="lg" className="text-center">
              <p className="text-gray-500 text-lg mb-2">You haven&apos;t joined any pools yet.</p>
              <p className="text-gray-400 mb-4">Join or create a pool to get started.</p>
              <Button href="/pools" variant="green">Go to Pools</Button>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {pools.map((pool: any) => (
                <Card key={pool.pool_id}>
                  <div className="flex items-start justify-between mb-3">
                    <h4 className="font-semibold text-gray-900 truncate mr-2">{pool.pool_name}</h4>
                    <div className="flex gap-1 shrink-0">
                      {pool.role === 'admin' && <Badge variant="blue">Admin</Badge>}
                      <Badge variant={getStatusVariant(pool.status)}>{pool.status}</Badge>
                    </div>
                  </div>

                  {pool.description && (
                    <p className="text-sm text-gray-500 mb-3 line-clamp-2">{pool.description}</p>
                  )}

                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <span className="text-2xl font-bold text-blue-600">{pool.total_points ?? 0}</span>
                      <span className="text-xs text-gray-400 ml-1">pts</span>
                    </div>
                    {pool.current_rank && (
                      <span className="text-sm text-gray-600">Rank #{pool.current_rank}</span>
                    )}
                  </div>

                  {!pool.has_submitted_predictions && (
                    <p className="text-xs text-amber-600 mb-3">
                      Predictions not yet submitted
                    </p>
                  )}

                  <div className="flex gap-2">
                    <Button href={`/pools/${pool.pool_id}/predictions`} variant="green" size="sm" fullWidth>
                      Predictions
                    </Button>
                    <Button href={`/pools/${pool.pool_id}/leaderboard`} size="sm" fullWidth>
                      Leaderboard
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Two column layout: Upcoming matches + Activity feed */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

          {/* Upcoming matches - 3/5 width */}
          <div className="lg:col-span-3">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Upcoming Matches</h3>
            {matches.length === 0 ? (
              <Card>
                <p className="text-gray-500">No upcoming matches scheduled.</p>
              </Card>
            ) : (
              <div className="space-y-3">
                {matches.map((match: any) => {
                  const homeTeam = match.home_team?.country_name ?? match.home_team_placeholder ?? 'TBD'
                  const awayTeam = match.away_team?.country_name ?? match.away_team_placeholder ?? 'TBD'
                  return (
                    <Card key={match.match_id} className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-gray-900">
                          {homeTeam} vs {awayTeam}
                        </p>
                        <p className="text-xs text-gray-400">
                          {formatStage(match.stage)} &middot; Match #{match.match_number}
                        </p>
                      </div>
                      <div className="text-right shrink-0 ml-4">
                        <p className="text-sm font-medium text-gray-700">
                          {match.match_date ? formatDateTime(match.match_date) : 'TBD'}
                        </p>
                        <Badge variant="gray">{match.status}</Badge>
                      </div>
                    </Card>
                  )
                })}
              </div>
            )}
          </div>

          {/* Recent activity - 2/5 width */}
          <div className="lg:col-span-2">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Recent Activity</h3>
            {activities.length === 0 ? (
              <Card>
                <p className="text-gray-500">No recent activity.</p>
              </Card>
            ) : (
              <Card>
                <ul className="divide-y divide-gray-100">
                  {activities.map((activity: any, idx: number) => (
                    <li key={idx} className="py-3 first:pt-0 last:pb-0">
                      <p className="text-sm text-gray-900">
                        Joined <Link href={`/pools/${activity.poolId}/leaderboard`} className="font-medium text-blue-600 hover:underline">{activity.poolName}</Link>
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-gray-400">{timeAgo(activity.date)}</span>
                        {!activity.hasPredictions && (
                          <Badge variant="yellow">Needs predictions</Badge>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
