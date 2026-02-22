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
  if (!deadline) return { text: 'No deadline set', className: 'text-neutral-500' }

  const deadlineDate = new Date(deadline)
  const now = new Date()
  const daysUntil = Math.floor((deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

  if (daysUntil < 0) {
    return { text: 'Deadline passed', className: 'text-danger-600 font-semibold' }
  } else if (daysUntil === 0) {
    return { text: 'Today!', className: 'text-danger-600 font-semibold' }
  } else if (daysUntil < 7) {
    return { text: `${daysUntil} days left`, className: 'text-warning-600 font-semibold' }
  } else {
    const formatted = deadlineDate.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
    return { text: `${formatted} (${daysUntil}d)`, className: 'text-neutral-600' }
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
          <h4 className="text-lg font-bold text-neutral-900 truncate">{pool.pool_name}</h4>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-neutral-500">
              Code: <span className="font-mono font-bold text-neutral-700">{pool.pool_code}</span>
            </span>
            <button
              onClick={handleCopy}
              className="text-primary-600 hover:text-primary-800 text-xs"
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
        <div className="bg-neutral-50 rounded-lg py-2 px-1">
          <p className="text-lg font-bold text-primary-600">{pool.total_points ?? 0}</p>
          {pool.bonus_points > 0 ? (
            <p className="text-[10px] text-neutral-500">{pool.match_points} + {pool.bonus_points} bonus</p>
          ) : (
            <p className="text-xs text-neutral-500">Points</p>
          )}
        </div>
        <div className="bg-neutral-50 rounded-lg py-2 px-1">
          <p className="text-lg font-bold text-neutral-900">
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
          <p className="text-xs text-neutral-500">of {pool.memberCount}</p>
        </div>
        <div className="bg-neutral-50 rounded-lg py-2 px-1">
          <p className="text-lg font-bold text-neutral-900">{pool.completedMatches}/{pool.totalMatches}</p>
          <p className="text-xs text-neutral-500">Matches</p>
        </div>
      </div>

      {/* Prediction progress bar */}
      {pool.totalMatches > 0 && (
        <div className="mb-3">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-neutral-600">
              Predictions: <span className="font-bold">{pool.predictedMatches}/{pool.totalMatches}</span>
            </span>
            {pool.has_submitted_predictions ? (
              <span className="text-success-600 font-semibold">Submitted</span>
            ) : pool.predictedMatches > 0 ? (
              <span className="text-warning-600 font-semibold">Draft</span>
            ) : (
              <span className="text-neutral-500">Not started</span>
            )}
          </div>
          <div className="h-2 bg-neutral-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                pool.has_submitted_predictions
                  ? 'bg-success-500'
                  : pool.predictedMatches === pool.totalMatches
                  ? 'bg-primary-500'
                  : 'bg-warning-500'
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

  // Modal state
  const [showJoinModal, setShowJoinModal] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)

  // Join pool state
  const [joinCode, setJoinCode] = useState('')
  const [joinLoading, setJoinLoading] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)
  const [joinSuccess, setJoinSuccess] = useState<string | null>(null)

  // Create pool state
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
    setTimeout(() => {
      setShowJoinModal(false)
      setJoinSuccess(null)
    }, 1500)
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
    setCreateLoading(false)
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Navigation bar */}
      <nav className="sticky top-0 z-10 bg-white shadow-sm px-4 sm:px-6 py-3 sm:py-4 flex justify-between items-center">
        <Link href="/dashboard" className="text-lg sm:text-xl font-bold text-neutral-900">
          World Cup Pool
        </Link>
        <div className="flex items-center gap-3 sm:gap-4">
          <Link href="/profile" className="text-sm text-neutral-600 hover:text-neutral-900 font-medium">
            Profile
          </Link>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="text-sm text-neutral-600 hover:text-neutral-900 font-medium"
            >
              Sign Out
            </button>
          </form>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        {/* Welcome header */}
        <h2 className="text-2xl sm:text-3xl font-bold text-neutral-900 mb-1">
          Welcome, {user.full_name || user.username || 'Player'}!
        </h2>
        <p className="text-neutral-600 mb-6 sm:mb-8">Your World Cup Pool Dashboard</p>

        {/* Quick stats */}
        <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-6 sm:mb-8">
          <Card className="text-center">
            <p className="text-xs sm:text-sm text-neutral-600 mb-1">Total Pools</p>
            <p className="text-2xl sm:text-3xl font-bold text-primary-600">{totalPools}</p>
          </Card>
          <Card className="text-center">
            <p className="text-xs sm:text-sm text-neutral-600 mb-1">Best Rank</p>
            <p className="text-2xl sm:text-3xl font-bold text-accent-500">
              {bestRank ? `#${bestRank}` : '--'}
            </p>
          </Card>
          <Card className="text-center">
            <p className="text-xs sm:text-sm text-neutral-600 mb-1">Total Points</p>
            <p className="text-2xl sm:text-3xl font-bold text-success-600">{totalPoints}</p>
          </Card>
        </div>

        {/* Resume Predictions Banner */}
        {(() => {
          const incompleteDrafts = pools.filter(
            p => !p.has_submitted_predictions && p.predictedMatches > 0 && p.predictedMatches < p.totalMatches
          )
          if (incompleteDrafts.length === 0) return null
          return (
            <div className="mb-6 sm:mb-8 bg-warning-50 border border-warning-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <span className="text-warning-600 text-xl shrink-0">&#9888;</span>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-bold text-warning-800 mb-1">You have incomplete predictions!</h4>
                  <div className="space-y-1.5">
                    {incompleteDrafts.map(pool => (
                      <div key={pool.pool_id} className="flex items-center justify-between gap-2">
                        <span className="text-sm text-warning-700 truncate">
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
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-neutral-900">My Pools</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setJoinError(null)
                  setJoinSuccess(null)
                  setJoinCode('')
                  setShowJoinModal(true)
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary-600 bg-primary-50 border border-primary-200 rounded-lg hover:bg-primary-100 hover:border-primary-300 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM3 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 9.374 21c-2.331 0-4.512-.645-6.374-1.766Z" />
                </svg>
                Join
              </button>
              <button
                onClick={() => {
                  setCreateError(null)
                  setCreateSuccess(null)
                  setCreatedPoolCode(null)
                  setNewPoolName('')
                  setNewPoolDescription('')
                  setShowCreateModal(true)
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-success-600 bg-success-50 border border-success-200 rounded-lg hover:bg-success-100 hover:border-success-300 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Create
              </button>
            </div>
          </div>

          {pools.length === 0 ? (
            <Card padding="lg" className="text-center">
              <p className="text-neutral-600 text-lg mb-2">You haven&apos;t joined any pools yet.</p>
              <p className="text-neutral-500">Use the buttons above to join or create a pool.</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            <h3 className="text-xl font-bold text-neutral-900 mb-4">Upcoming Matches</h3>
            {upcomingMatches.length === 0 ? (
              <Card>
                <p className="text-neutral-600">No upcoming matches scheduled.</p>
              </Card>
            ) : (
              <div className="space-y-3">
                {upcomingMatches.map((match) => {
                  const homeTeam = (match.home_team as any)?.country_name ?? match.home_team_placeholder ?? 'TBD'
                  const awayTeam = (match.away_team as any)?.country_name ?? match.away_team_placeholder ?? 'TBD'
                  return (
                    <Card key={match.match_id} className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-neutral-900">
                          {homeTeam} vs {awayTeam}
                        </p>
                        <p className="text-xs text-neutral-500">
                          {formatStage(match.stage)} &middot; Match #{match.match_number}
                        </p>
                      </div>
                      <div className="text-right shrink-0 ml-4">
                        <p className="text-sm font-medium text-neutral-700">
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
            <h3 className="text-xl font-bold text-neutral-900 mb-4">Recent Activity</h3>
            {activities.length === 0 ? (
              <Card>
                <p className="text-neutral-600">No recent activity.</p>
              </Card>
            ) : (
              <Card>
                <ul className="divide-y divide-neutral-100">
                  {activities.map((activity, idx) => (
                    <li key={idx} className="py-3 first:pt-0 last:pb-0">
                      <p className="text-sm text-neutral-900">
                        Joined <Link href={`/pools/${activity.poolId}`} className="font-medium text-primary-600 hover:underline">{activity.poolName}</Link>
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-neutral-500">{timeAgo(activity.date)}</span>
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

      {/* Join Pool Modal */}
      {showJoinModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50"
          onClick={(e) => {
            if (e.target === e.currentTarget && !joinLoading) setShowJoinModal(false)
          }}
        >
          <div className="bg-white rounded-t-xl sm:rounded-xl shadow-xl sm:max-w-md w-full sm:mx-4 flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-4 sm:px-6 pt-4 sm:pt-5 pb-3 border-b border-neutral-100">
              <h2 className="text-lg font-bold text-neutral-900">Join a Pool</h2>
              <button
                onClick={() => !joinLoading && setShowJoinModal(false)}
                className="p-1.5 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="px-4 sm:px-6 py-4 sm:py-5">
              <p className="text-sm text-neutral-600 mb-4">Enter the pool code shared with you to join.</p>

              {joinError && <Alert variant="error" className="mb-3">{joinError}</Alert>}
              {joinSuccess && <Alert variant="success" className="mb-3">{joinSuccess}</Alert>}

              <FormField label="Pool Code">
                <Input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="e.g. HSBC2026"
                />
              </FormField>
            </div>

            {/* Footer */}
            <div className="flex gap-3 px-4 sm:px-6 pb-4 sm:pb-5">
              <Button
                variant="gray"
                onClick={() => setShowJoinModal(false)}
                disabled={joinLoading}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleJoinPool}
                disabled={joinLoading || !joinCode}
                loading={joinLoading}
                loadingText="Joining..."
                className="flex-1"
              >
                Join Pool
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Create Pool Modal */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50"
          onClick={(e) => {
            if (e.target === e.currentTarget && !createLoading) setShowCreateModal(false)
          }}
        >
          <div className="bg-white rounded-t-xl sm:rounded-xl shadow-xl sm:max-w-md w-full sm:mx-4 flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-4 sm:px-6 pt-4 sm:pt-5 pb-3 border-b border-neutral-100">
              <h2 className="text-lg font-bold text-neutral-900">Create a Pool</h2>
              <button
                onClick={() => !createLoading && setShowCreateModal(false)}
                className="p-1.5 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="px-4 sm:px-6 py-4 sm:py-5 space-y-4">
              <p className="text-sm text-neutral-600">Start your own pool and invite friends with a code.</p>

              {createError && <Alert variant="error">{createError}</Alert>}
              {createSuccess && (
                <Alert variant="success">
                  <p>{createSuccess}</p>
                  {createdPoolCode && (
                    <p className="mt-1">
                      Pool code: <strong className="font-mono text-lg">{createdPoolCode}</strong>
                    </p>
                  )}
                </Alert>
              )}

              {!createSuccess && (
                <>
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
                      className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-success-500 focus:border-transparent text-neutral-900"
                    />
                  </FormField>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="flex gap-3 px-4 sm:px-6 pb-4 sm:pb-5">
              {createSuccess ? (
                <Button
                  variant="primary"
                  fullWidth
                  onClick={() => setShowCreateModal(false)}
                >
                  Done
                </Button>
              ) : (
                <>
                  <Button
                    variant="gray"
                    onClick={() => setShowCreateModal(false)}
                    disabled={createLoading}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
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
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
