'use client'

import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { FormField } from '@/components/ui/FormField'
import { Alert } from '@/components/ui/Alert'
import { useTheme } from '@/components/ThemeProvider'
import { calculatePoints, DEFAULT_POOL_SETTINGS, type PoolSettings } from '@/app/pools/[pool_id]/results/points'

// =====================
// TYPES
// =====================

type Profile = {
  user_id: string
  username: string
  full_name: string | null
  email: string
  created_at: string
}

type PoolMembership = {
  member_id: string
  pool_id: string
  pool_name: string
  role: string
  total_points: number
  current_rank: number | null
  has_submitted_predictions: boolean
  joined_at: string
}

type Prediction = {
  prediction_id: string
  member_id: string
  match_id: string
  predicted_home_score: number
  predicted_away_score: number
  points_awarded: number | null
  matches: {
    match_id: string
    match_number: number
    stage: string
    group_letter: string | null
    match_date: string
    status: string
    home_score_ft: number | null
    away_score_ft: number | null
    home_team_placeholder: string | null
    away_team_placeholder: string | null
    home_team: { country_name: string } | null
    away_team: { country_name: string } | null
  }
}

type Tab = 'edit' | 'statistics' | 'predictions' | 'settings'

type ProfilePageProps = {
  profile: Profile
  poolMemberships: PoolMembership[]
  memberCounts: Record<string, number>
  predictions: Prediction[]
  totalMatchCount: number
  poolSettingsMap: Record<string, any>
}

// =====================
// HELPERS
// =====================

function getInitials(fullName: string | null, username: string): string {
  if (fullName) {
    return fullName
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }
  return username.slice(0, 2).toUpperCase()
}

function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  return hash
}

function getAvatarColor(username: string): string {
  const colors = [
    'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-pink-500',
    'bg-indigo-500', 'bg-teal-500', 'bg-orange-500', 'bg-cyan-500',
  ]
  const idx = Math.abs(hashString(username)) % colors.length
  return colors[idx]
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatMemberSince(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })
}

function formatStage(stage: string): string {
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

function getMatchWinner(homeScore: number, awayScore: number): 'home' | 'away' | 'draw' {
  if (homeScore > awayScore) return 'home'
  if (awayScore > homeScore) return 'away'
  return 'draw'
}

// =====================
// MAIN COMPONENT
// =====================

export default function ProfilePage({
  profile,
  poolMemberships,
  memberCounts,
  predictions,
  totalMatchCount,
  poolSettingsMap,
}: ProfilePageProps) {
  const [activeTab, setActiveTab] = useState<Tab>('edit')
  const router = useRouter()
  const supabase = createClient()

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'edit', label: 'Edit Profile', icon: '✏️' },
    { key: 'statistics', label: 'Statistics', icon: '📊' },
    { key: 'predictions', label: 'Prediction History', icon: '📝' },
    { key: 'settings', label: 'Account Settings', icon: '⚙️' },
  ]

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Navigation bar */}
      <nav className="sticky top-0 z-10 bg-white shadow-sm px-4 sm:px-6 py-3 sm:py-4 flex justify-between items-center">
        <Link href="/dashboard" className="text-lg sm:text-xl font-bold text-neutral-900">
          World Cup Pool
        </Link>
        <Link href="/dashboard" className="text-sm text-neutral-600 hover:text-neutral-900 font-medium">
          &larr; Dashboard
        </Link>
      </nav>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <h2 className="text-2xl sm:text-3xl font-bold text-neutral-900 mb-6 sm:mb-8">My Profile</h2>

        <div className="flex flex-col md:flex-row gap-6">
          {/* Left sidebar */}
          <div className="w-full md:w-[30%] space-y-4">
            {/* Profile card */}
            <Card>
              <div className="flex flex-col items-center text-center">
                <div className={`w-[120px] h-[120px] rounded-full ${getAvatarColor(profile.username)} flex items-center justify-center text-white text-3xl font-bold mb-4`}>
                  {getInitials(profile.full_name, profile.username)}
                </div>
                <h3 className="text-xl font-bold text-neutral-900">
                  {profile.full_name || profile.username}
                </h3>
                <p className="text-sm text-neutral-500">@{profile.username}</p>
                <p className="text-xs text-neutral-500 mt-2">
                  Member since {formatMemberSince(profile.created_at)}
                </p>
              </div>
            </Card>

            {/* Navigation tabs */}
            <Card padding="md" className="!p-2">
              <div className="flex flex-row md:flex-col gap-1 overflow-x-auto">
                {tabs.map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`w-full text-left px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg text-sm font-medium transition flex items-center gap-2 whitespace-nowrap ${
                      activeTab === tab.key
                        ? 'bg-primary-600 text-white'
                        : 'text-neutral-700 hover:bg-neutral-100'
                    }`}
                  >
                    <span>{tab.icon}</span>
                    <span className="hidden sm:inline">{tab.label}</span>
                  </button>
                ))}
              </div>
            </Card>
          </div>

          {/* Main content area */}
          <div className="w-full md:w-[70%]">
            {activeTab === 'edit' && (
              <EditProfileTab profile={profile} supabase={supabase} router={router} />
            )}
            {activeTab === 'statistics' && (
              <StatisticsTab
                poolMemberships={poolMemberships}
                memberCounts={memberCounts}
                predictions={predictions}
                totalMatchCount={totalMatchCount}
              />
            )}
            {activeTab === 'predictions' && (
              <PredictionHistoryTab
                predictions={predictions}
                poolMemberships={poolMemberships}
                poolSettingsMap={poolSettingsMap}
              />
            )}
            {activeTab === 'settings' && (
              <AccountSettingsTab
                profile={profile}
                poolMemberships={poolMemberships}
                supabase={supabase}
                router={router}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

// =====================
// TAB 1: EDIT PROFILE
// =====================

function EditProfileTab({
  profile,
  supabase,
  router,
}: {
  profile: Profile
  supabase: any
  router: any
}) {
  const [username, setUsername] = useState(profile.username)
  const [fullName, setFullName] = useState(profile.full_name ?? '')
  const [email, setEmail] = useState(profile.email)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle')

  const usernameChanged = username !== profile.username
  const emailChanged = email !== profile.email
  const hasChanges = usernameChanged || emailChanged || fullName !== (profile.full_name ?? '')

  async function checkUsername(value: string) {
    if (value === profile.username) {
      setUsernameStatus('idle')
      return
    }
    if (value.length < 3) {
      setUsernameStatus('idle')
      return
    }
    setUsernameStatus('checking')
    const { data } = await supabase
      .from('users')
      .select('user_id')
      .eq('username', value)
      .single()
    setUsernameStatus(data ? 'taken' : 'available')
  }

  async function handleSave() {
    setError(null)
    setSuccess(null)

    // Validate username
    if (!username || username.length < 3 || username.length > 20) {
      setError('Username must be 3-20 characters.')
      return
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      setError('Username can only contain letters, numbers, and underscores.')
      return
    }
    if (usernameStatus === 'taken') {
      setError('That username is already taken.')
      return
    }

    // Validate email
    if (emailChanged && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address.')
      return
    }

    setSaving(true)

    try {
      // Update users table
      const { error: profileError } = await supabase
        .from('users')
        .update({
          username,
          full_name: fullName || null,
        })
        .eq('user_id', profile.user_id)

      if (profileError) throw profileError

      // If email changed, update Supabase auth
      if (emailChanged) {
        const { error: emailError } = await supabase.auth.updateUser({
          email,
        })
        if (emailError) throw emailError
        setSuccess('Profile updated! A verification email has been sent to your new address.')
      } else {
        setSuccess('Profile updated successfully!')
      }

      router.refresh()
    } catch (err: any) {
      setError(err.message || 'Failed to update profile.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <h3 className="text-2xl font-bold text-neutral-900 mb-1">Edit Profile</h3>
      <p className="text-neutral-600 text-sm mb-6">Update your personal information</p>

      {error && <Alert variant="error">{error}</Alert>}
      {success && <Alert variant="success">{success}</Alert>}

      <div className="space-y-5">
        {/* Username */}
        <FormField label="Username *" helperText="Letters, numbers, and underscores only (3-20 characters)">
          <div className="relative">
            <Input
              type="text"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value)
                setUsernameStatus('idle')
              }}
              onBlur={() => checkUsername(username)}
              maxLength={20}
            />
            {usernameStatus === 'checking' && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-500">Checking...</span>
            )}
            {usernameStatus === 'available' && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-success-600">✓ Available</span>
            )}
            {usernameStatus === 'taken' && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-danger-600">✗ Taken</span>
            )}
          </div>
        </FormField>

        {/* Full Name */}
        <FormField label="Full Name">
          <Input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            maxLength={100}
            placeholder="Your full name"
          />
        </FormField>

        {/* Email */}
        <FormField label="Email" helperText="Email changes require verification">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
          />
          {emailChanged && (
            <p className="text-xs text-warning-600 mt-1">
              You will need to verify your new email address.
            </p>
          )}
        </FormField>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <Button
            variant="gray"
            onClick={() => {
              setUsername(profile.username)
              setFullName(profile.full_name ?? '')
              setEmail(profile.email)
              setError(null)
              setSuccess(null)
              setUsernameStatus('idle')
            }}
            disabled={!hasChanges}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !hasChanges || usernameStatus === 'taken'}
            loading={saving}
            loadingText="Saving..."
          >
            Save Changes
          </Button>
        </div>
      </div>
    </Card>
  )
}

// =====================
// TAB 2: STATISTICS
// =====================

function StatisticsTab({
  poolMemberships,
  memberCounts,
  predictions,
  totalMatchCount,
}: {
  poolMemberships: PoolMembership[]
  memberCounts: Record<string, number>
  predictions: Prediction[]
  totalMatchCount: number
}) {
  // Calculate aggregate stats
  const totalPools = poolMemberships.length
  const totalPoints = poolMemberships.reduce((sum, p) => sum + p.total_points, 0)
  const totalPredictions = predictions.length

  const bestPool = poolMemberships.reduce<PoolMembership | null>((best, p) => {
    if (p.current_rank === null) return best
    if (!best || best.current_rank === null) return p
    return p.current_rank < best.current_rank ? p : best
  }, null)

  // Per-pool stats
  const poolStats = useMemo(() => {
    return poolMemberships.map(pool => {
      const poolPredictions = predictions.filter(p => p.member_id === pool.member_id)
      const completedPredictions = poolPredictions.filter(
        p => p.matches.status === 'completed'
      )

      let correctCount = 0
      let exactCount = 0
      let winnerGdCount = 0
      let winnerOnlyCount = 0
      let incorrectCount = 0

      for (const pred of completedPredictions) {
        const m = pred.matches
        if (m.home_score_ft === null || m.away_score_ft === null) continue

        const predictedWinner = getMatchWinner(pred.predicted_home_score, pred.predicted_away_score)
        const actualWinner = getMatchWinner(m.home_score_ft, m.away_score_ft)

        if (pred.predicted_home_score === m.home_score_ft && pred.predicted_away_score === m.away_score_ft) {
          exactCount++
          correctCount++
        } else if (
          predictedWinner === actualWinner &&
          (pred.predicted_home_score - pred.predicted_away_score) === (m.home_score_ft - m.away_score_ft)
        ) {
          winnerGdCount++
          correctCount++
        } else if (predictedWinner === actualWinner) {
          winnerOnlyCount++
          correctCount++
        } else {
          incorrectCount++
        }
      }

      const completedCount = completedPredictions.filter(
        p => p.matches.home_score_ft !== null
      ).length
      const accuracy = completedCount > 0
        ? Math.round((correctCount / completedCount) * 100)
        : null

      return {
        ...pool,
        totalPredictions: poolPredictions.length,
        accuracy,
        exactCount,
        winnerGdCount,
        winnerOnlyCount,
        incorrectCount,
        completedCount,
      }
    })
  }, [poolMemberships, predictions])

  // Aggregate prediction breakdown
  const totals = useMemo(() => {
    let exact = 0, winnerGd = 0, winnerOnly = 0, incorrect = 0, completed = 0
    for (const ps of poolStats) {
      exact += ps.exactCount
      winnerGd += ps.winnerGdCount
      winnerOnly += ps.winnerOnlyCount
      incorrect += ps.incorrectCount
      completed += ps.completedCount
    }
    const correct = exact + winnerGd + winnerOnly
    const accuracy = completed > 0 ? Math.round((correct / completed) * 100) : null
    return { exact, winnerGd, winnerOnly, incorrect, completed, accuracy }
  }, [poolStats])

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-2xl font-bold text-neutral-900 mb-1">Your Statistics</h3>
        <p className="text-neutral-600 text-sm mb-6">Your performance across all pools</p>
      </div>

      {/* Overview stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card>
          <p className="text-xs sm:text-sm text-neutral-600 mb-1">Total Pools</p>
          <p className="text-2xl sm:text-3xl font-bold text-primary-600">{totalPools}</p>
          <p className="text-xs text-neutral-500">Active</p>
        </Card>
        <Card>
          <p className="text-xs sm:text-sm text-neutral-600 mb-1">Total Points</p>
          <p className="text-2xl sm:text-3xl font-bold text-success-600">{totalPoints}</p>
          <p className="text-xs text-neutral-500">Across all pools</p>
        </Card>
        <Card>
          <p className="text-xs sm:text-sm text-neutral-600 mb-1">Predictions</p>
          <p className="text-2xl sm:text-3xl font-bold text-accent-500">{totalPredictions}</p>
          <p className="text-xs text-neutral-500">Submitted</p>
        </Card>
        <Card>
          <p className="text-xs sm:text-sm text-neutral-600 mb-1">Best Rank</p>
          <p className="text-2xl sm:text-3xl font-bold text-warning-600">
            {bestPool ? `#${bestPool.current_rank}` : '--'}
          </p>
          <p className="text-xs text-neutral-500 truncate">
            {bestPool ? bestPool.pool_name : 'No rank yet'}
          </p>
        </Card>
      </div>

      {/* Pool breakdown table */}
      {poolStats.length > 0 && (
        <Card>
          <h4 className="text-lg font-semibold text-neutral-900 mb-4">Pool Performance</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200">
                  <th className="text-left py-3 px-2 text-neutral-700 font-medium">Pool Name</th>
                  <th className="text-center py-3 px-2 text-neutral-700 font-medium">Rank</th>
                  <th className="text-center py-3 px-2 text-neutral-700 font-medium">Points</th>
                  <th className="text-center py-3 px-2 text-neutral-700 font-medium">Predictions</th>
                  <th className="text-center py-3 px-2 text-neutral-700 font-medium">Accuracy</th>
                </tr>
              </thead>
              <tbody>
                {poolStats.map(pool => (
                  <tr key={pool.pool_id} className="border-b border-neutral-100">
                    <td className="py-3 px-2">
                      <Link
                        href={`/pools/${pool.pool_id}`}
                        className="text-primary-600 hover:underline font-medium"
                      >
                        {pool.pool_name}
                      </Link>
                    </td>
                    <td className="text-center py-3 px-2 text-neutral-700">
                      {pool.current_rank
                        ? `#${pool.current_rank}/${memberCounts[pool.pool_id] ?? '?'}`
                        : '--'}
                    </td>
                    <td className="text-center py-3 px-2 font-semibold text-neutral-900">
                      {pool.total_points}
                    </td>
                    <td className="text-center py-3 px-2 text-neutral-700">
                      {pool.totalPredictions}/{totalMatchCount}
                    </td>
                    <td className="text-center py-3 px-2">
                      {pool.accuracy !== null ? (
                        <span className="font-semibold text-neutral-900">{pool.accuracy}%</span>
                      ) : (
                        <span className="text-neutral-500">--</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Prediction accuracy breakdown */}
      {totals.completed > 0 && (
        <Card>
          <h4 className="text-lg font-semibold text-neutral-900 mb-4">Prediction Accuracy</h4>
          <div className="space-y-3">
            <AccuracyRow
              label="Exact Scores"
              icon="🎯"
              count={totals.exact}
              total={totals.completed}
            />
            <AccuracyRow
              label="Winner + GD"
              icon="✓"
              count={totals.winnerGd}
              total={totals.completed}
            />
            <AccuracyRow
              label="Winner Only"
              icon="✓"
              count={totals.winnerOnly}
              total={totals.completed}
            />
            <AccuracyRow
              label="Incorrect"
              icon="✗"
              count={totals.incorrect}
              total={totals.completed}
            />
          </div>
          {totals.accuracy !== null && (
            <div className="mt-4 pt-4 border-t border-neutral-200">
              <p className="text-sm text-neutral-600">
                Overall Accuracy:{' '}
                <span className="text-lg font-bold text-neutral-900">{totals.accuracy}%</span>
              </p>
            </div>
          )}
        </Card>
      )}

      {/* Empty state */}
      {poolStats.length === 0 && (
        <Card padding="lg" className="text-center">
          <p className="text-neutral-600 text-lg mb-2">No statistics yet</p>
          <p className="text-neutral-500">Join a pool and make predictions to see your stats.</p>
        </Card>
      )}
    </div>
  )
}

function AccuracyRow({ label, icon, count, total }: { label: string; icon: string; count: number; total: number }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <span className="w-5 sm:w-6 text-center text-sm">{icon}</span>
      <span className="text-xs sm:text-sm text-neutral-700 w-20 sm:w-32 shrink-0">{label}</span>
      <div className="flex-1 bg-neutral-100 rounded-full h-2 min-w-0">
        <div
          className="bg-primary-500 rounded-full h-2 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs sm:text-sm text-neutral-600 w-16 sm:w-20 text-right shrink-0">
        {count} ({pct}%)
      </span>
    </div>
  )
}

// =====================
// TAB 3: PREDICTION HISTORY
// =====================

function PredictionHistoryTab({
  predictions,
  poolMemberships,
  poolSettingsMap,
}: {
  predictions: Prediction[]
  poolMemberships: PoolMembership[]
  poolSettingsMap: Record<string, any>
}) {
  const [poolFilter, setPoolFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [stageFilter, setStageFilter] = useState<string>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const perPage = 20

  // Build member_id to pool map and pool settings map
  const memberToPool = useMemo(() => {
    const map: Record<string, PoolMembership> = {}
    for (const pm of poolMemberships) {
      map[pm.member_id] = pm
    }
    return map
  }, [poolMemberships])

  // Build member_id to pool settings
  const memberToSettings = useMemo(() => {
    const map: Record<string, PoolSettings> = {}
    for (const pm of poolMemberships) {
      const raw = poolSettingsMap[pm.pool_id]
      map[pm.member_id] = raw
        ? { ...DEFAULT_POOL_SETTINGS, ...raw }
        : DEFAULT_POOL_SETTINGS
    }
    return map
  }, [poolMemberships, poolSettingsMap])

  // Get unique stages from predictions
  const stages = useMemo(() => {
    const set = new Set<string>()
    for (const p of predictions) {
      set.add(p.matches.stage)
    }
    return Array.from(set)
  }, [predictions])

  // Classify each prediction
  const classified = useMemo(() => {
    return predictions.map(pred => {
      const m = pred.matches
      let classification: 'exact' | 'winner_gd' | 'winner' | 'incorrect' | 'pending' = 'pending'
      let pointsDisplay = 'Pending'

      if ((m.status === 'completed' || m.status === 'live') && m.home_score_ft !== null && m.away_score_ft !== null) {
        const settings = memberToSettings[pred.member_id] ?? DEFAULT_POOL_SETTINGS
        const result = calculatePoints(
          pred.predicted_home_score,
          pred.predicted_away_score,
          m.home_score_ft,
          m.away_score_ft,
          m.stage,
          settings
        )

        if (result.type === 'exact') {
          classification = 'exact'
          pointsDisplay = `+${result.points} 🎯`
        } else if (result.type === 'winner_gd') {
          classification = 'winner_gd'
          pointsDisplay = `+${result.points} ✓`
        } else if (result.type === 'winner') {
          classification = 'winner'
          pointsDisplay = `+${result.points} ✓`
        } else {
          classification = 'incorrect'
          pointsDisplay = '+0 ✗'
        }
      }

      return { ...pred, classification, pointsDisplay }
    })
  }, [predictions, memberToSettings])

  // Apply filters
  const filtered = useMemo(() => {
    let result = classified

    if (poolFilter !== 'all') {
      const poolMemberIds = poolMemberships
        .filter(pm => pm.pool_id === poolFilter)
        .map(pm => pm.member_id)
      result = result.filter(p => poolMemberIds.includes(p.member_id))
    }

    if (statusFilter !== 'all') {
      if (statusFilter === 'correct') {
        result = result.filter(p => ['exact', 'winner_gd', 'winner'].includes(p.classification))
      } else if (statusFilter === 'incorrect') {
        result = result.filter(p => p.classification === 'incorrect')
      } else if (statusFilter === 'pending') {
        result = result.filter(p => p.classification === 'pending')
      }
    }

    if (stageFilter !== 'all') {
      result = result.filter(p => p.matches.stage === stageFilter)
    }

    return result
  }, [classified, poolFilter, statusFilter, stageFilter, poolMemberships])

  // Pagination
  const totalPages = Math.ceil(filtered.length / perPage)
  const paginated = filtered.slice((currentPage - 1) * perPage, currentPage * perPage)

  // Reset page when filters change
  const handleFilterChange = (setter: (v: string) => void, value: string) => {
    setter(value)
    setCurrentPage(1)
  }

  const rowBg = (classification: string) => {
    switch (classification) {
      case 'exact': return 'bg-warning-50'
      case 'winner_gd':
      case 'winner': return 'bg-success-50'
      case 'incorrect': return 'bg-danger-50'
      default: return ''
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-2xl font-bold text-neutral-900 mb-1">Prediction History</h3>
        <p className="text-neutral-600 text-sm mb-6">All your predictions across all pools</p>
      </div>

      {/* Filters */}
      <Card>
        <div className="flex flex-wrap gap-4">
          {/* Pool filter */}
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">Pool</label>
            <select
              value={poolFilter}
              onChange={e => handleFilterChange(setPoolFilter, e.target.value)}
              className="border border-neutral-300 rounded-lg px-3 py-2 text-sm text-neutral-900 bg-white"
            >
              <option value="all">All Pools</option>
              {poolMemberships.map(pm => (
                <option key={pm.pool_id} value={pm.pool_id}>{pm.pool_name}</option>
              ))}
            </select>
          </div>

          {/* Status filter */}
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">Status</label>
            <div className="flex gap-1">
              {(['all', 'correct', 'incorrect', 'pending'] as const).map(status => (
                <button
                  key={status}
                  onClick={() => handleFilterChange(setStatusFilter, status)}
                  className={`px-3 py-2 text-sm rounded-lg font-medium transition ${
                    statusFilter === status
                      ? 'bg-primary-600 text-white'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                  }`}
                >
                  {status === 'all' ? 'All' : status === 'correct' ? 'Correct ✓' : status === 'incorrect' ? 'Incorrect ✗' : 'Pending'}
                </button>
              ))}
            </div>
          </div>

          {/* Stage filter */}
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">Stage</label>
            <select
              value={stageFilter}
              onChange={e => handleFilterChange(setStageFilter, e.target.value)}
              className="border border-neutral-300 rounded-lg px-3 py-2 text-sm text-neutral-900 bg-white"
            >
              <option value="all">All Stages</option>
              {stages.map(stage => (
                <option key={stage} value={stage}>{formatStage(stage)}</option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {/* Predictions table */}
      <Card>
        {paginated.length === 0 ? (
          <p className="text-neutral-600 text-center py-8">No predictions found matching your filters.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200">
                    <th className="text-left py-3 px-2 text-neutral-700 font-medium">Match</th>
                    <th className="text-center py-3 px-2 text-neutral-700 font-medium">Your Prediction</th>
                    <th className="text-center py-3 px-2 text-neutral-700 font-medium">Result</th>
                    <th className="text-center py-3 px-2 text-neutral-700 font-medium">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map(pred => {
                    const m = pred.matches
                    const homeTeam = m.home_team?.country_name ?? m.home_team_placeholder ?? 'TBD'
                    const awayTeam = m.away_team?.country_name ?? m.away_team_placeholder ?? 'TBD'
                    const result = m.home_score_ft !== null && m.away_score_ft !== null
                      ? `${m.home_score_ft}-${m.away_score_ft}`
                      : '-'

                    return (
                      <tr key={pred.prediction_id} className={`border-b border-neutral-100 ${rowBg(pred.classification)}`}>
                        <td className="py-3 px-2">
                          <p className="font-medium text-neutral-900">{homeTeam} vs {awayTeam}</p>
                          <p className="text-xs text-neutral-500">
                            {formatDate(m.match_date)} &middot; {formatStage(m.stage)}
                            {m.group_letter ? ` (Group ${m.group_letter})` : ''}
                          </p>
                        </td>
                        <td className="text-center py-3 px-2 font-semibold text-neutral-900">
                          {pred.predicted_home_score}-{pred.predicted_away_score}
                        </td>
                        <td className="text-center py-3 px-2 text-neutral-700">{result}</td>
                        <td className="text-center py-3 px-2 font-medium">
                          {pred.classification === 'exact' && (
                            <span className="text-warning-600">{pred.pointsDisplay}</span>
                          )}
                          {(pred.classification === 'winner_gd' || pred.classification === 'winner') && (
                            <span className="text-success-600">{pred.pointsDisplay}</span>
                          )}
                          {pred.classification === 'incorrect' && (
                            <span className="text-danger-600">{pred.pointsDisplay}</span>
                          )}
                          {pred.classification === 'pending' && (
                            <span className="text-neutral-500">{pred.pointsDisplay}</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-neutral-200">
                <p className="text-sm text-neutral-600">
                  Showing {(currentPage - 1) * perPage + 1}-{Math.min(currentPage * perPage, filtered.length)} of {filtered.length}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1 text-sm rounded border border-neutral-300 text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1 text-sm rounded border border-neutral-300 text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  )
}

// =====================
// TAB 4: ACCOUNT SETTINGS
// =====================

function AccountSettingsTab({
  profile,
  poolMemberships,
  supabase,
  router,
}: {
  profile: Profile
  poolMemberships: PoolMembership[]
  supabase: any
  router: any
}) {
  const { theme, toggleTheme } = useTheme()

  // Password change state
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null)

  // Delete account state
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  async function handlePasswordChange() {
    setPasswordError(null)
    setPasswordSuccess(null)

    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.')
      return
    }

    setPasswordLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      })
      if (error) throw error

      setPasswordSuccess('Password updated successfully!')
      setNewPassword('')
      setConfirmPassword('')
      setTimeout(() => setShowPasswordModal(false), 1500)
    } catch (err: any) {
      setPasswordError(err.message || 'Failed to update password.')
    } finally {
      setPasswordLoading(false)
    }
  }

  async function handleDeleteAccount() {
    setDeleteError(null)
    setDeleteLoading(true)

    try {
      // Get all member IDs for this user
      const memberIds = poolMemberships.map(pm => pm.member_id)

      // 1. Delete all predictions
      if (memberIds.length > 0) {
        const { error: predError } = await supabase
          .from('predictions')
          .delete()
          .in('member_id', memberIds)
        if (predError) throw predError
      }

      // 2. Delete pool memberships
      const { error: memberError } = await supabase
        .from('pool_members')
        .delete()
        .eq('user_id', profile.user_id)
      if (memberError) throw memberError

      // 3. Delete user record
      const { error: userError } = await supabase
        .from('users')
        .delete()
        .eq('user_id', profile.user_id)
      if (userError) throw userError

      // 4. Sign out and redirect
      await supabase.auth.signOut()
      router.push('/?deleted=true')
    } catch (err: any) {
      setDeleteError(err.message || 'Failed to delete account.')
      setDeleteLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-2xl font-bold text-neutral-900 mb-1">Account Settings</h3>
        <p className="text-neutral-600 text-sm mb-6">Manage your account and security</p>
      </div>

      {/* Security section */}
      <Card>
        <h4 className="text-lg font-semibold text-neutral-900 mb-4">Security</h4>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-neutral-700">Password</p>
            <p className="text-xs text-neutral-500">Change your account password</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowPasswordModal(true)}>
            Change Password
          </Button>
        </div>
      </Card>

      {/* Appearance */}
      <Card>
        <h4 className="text-lg font-semibold text-neutral-900 mb-4">Appearance</h4>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-neutral-700">Color Palette</p>
            <p className="text-xs text-neutral-500">
              {theme === 'new' ? 'Modern palette with emerald, slate & gold tones' : 'Classic palette with green, gray & purple tones'}
            </p>
          </div>
          <button
            onClick={toggleTheme}
            className="relative inline-flex h-8 w-[120px] items-center rounded-full border border-neutral-300 bg-neutral-100 p-0.5 transition-colors"
          >
            <span
              className={`absolute top-0.5 h-7 w-[58px] rounded-full bg-primary-600 shadow transition-transform duration-200 ${
                theme === 'classic' ? 'translate-x-[58px]' : 'translate-x-0'
              }`}
            />
            <span className={`relative z-10 flex-1 text-center text-xs font-medium transition-colors ${theme === 'new' ? 'text-white' : 'text-neutral-600'}`}>
              Modern
            </span>
            <span className={`relative z-10 flex-1 text-center text-xs font-medium transition-colors ${theme === 'classic' ? 'text-white' : 'text-neutral-600'}`}>
              Classic
            </span>
          </button>
        </div>
      </Card>

      {/* Notifications (coming soon) */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <h4 className="text-lg font-semibold text-neutral-900">Notifications</h4>
          <Badge variant="gray">Coming Soon</Badge>
        </div>
        <div className="space-y-3 opacity-50">
          <label className="flex items-center gap-3 cursor-not-allowed">
            <input type="checkbox" disabled className="rounded border-neutral-300" />
            <span className="text-sm text-neutral-700">Match result notifications</span>
          </label>
          <label className="flex items-center gap-3 cursor-not-allowed">
            <input type="checkbox" disabled className="rounded border-neutral-300" />
            <span className="text-sm text-neutral-700">Deadline reminders</span>
          </label>
          <label className="flex items-center gap-3 cursor-not-allowed">
            <input type="checkbox" disabled className="rounded border-neutral-300" />
            <span className="text-sm text-neutral-700">Rank change alerts</span>
          </label>
        </div>
      </Card>

      {/* Danger zone */}
      <Card className="!border !border-danger-200">
        <h4 className="text-lg font-semibold text-danger-600 mb-2">Danger Zone</h4>
        <p className="text-sm text-neutral-600 mb-4">
          Permanently delete your account and all your data. This action cannot be undone.
        </p>
        <Button
          variant="gray"
          onClick={() => setShowDeleteModal(true)}
          className="!bg-danger-600 !text-white hover:!bg-danger-700"
        >
          Delete My Account
        </Button>
      </Card>

      {/* Password change modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 sm:p-4">
          <div className="bg-white rounded-t-xl sm:rounded-xl shadow-xl sm:max-w-md w-full p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-neutral-900 mb-4">Change Password</h3>

            {passwordError && <Alert variant="error">{passwordError}</Alert>}
            {passwordSuccess && <Alert variant="success">{passwordSuccess}</Alert>}

            <div className="space-y-4">
              <FormField label="New Password *" helperText="Must be at least 8 characters">
                <Input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                />
              </FormField>
              <FormField label="Confirm New Password *">
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                />
              </FormField>
            </div>

            <div className="flex gap-3 mt-6">
              <Button
                variant="gray"
                onClick={() => {
                  setShowPasswordModal(false)
                  setNewPassword('')
                  setConfirmPassword('')
                  setPasswordError(null)
                  setPasswordSuccess(null)
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handlePasswordChange}
                disabled={passwordLoading || !newPassword || !confirmPassword}
                loading={passwordLoading}
                loadingText="Updating..."
              >
                Update Password
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete account modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 sm:p-4">
          <div className="bg-white rounded-t-xl sm:rounded-xl shadow-xl sm:max-w-md w-full p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-danger-600 mb-2">Delete Account - PERMANENT</h3>
            <p className="text-sm text-neutral-600 mb-4">
              Are you absolutely sure? This will:
            </p>
            <ul className="text-sm text-neutral-600 mb-4 space-y-1">
              <li>• Delete all your predictions</li>
              <li>• Remove you from all pools</li>
              <li>• Permanently delete your account</li>
            </ul>

            {deleteError && <Alert variant="error">{deleteError}</Alert>}

            <FormField
              label={`Type your username to confirm`}
              helperText={`Must type: ${profile.username}`}
            >
              <Input
                type="text"
                value={deleteConfirmation}
                onChange={e => setDeleteConfirmation(e.target.value)}
                placeholder={profile.username}
              />
            </FormField>

            <div className="flex gap-3 mt-6">
              <Button
                variant="gray"
                onClick={() => {
                  setShowDeleteModal(false)
                  setDeleteConfirmation('')
                  setDeleteError(null)
                }}
              >
                Cancel
              </Button>
              <Button
                variant="gray"
                onClick={handleDeleteAccount}
                disabled={deleteLoading || deleteConfirmation !== profile.username}
                loading={deleteLoading}
                loadingText="Deleting..."
                className="!bg-danger-600 !text-white hover:!bg-danger-700 disabled:!bg-danger-300"
              >
                I Understand, Delete My Account
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
