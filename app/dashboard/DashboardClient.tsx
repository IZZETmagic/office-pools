'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/Card'
import { Badge, getStatusVariant } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { Input } from '@/components/ui/Input'
import { FormField } from '@/components/ui/FormField'

// =====================
// TYPES
// =====================
type PoolCardData = {
  pool_id: string
  pool_name: string
  pool_code: string
  description: string | null
  status: string
  prediction_deadline: string | null
  tournament_id: string
  role: string
  match_points: number
  bonus_points: number
  total_points: number
  current_rank: number | null
  has_submitted_predictions: boolean
  predictions_submitted_at: string | null
  predictions_last_saved_at: string | null
  joined_at: string
  memberCount: number
  totalMatches: number
  completedMatches: number
  predictedMatches: number
}

type ActivityItem = {
  type: 'joined'
  poolName: string
  poolId: string
  date: string
  hasPredictions: boolean
}

type UpcomingMatch = {
  match_id: string
  match_number: number
  stage: string
  match_date: string
  status: string
  home_team: { country_name: string } | null
  away_team: { country_name: string } | null
  home_team_placeholder: string | null
  away_team_placeholder: string | null
}

type DashboardClientProps = {
  user: { user_id: string; username: string; full_name: string }
  pools: PoolCardData[]
  upcomingMatches: UpcomingMatch[]
  activities: ActivityItem[]
  totalPools: number
  totalPoints: number
  bestRank: number | null
}

// =====================
// HELPERS
// =====================
function formatDeadline(deadline: string | null) {
  if (!deadline) return { text: 'No deadline set', className: 'text-gray-500' }

  const deadlineDate = new Date(deadline)
  const now = new Date()
  const daysUntil = Math.floor((deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

  if (daysUntil < 0) {
    return { text: 'Deadline passed', className: 'text-red-600 font-semibold' }
  } else if (daysUntil === 0) {
    return { text: 'Today!', className: 'text-red-600 font-semibold' }
  } else if (daysUntil < 7) {
    return { text: `${daysUntil} days left`, className: 'text-orange-600 font-semibold' }
  } else {
    const formatted = deadlineDate.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
    return { text: `${formatted} (${daysUntil}d)`, className: 'text-gray-600' }
  }
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
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// =====================
// POOL CARD
// =====================
function PoolCard({ pool }: { pool: PoolCardData }) {
  const deadline = formatDeadline(pool.prediction_deadline)
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(pool.pool_code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback - ignore
    }
  }

  return (
    <Card>
      {/* Header */}
      <div className="flex justify-between items-start mb-3">
        <div className="min-w-0 flex-1 mr-3">
          <h4 className="text-lg font-bold text-gray-900 truncate">{pool.pool_name}</h4>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-gray-500">
              Code: <span className="font-mono font-bold text-gray-700">{pool.pool_code}</span>
            </span>
            <button
              onClick={handleCopy}
              className="text-blue-600 hover:text-blue-800 text-xs"
              title="Copy pool code"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          {pool.role === 'admin' && <Badge variant="blue">Admin</Badge>}
          <Badge variant={getStatusVariant(pool.status)}>{pool.status}</Badge>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 mb-3 text-center">
        <div className="bg-gray-50 rounded-lg py-2 px-1">
          <p className="text-lg font-bold text-blue-600">{pool.total_points ?? 0}</p>
          {pool.bonus_points > 0 ? (
            <p className="text-[10px] text-gray-500">{pool.match_points} + {pool.bonus_points} bonus</p>
          ) : (
            <p className="text-xs text-gray-500">Points</p>
          )}
        </div>
        <div className="bg-gray-50 rounded-lg py-2 px-1">
          <p className="text-lg font-bold text-gray-900">
            {pool.current_rank ? (
              <>
                {pool.current_rank === 1 && '🥇'}
                {pool.current_rank === 2 && '🥈'}
                {pool.current_rank === 3 && '🥉'}
                {pool.current_rank > 3 && `#${pool.current_rank}`}
                {pool.current_rank <= 3 && ` #${pool.current_rank}`}
              </>
            ) : (
              '--'
            )}
          </p>
          <p className="text-xs text-gray-500">of {pool.memberCount}</p>
        </div>
        <div className="bg-gray-50 rounded-lg py-2 px-1">
          <p className="text-lg font-bold text-gray-900">{pool.completedMatches}/{pool.totalMatches}</p>
          <p className="text-xs text-gray-500">Matches</p>
        </div>
      </div>

      {/* Prediction progress bar */}
      {pool.totalMatches > 0 && (
        <div className="mb-3">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-gray-600">
              Predictions: <span className="font-bold">{pool.predictedMatches}/{pool.totalMatches}</span>
            </span>
            {pool.has_submitted_predictions ? (
              <span className="text-green-600 font-semibold">Submitted</span>
            ) : pool.predictedMatches > 0 ? (
              <span className="text-amber-600 font-semibold">Draft</span>
            ) : (
              <span className="text-gray-500">Not started</span>
            )}
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                pool.has_submitted_predictions
                  ? 'bg-green-500'
                  : pool.predictedMatches === pool.totalMatches
                  ? 'bg-blue-500'
                  : 'bg-amber-500'
              }`}
              style={{ width: `${Math.round((pool.predictedMatches / pool.totalMatches) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Status indicators */}
      <div className="flex items-center justify-between mb-3 text-xs">
        <span className={deadline.className}>{deadline.text}</span>
      </div>

      {/* CTA buttons — dynamic based on prediction status */}
      <div className="flex gap-2">
        <Button
          href={`/pools/${pool.pool_id}`}
          variant="primary"
          size="sm"
          fullWidth
        >
          View Pool
        </Button>
        <Button
          href={`/pools/${pool.pool_id}?tab=predictions`}
          variant="outline"
          size="sm"
          fullWidth
        >
          Predictions
        </Button>
      </div>
    </Card>
  )
}

// =====================
// MAIN COMPONENT
// =====================
export function DashboardClient({
  user,
  pools,
  upcomingMatches,
  activities,
  totalPools,
  totalPoints,
  bestRank,
}: DashboardClientProps) {
  const supabase = createClient()
  const router = useRouter()

  // Join pool state
  const [joinCode, setJoinCode] = useState('')
  const [joinLoading, setJoinLoading] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)
  const [joinSuccess, setJoinSuccess] = useState<string | null>(null)

  // Create pool state
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [createLoading, setCreateLoading] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createSuccess, setCreateSuccess] = useState<string | null>(null)
  const [newPoolName, setNewPoolName] = useState('')
  const [newPoolDescription, setNewPoolDescription] = useState('')
  const [createdPoolCode, setCreatedPoolCode] = useState<string | null>(null)

  // =====================
  // JOIN POOL
  // =====================
  const handleJoinPool = async () => {
    setJoinLoading(true)
    setJoinError(null)
    setJoinSuccess(null)

    const { data: { user: authUser } } = await supabase.auth.getUser()

    const { data: userData } = await supabase
      .from('users')
      .select('user_id')
      .eq('auth_user_id', authUser?.id)
      .single()

    if (!userData) {
      setJoinError('Could not find your account.')
      setJoinLoading(false)
      return
    }

    const { data: pool, error: poolError } = await supabase
      .from('pools')
      .select('pool_id, pool_name, status')
      .eq('pool_code', joinCode)
      .single()

    if (poolError || !pool) {
      setJoinError('Pool not found. Check the code and try again.')
      setJoinLoading(false)
      return
    }

    if (pool.status !== 'open') {
      setJoinError('This pool is no longer accepting new members.')
      setJoinLoading(false)
      return
    }

    const { error: insertError } = await supabase
      .from('pool_members')
      .insert({
        pool_id: pool.pool_id,
        user_id: userData.user_id,
        role: 'player',
      })

    if (insertError) {
      if (insertError.code === '23505') {
        setJoinError('You are already a member of this pool!')
      } else {
        setJoinError(insertError.message)
      }
      setJoinLoading(false)
      return
    }

    setJoinSuccess(`Joined "${pool.pool_name}"!`)
    setJoinCode('')
    setJoinLoading(false)
    router.refresh()
  }

  // =====================
  // CREATE POOL
  // =====================
  const handleCreatePool = async () => {
    setCreateLoading(true)
    setCreateError(null)
    setCreateSuccess(null)

    const { data: { user: authUser } } = await supabase.auth.getUser()

    const { data: userData } = await supabase
      .from('users')
      .select('user_id')
      .eq('auth_user_id', authUser?.id)
      .single()

    if (!userData) {
      setCreateError('Could not find your account.')
      setCreateLoading(false)
      return
    }

    const { data: tournament } = await supabase
      .from('tournaments')
      .select('tournament_id')
      .limit(1)
      .single()

    if (!tournament) {
      setCreateError('No tournament found. Contact support.')
      setCreateLoading(false)
      return
    }

    const { data: newPool, error: poolError } = await supabase
      .from('pools')
      .insert({
        pool_name: newPoolName,
        description: newPoolDescription || null,
        tournament_id: tournament.tournament_id,
        admin_user_id: userData.user_id,
        prediction_deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'open',
      })
      .select()
      .single()

    if (poolError) {
      if (poolError.code === '23505') {
        setCreateError('Please try again.')
      } else {
        setCreateError(poolError.message)
      }
      setCreateLoading(false)
      return
    }

    const { error: memberError } = await supabase
      .from('pool_members')
      .insert({
        pool_id: newPool.pool_id,
        user_id: userData.user_id,
        role: 'admin',
      })

    if (memberError) {
      setCreateError('Pool created but could not add you as admin: ' + memberError.message)
      setCreateLoading(false)
      return
    }

    setCreatedPoolCode(newPool.pool_code)
    setCreateSuccess(`Pool "${newPoolName}" created!`)
    setNewPoolName('')
    setNewPoolDescription('')
    setShowCreateForm(false)
    setCreateLoading(false)
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation bar */}
      <nav className="sticky top-0 z-10 bg-white shadow-sm px-4 sm:px-6 py-3 sm:py-4 flex justify-between items-center">
        <Link href="/dashboard" className="text-lg sm:text-xl font-bold text-gray-900">
          World Cup Pool
        </Link>
        <div className="flex items-center gap-3 sm:gap-4">
          <Link href="/profile" className="text-sm text-gray-600 hover:text-gray-900 font-medium">
            Profile
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

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        {/* Welcome header */}
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">
          Welcome, {user.full_name || user.username || 'Player'}!
        </h2>
        <p className="text-gray-600 mb-6 sm:mb-8">Your World Cup Pool Dashboard</p>

        {/* Quick stats */}
        <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-6 sm:mb-8">
          <Card className="text-center">
            <p className="text-xs sm:text-sm text-gray-600 mb-1">Total Pools</p>
            <p className="text-2xl sm:text-3xl font-bold text-blue-600">{totalPools}</p>
          </Card>
          <Card className="text-center">
            <p className="text-xs sm:text-sm text-gray-600 mb-1">Best Rank</p>
            <p className="text-2xl sm:text-3xl font-bold text-purple-600">
              {bestRank ? `#${bestRank}` : '--'}
            </p>
          </Card>
          <Card className="text-center">
            <p className="text-xs sm:text-sm text-gray-600 mb-1">Total Points</p>
            <p className="text-2xl sm:text-3xl font-bold text-green-600">{totalPoints}</p>
          </Card>
        </div>

        {/* Join / Create Pool Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 sm:mb-8">
          {/* Join Pool */}
          <Card>
            <h3 className="text-base font-bold text-gray-900 mb-1">Join a Pool</h3>
            <p className="text-sm text-gray-600 mb-3">Enter a pool code to join</p>

            {joinError && <Alert variant="error" className="mb-3">{joinError}</Alert>}
            {joinSuccess && <Alert variant="success" className="mb-3">{joinSuccess}</Alert>}

            <div className="flex gap-2">
              <Input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="Pool code (e.g. HSBC2026)"
                className="flex-1"
              />
              <Button
                onClick={handleJoinPool}
                disabled={joinLoading || !joinCode}
                loading={joinLoading}
                loadingText="Joining..."
                className="px-5"
              >
                Join
              </Button>
            </div>
          </Card>

          {/* Create Pool */}
          <Card>
            <h3 className="text-base font-bold text-gray-900 mb-1">Create a Pool</h3>
            <p className="text-sm text-gray-600 mb-3">Start your own pool and invite friends</p>

            {createError && <Alert variant="error" className="mb-3">{createError}</Alert>}
            {createSuccess && (
              <Alert variant="success" className="mb-3">
                <p>{createSuccess}</p>
                {createdPoolCode && (
                  <p className="mt-1">
                    Pool code: <strong className="font-mono text-lg">{createdPoolCode}</strong>
                  </p>
                )}
              </Alert>
            )}

            {!showCreateForm ? (
              <Button variant="green" fullWidth onClick={() => setShowCreateForm(true)}>
                Create New Pool
              </Button>
            ) : (
              <div className="space-y-3">
                <FormField label="Pool Name *">
                  <Input
                    type="text"
                    value={newPoolName}
                    onChange={(e) => setNewPoolName(e.target.value)}
                    placeholder="e.g. Office World Cup 2026"
                    focusColor="green"
                  />
                </FormField>

                <FormField label="Description (optional)">
                  <textarea
                    value={newPoolDescription}
                    onChange={(e) => setNewPoolDescription(e.target.value)}
                    placeholder="Tell people about your pool..."
                    rows={2}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-gray-900"
                  />
                </FormField>

                <div className="flex gap-3">
                  <Button
                    variant="green"
                    onClick={handleCreatePool}
                    disabled={createLoading || !newPoolName}
                    loading={createLoading}
                    loadingText="Creating..."
                    className="flex-1"
                  >
                    Create Pool
                  </Button>
                  <Button
                    variant="gray"
                    onClick={() => {
                      setShowCreateForm(false)
                      setCreateError(null)
                      setCreateSuccess(null)
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Resume Predictions Banner */}
        {(() => {
          const incompleteDrafts = pools.filter(
            p => !p.has_submitted_predictions && p.predictedMatches > 0 && p.predictedMatches < p.totalMatches
          )
          if (incompleteDrafts.length === 0) return null
          return (
            <div className="mb-6 sm:mb-8 bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <span className="text-amber-600 text-xl shrink-0">&#9888;</span>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-bold text-amber-800 mb-1">You have incomplete predictions!</h4>
                  <div className="space-y-1.5">
                    {incompleteDrafts.map(pool => (
                      <div key={pool.pool_id} className="flex items-center justify-between gap-2">
                        <span className="text-sm text-amber-700 truncate">
                          {pool.pool_name}: <strong>{pool.predictedMatches}/{pool.totalMatches}</strong> ({Math.round((pool.predictedMatches / pool.totalMatches) * 100)}%)
                        </span>
                        <Button
                          href={`/pools/${pool.pool_id}?tab=predictions`}
                          variant="primary"
                          size="sm"
                          className="shrink-0"
                        >
                          Resume
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )
        })()}

        {/* My Pools section */}
        <div className="mb-8">
          <h3 className="text-xl font-bold text-gray-900 mb-4">My Pools</h3>

          {pools.length === 0 ? (
            <Card padding="lg" className="text-center">
              <p className="text-gray-600 text-lg mb-2">You haven&apos;t joined any pools yet.</p>
              <p className="text-gray-500">Join or create a pool above to get started.</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...pools].sort((a, b) => {
                // Sort: incomplete drafts first, then not started, then submitted, then by deadline
                const aScore = !a.has_submitted_predictions && a.predictedMatches > 0 && a.predictedMatches < a.totalMatches
                  ? 0  // incomplete draft
                  : !a.has_submitted_predictions && a.predictedMatches === 0
                  ? 1  // not started
                  : 2  // submitted
                const bScore = !b.has_submitted_predictions && b.predictedMatches > 0 && b.predictedMatches < b.totalMatches
                  ? 0
                  : !b.has_submitted_predictions && b.predictedMatches === 0
                  ? 1
                  : 2
                if (aScore !== bScore) return aScore - bScore
                // Secondary: by deadline (soonest first)
                const aDeadline = a.prediction_deadline ? new Date(a.prediction_deadline).getTime() : Infinity
                const bDeadline = b.prediction_deadline ? new Date(b.prediction_deadline).getTime() : Infinity
                return aDeadline - bDeadline
              }).map((pool) => (
                <PoolCard key={pool.pool_id} pool={pool} />
              ))}
            </div>
          )}
        </div>

        {/* Two column layout: Upcoming matches + Activity feed */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Upcoming matches - 3/5 width */}
          <div className="lg:col-span-3">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Upcoming Matches</h3>
            {upcomingMatches.length === 0 ? (
              <Card>
                <p className="text-gray-600">No upcoming matches scheduled.</p>
              </Card>
            ) : (
              <div className="space-y-3">
                {upcomingMatches.map((match) => {
                  const homeTeam = (match.home_team as any)?.country_name ?? match.home_team_placeholder ?? 'TBD'
                  const awayTeam = (match.away_team as any)?.country_name ?? match.away_team_placeholder ?? 'TBD'
                  return (
                    <Card key={match.match_id} className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-gray-900">
                          {homeTeam} vs {awayTeam}
                        </p>
                        <p className="text-xs text-gray-500">
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
                <p className="text-gray-600">No recent activity.</p>
              </Card>
            ) : (
              <Card>
                <ul className="divide-y divide-gray-100">
                  {activities.map((activity, idx) => (
                    <li key={idx} className="py-3 first:pt-0 last:pb-0">
                      <p className="text-sm text-gray-900">
                        Joined <Link href={`/pools/${activity.poolId}`} className="font-medium text-blue-600 hover:underline">{activity.poolName}</Link>
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-gray-500">{timeAgo(activity.date)}</span>
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
