'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { Alert } from '@/components/ui/Alert'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { FormField } from '@/components/ui/FormField'
import { Button } from '@/components/ui/Button'
import { calculatePoints, DEFAULT_POOL_SETTINGS, type PoolSettings } from '@/app/pools/[pool_id]/results/points'

// =====================
// TYPES
// =====================
type PoolData = {
  member_id: string
  role: 'admin' | 'player'
  total_points: number
  calculatedPoints: number
  current_rank: number | null
  has_submitted_predictions: boolean
  joined_at: string
  pools: {
    pool_id: string
    pool_name: string
    pool_code: string
    description: string | null
    status: string
    prediction_deadline: string | null
    tournament_id: string
  }
  memberCount: number
  totalMatches: number
  completedMatches: number
}

// =====================
// HELPERS
// =====================
function formatDeadline(deadline: string | null) {
  if (!deadline) return { text: 'No deadline set', className: 'text-gray-400' }

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
      hour: 'numeric',
      minute: '2-digit',
    })
    return { text: `${formatted} (${daysUntil} days)`, className: 'text-gray-600' }
  }
}

// =====================
// POOL CARD COMPONENT
// =====================
function PoolCard({ data }: { data: PoolData }) {
  const { pools: pool, memberCount, totalMatches, completedMatches } = data
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
      {/* HEADER */}
      <div className="flex justify-between items-start mb-4">
        <div className="min-w-0 flex-1 mr-3">
          <h3 className="text-xl font-bold text-gray-900 truncate">{pool.pool_name}</h3>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm text-gray-500">
              Code: <span className="font-mono font-bold text-gray-700">{pool.pool_code}</span>
            </span>
            <button
              onClick={handleCopy}
              className="text-blue-600 hover:text-blue-800 text-sm"
              title="Copy pool code"
            >
              {copied ? '✓ Copied' : '📋 Copy'}
            </button>
          </div>
        </div>
        {data.role === 'admin' && (
          <Badge variant="yellow" className="shrink-0">
            👑 Admin
          </Badge>
        )}
      </div>

      {/* YOUR STATS */}
      <div className="mb-4 pb-4 border-b border-gray-200">
        <h4 className="text-sm font-semibold text-gray-700 mb-2">Your Stats:</h4>
        <ul className="space-y-1 text-sm text-gray-600">
          <li className="flex items-center gap-1">
            <span className="text-gray-400">•</span>
            <span>Rank: </span>
            {data.current_rank ? (
              <>
                {data.current_rank === 1 && <span>🥇 </span>}
                {data.current_rank === 2 && <span>🥈 </span>}
                {data.current_rank === 3 && <span>🥉 </span>}
                <span className="font-semibold">#{data.current_rank}</span>
                <span> of {memberCount} members</span>
              </>
            ) : (
              <span className="text-gray-400">Not ranked yet</span>
            )}
          </li>
          <li className="flex items-center gap-1">
            <span className="text-gray-400">•</span>
            <span>Points: </span>
            <span className="font-semibold text-blue-600">{data.calculatedPoints}</span>
            <span> points</span>
          </li>
          <li className="flex items-center gap-1">
            <span className="text-gray-400">•</span>
            <span>Status: </span>
            {data.has_submitted_predictions ? (
              <span className="text-green-600 font-semibold">✓ Predictions Submitted</span>
            ) : (
              <span className="text-orange-600 font-semibold">⚠ Predictions Pending</span>
            )}
          </li>
        </ul>
      </div>

      {/* POOL INFO */}
      <div className="mb-4">
        <h4 className="text-sm font-semibold text-gray-700 mb-2">Pool Info:</h4>
        <ul className="space-y-1 text-sm text-gray-600">
          <li className="flex items-center gap-1">
            <span className="text-gray-400">•</span>
            <span>Deadline: </span>
            <span className={deadline.className}>{deadline.text}</span>
          </li>
          <li className="flex items-center gap-1">
            <span className="text-gray-400">•</span>
            <span>Completed Matches: {completedMatches}/{totalMatches}</span>
          </li>
        </ul>
      </div>

      {/* ACTIONS */}
      <div className="grid grid-cols-2 gap-2">
        <Button href={`/pools/${pool.pool_id}/predictions`} variant="green" size="sm" fullWidth>
          Make Predictions
        </Button>
        <Button href={`/pools/${pool.pool_id}/leaderboard`} variant="primary" size="sm" fullWidth>
          Leaderboard
        </Button>
        <Button href={`/pools/${pool.pool_id}/results`} variant="outline" size="sm" fullWidth>
          Results
        </Button>
        {data.role === 'admin' && (
          <Button href={`/pools/${pool.pool_id}/admin`} variant="gray" size="sm" fullWidth>
            ⚙ Admin
          </Button>
        )}
      </div>
    </Card>
  )
}

// =====================
// MAIN PAGE
// =====================
export default function PoolsPage() {
  const [poolsData, setPoolsData] = useState<PoolData[]>([])
  const [loading, setLoading] = useState(true)

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
  const [newPoolCode, setNewPoolCode] = useState('')

  const supabase = createClient()

  useEffect(() => {
    fetchPools()
  }, [])

  // =====================
  // FETCH POOLS WITH ALL NECESSARY DATA
  // =====================
  const fetchPools = async () => {
    // STEP 1: Get the logged in auth user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // STEP 2: Get user_id from users table
    const { data: userData } = await supabase
      .from('users')
      .select('user_id')
      .eq('auth_user_id', user.id)
      .single()

    if (!userData) return

    // STEP 3: Fetch pool memberships with all necessary fields
    const { data: memberData } = await supabase
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

    if (!memberData) {
      setLoading(false)
      return
    }

    // STEP 4: For each pool, get member count, match counts, and calculate points
    const poolsWithCounts = await Promise.all(
      memberData.map(async (poolMember: any) => {
        const pool = poolMember.pools

        // Get member count for this pool
        const { count: memberCount } = await supabase
          .from('pool_members')
          .select('*', { count: 'exact', head: true })
          .eq('pool_id', pool.pool_id)

        // Get total matches for this tournament
        const { count: totalMatches } = await supabase
          .from('matches')
          .select('*', { count: 'exact', head: true })
          .eq('tournament_id', pool.tournament_id)

        // Get completed matches with scores for points calculation
        const { data: completedMatchesData } = await supabase
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
          .eq('member_id', poolMember.member_id)

        // Get pool settings for scoring rules
        const { data: rawPoolSettings } = await supabase
          .from('pool_settings')
          .select('*')
          .eq('pool_id', pool.pool_id)
          .single()

        const poolSettings: PoolSettings = rawPoolSettings
          ? { ...DEFAULT_POOL_SETTINGS, ...rawPoolSettings }
          : DEFAULT_POOL_SETTINGS

        // Build prediction lookup
        const predictionMap = new Map(
          (predictions ?? []).map((p: any) => [p.match_id, p])
        )

        // Calculate points from completed matches
        let calculatedPoints = 0
        for (const match of (completedMatchesData ?? [])) {
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

        const completedCount = completedMatchesData?.length ?? 0

        return {
          member_id: poolMember.member_id,
          role: poolMember.role,
          total_points: poolMember.total_points ?? 0,
          calculatedPoints,
          current_rank: poolMember.current_rank,
          has_submitted_predictions: poolMember.has_submitted_predictions ?? false,
          joined_at: poolMember.joined_at,
          pools: pool,
          memberCount: memberCount ?? 0,
          totalMatches: totalMatches ?? 0,
          completedMatches: completedCount,
        } as PoolData
      })
    )

    setPoolsData(poolsWithCounts)
    setLoading(false)
  }

  // =====================
  // HANDLE JOIN POOL
  // =====================
  const handleJoinPool = async () => {
    setJoinLoading(true)
    setJoinError(null)
    setJoinSuccess(null)

    const { data: { user } } = await supabase.auth.getUser()

    const { data: userData } = await supabase
      .from('users')
      .select('user_id')
      .eq('auth_user_id', user?.id)
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

    setJoinSuccess(`Successfully joined "${pool.pool_name}"!`)
    setJoinCode('')
    fetchPools()
    setJoinLoading(false)
  }

  // =====================
  // HANDLE CREATE POOL
  // =====================
  const handleCreatePool = async () => {
    setCreateLoading(true)
    setCreateError(null)
    setCreateSuccess(null)

    const { data: { user } } = await supabase.auth.getUser()

    const { data: userData } = await supabase
      .from('users')
      .select('user_id')
      .eq('auth_user_id', user?.id)
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

    const finalPoolCode = newPoolCode || `POOL${Math.random().toString(36).substring(2, 8).toUpperCase()}`

    const { data: newPool, error: poolError } = await supabase
      .from('pools')
      .insert({
        pool_name: newPoolName,
        description: newPoolDescription || null,
        pool_code: finalPoolCode,
        tournament_id: tournament.tournament_id,
        admin_user_id: userData.user_id,
        prediction_deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'open',
      })
      .select()
      .single()

    if (poolError) {
      if (poolError.code === '23505') {
        setCreateError('Pool code already exists. Try a different code.')
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

    setCreateSuccess(`Pool "${newPoolName}" created! Code: ${finalPoolCode}`)
    setNewPoolName('')
    setNewPoolDescription('')
    setNewPoolCode('')
    setShowCreateForm(false)
    fetchPools()
    setCreateLoading(false)
  }

  // =====================
  // PAGE LAYOUT
  // =====================
  return (
    <div className="min-h-screen bg-gray-50">

      {/* Navigation bar */}
      <nav className="bg-white shadow-sm px-6 py-4 flex justify-between items-center">
        <Link href="/dashboard" className="text-xl font-bold text-gray-900">
          ⚽ World Cup Pool
        </Link>
        <Link href="/dashboard" className="text-sm text-gray-600 hover:text-gray-900 font-medium">
          ← Back to Dashboard
        </Link>
      </nav>

      {/* Main content */}
      <main className="max-w-6xl mx-auto px-6 py-10">

        {/* Page header */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900">🏆 My Pools</h2>
          <p className="text-gray-600 mt-1">Manage your pools and join new ones</p>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">

          {/* JOIN POOL SECTION */}
          <Card>
            <h3 className="text-lg font-bold text-gray-900 mb-1">🔗 Join a Pool</h3>
            <p className="text-sm text-gray-600 mb-4">Enter a pool code to join an existing pool</p>

            {joinError && <Alert variant="error">{joinError}</Alert>}
            {joinSuccess && <Alert variant="success">{joinSuccess}</Alert>}

            <div className="flex gap-2">
              <Input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="Enter pool code (e.g. HSBC2026)"
                className="flex-1"
              />
              <Button
                onClick={handleJoinPool}
                disabled={joinLoading || !joinCode}
                loading={joinLoading}
                loadingText="Joining..."
                className="px-6"
              >
                Join
              </Button>
            </div>
          </Card>

          {/* CREATE POOL SECTION */}
          <Card>
            <h3 className="text-lg font-bold text-gray-900 mb-1">➕ Create a Pool</h3>
            <p className="text-sm text-gray-600 mb-4">Start your own pool and invite friends</p>

            {createError && <Alert variant="error">{createError}</Alert>}
            {createSuccess && <Alert variant="success">{createSuccess}</Alert>}

            {!showCreateForm ? (
              <Button variant="green" fullWidth onClick={() => setShowCreateForm(true)}>
                Create New Pool
              </Button>
            ) : (
              <div className="space-y-4">
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
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-gray-900"
                  />
                </FormField>

                <FormField
                  label="Custom Pool Code (optional)"
                  helperText={newPoolCode ? `Your code: ${newPoolCode}` : 'A random code will be generated'}
                >
                  <Input
                    type="text"
                    value={newPoolCode}
                    onChange={(e) => setNewPoolCode(e.target.value.toUpperCase())}
                    placeholder="Leave blank to auto-generate"
                    maxLength={20}
                    focusColor="green"
                    className="font-mono"
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

        {/* Loading state */}
        {loading && (
          <Card padding="lg" className="text-center mb-8">
            <p className="text-gray-500">Loading your pools...</p>
          </Card>
        )}

        {/* Empty state */}
        {!loading && poolsData.length === 0 && (
          <Card padding="lg" className="text-center mb-8">
            <h3 className="text-xl font-bold text-gray-900 mb-2">🏆 No Pools Yet</h3>
            <p className="text-gray-600">
              You haven&apos;t joined any pools yet. Create your first pool or join one with a code above!
            </p>
          </Card>
        )}

        {/* Pool cards grid */}
        {!loading && poolsData.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {poolsData.map((data) => (
              <PoolCard key={data.member_id} data={data} />
            ))}
          </div>
        )}

      </main>
    </div>
  )
}
