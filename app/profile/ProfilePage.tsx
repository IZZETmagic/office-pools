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
import { AppHeader } from '@/components/ui/AppHeader'
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
  is_super_admin?: boolean
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
  prediction_count: number
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

type PlayerScoreEntry = {
  match_points: number
  bonus_points: number
  total_points: number
}

type ProfilePageProps = {
  profile: Profile
  poolMemberships: PoolMembership[]
  memberCounts: Record<string, number>
  predictions: Prediction[]
  totalMatchCount: number
  poolSettingsMap: Record<string, any>
  playerScoresMap: Record<string, PlayerScoreEntry>
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
// TAB CONFIG
// =====================

const TAB_CONFIG: { key: Tab; label: string; icon: React.ReactNode }[] = [
  {
    key: 'edit',
    label: 'Edit Profile',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
      </svg>
    ),
  },
  {
    key: 'statistics',
    label: 'Statistics',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
  },
  {
    key: 'predictions',
    label: 'Prediction History',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    key: 'settings',
    label: 'Account Settings',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
]

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
  playerScoresMap,
}: ProfilePageProps) {
  const [activeTab, setActiveTab] = useState<Tab>('edit')
  const router = useRouter()
  const supabase = createClient()

  return (
    <div className="min-h-screen bg-neutral-50">
      <AppHeader isSuperAdmin={profile.is_super_admin} />

      {/* Hero header */}
      <div className="bg-gradient-to-br from-primary-600 via-primary-700 to-success-600">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
          <div className="flex items-center gap-5">
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white text-2xl sm:text-3xl font-bold border-2 border-white/30 shadow-lg shrink-0">
              {getInitials(profile.full_name, profile.username)}
            </div>
            <div className="min-w-0">
              <h2 className="text-2xl sm:text-3xl font-bold text-white truncate">
                {profile.full_name || profile.username}
              </h2>
              <p className="text-primary-100 text-sm sm:text-base">@{profile.username}</p>
              <p className="text-primary-200 text-xs sm:text-sm mt-1">
                Member since {formatMemberSince(profile.created_at)}
              </p>
            </div>
          </div>

          {/* Quick stats in hero */}
          <div className="grid grid-cols-3 gap-3 mt-6">
            <div className="bg-white/10 backdrop-blur-sm rounded-lg px-3 py-2.5 text-center border border-white/10">
              <p className="text-xl sm:text-2xl font-bold text-white">{poolMemberships.length}</p>
              <p className="text-xs text-primary-200">Pools</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-lg px-3 py-2.5 text-center border border-white/10">
              <p className="text-xl sm:text-2xl font-bold text-white">
                {poolMemberships.reduce((sum, p) => {
                  const ps = playerScoresMap[p.member_id]
                  return sum + (ps ? ps.total_points : p.total_points)
                }, 0)}
              </p>
              <p className="text-xs text-primary-200">Total Points</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-lg px-3 py-2.5 text-center border border-white/10">
              <p className="text-xl sm:text-2xl font-bold text-white">
                {poolMemberships.reduce((sum, p) => sum + p.prediction_count, 0)}
              </p>
              <p className="text-xs text-primary-200">Predictions</p>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="flex flex-col md:flex-row gap-6">
          {/* Left sidebar - tab navigation */}
          <div className="w-full md:w-56 shrink-0">
            <Card padding="md" className="!p-2">
              <div className="flex flex-row md:flex-col gap-1 overflow-x-auto">
                {TAB_CONFIG.map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`w-full text-left px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg text-sm font-medium transition-colors flex items-center gap-2.5 whitespace-nowrap ${
                      activeTab === tab.key
                        ? 'bg-primary-600 text-white shadow-sm'
                        : 'text-neutral-700 hover:bg-neutral-100'
                    }`}
                  >
                    {tab.icon}
                    <span className="hidden sm:inline">{tab.label}</span>
                  </button>
                ))}
              </div>
            </Card>
          </div>

          {/* Main content area */}
          <div className="flex-1 min-w-0">
            {activeTab === 'edit' && (
              <EditProfileTab profile={profile} supabase={supabase} router={router} />
            )}
            {activeTab === 'statistics' && (
              <StatisticsTab
                poolMemberships={poolMemberships}
                memberCounts={memberCounts}
                predictions={predictions}
                totalMatchCount={totalMatchCount}
                playerScoresMap={playerScoresMap}
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

    if (emailChanged && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address.')
      return
    }

    setSaving(true)

    try {
      const { error: profileError } = await supabase
        .from('users')
        .update({
          username,
          full_name: fullName || null,
        })
        .eq('user_id', profile.user_id)

      if (profileError) throw profileError

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
      <div className="flex items-center gap-3 mb-6 pb-4 border-b border-neutral-100">
        <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center">
          <svg className="w-5 h-5 text-primary-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
          </svg>
        </div>
        <div>
          <h3 className="text-lg font-bold text-neutral-900">Edit Profile</h3>
          <p className="text-neutral-500 text-sm">Update your personal information</p>
        </div>
      </div>

      {error && <Alert variant="error">{error}</Alert>}
      {success && <Alert variant="success">{success}</Alert>}

      <div className="space-y-5">
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
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-success-600 font-medium">Available</span>
            )}
            {usernameStatus === 'taken' && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-danger-600 font-medium">Taken</span>
            )}
          </div>
        </FormField>

        <FormField label="Full Name">
          <Input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            maxLength={100}
            placeholder="Your full name"
          />
        </FormField>

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
  playerScoresMap,
}: {
  poolMemberships: PoolMembership[]
  memberCounts: Record<string, number>
  predictions: Prediction[]
  totalMatchCount: number
  playerScoresMap: Record<string, PlayerScoreEntry>
}) {
  const totalPools = poolMemberships.length
  const totalPoints = poolMemberships.reduce((sum, p) => {
    const ps = playerScoresMap[p.member_id]
    return sum + (ps ? ps.total_points : p.total_points)
  }, 0)
  const totalPredictions = poolMemberships.reduce((sum, p) => sum + p.prediction_count, 0)

  const bestPool = poolMemberships.reduce<PoolMembership | null>((best, p) => {
    if (p.current_rank === null) return best
    if (!best || best.current_rank === null) return p
    return p.current_rank < best.current_rank ? p : best
  }, null)

  const poolStats = useMemo(() => {
    return poolMemberships.map(pool => {
      const poolPredictions = predictions.filter(p => p.member_id === pool.member_id)
      const completedPredictions = poolPredictions.filter(
        p => p.matches?.status === 'completed'
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
        p => p.matches?.home_score_ft !== null
      ).length
      const accuracy = completedCount > 0
        ? Math.round((correctCount / completedCount) * 100)
        : null

      // Use server-provided prediction_count as primary source,
      // fall back to client-side filtered count
      return {
        ...pool,
        totalPredictions: pool.prediction_count || poolPredictions.length,
        accuracy,
        exactCount,
        winnerGdCount,
        winnerOnlyCount,
        incorrectCount,
        completedCount,
      }
    })
  }, [poolMemberships, predictions])

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
      {/* Section header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center">
          <svg className="w-5 h-5 text-primary-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
          </svg>
        </div>
        <div>
          <h3 className="text-lg font-bold text-neutral-900">Your Statistics</h3>
          <p className="text-neutral-500 text-sm">Performance across all pools</p>
        </div>
      </div>

      {/* Overview stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-primary-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-bold text-primary-600">{totalPools}</p>
              <p className="text-xs text-neutral-500">Active Pools</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-success-50 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-success-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-bold text-success-600">{totalPoints}</p>
              <p className="text-xs text-neutral-500">Total Points</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-accent-50 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-accent-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-bold text-accent-500">{totalPredictions}</p>
              <p className="text-xs text-neutral-500">Predictions</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-warning-50 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-warning-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M18.75 4.236c.982.143 1.954.317 2.916.52A6.003 6.003 0 0016.27 9.728M18.75 4.236V4.5c0 2.108-.966 3.99-2.48 5.228m0 0a6.003 6.003 0 01-3.77 1.522m0 0a6.003 6.003 0 01-3.77-1.522" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-bold text-warning-600">
                {bestPool ? `#${bestPool.current_rank}` : '--'}
              </p>
              <p className="text-xs text-neutral-500 truncate">
                {bestPool ? bestPool.pool_name : 'No rank yet'}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Pool breakdown */}
      {poolStats.length > 0 && (
        <Card>
          <h4 className="text-base font-semibold text-neutral-900 mb-4">Pool Performance</h4>
          <div className="overflow-x-auto -mx-6">
            <table className="w-full text-sm min-w-[480px]">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50">
                  <th className="text-left py-3 px-4 sm:px-6 text-neutral-600 font-medium text-xs uppercase tracking-wider">Pool</th>
                  <th className="text-center py-3 px-3 text-neutral-600 font-medium text-xs uppercase tracking-wider">Rank</th>
                  <th className="text-center py-3 px-3 text-neutral-600 font-medium text-xs uppercase tracking-wider">Points</th>
                  <th className="text-center py-3 px-3 text-neutral-600 font-medium text-xs uppercase tracking-wider">Predictions</th>
                  <th className="text-center py-3 px-3 sm:px-6 text-neutral-600 font-medium text-xs uppercase tracking-wider">Accuracy</th>
                </tr>
              </thead>
              <tbody>
                {poolStats.map(pool => (
                  <tr key={pool.pool_id} className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors">
                    <td className="py-3 px-4 sm:px-6">
                      <Link
                        href={`/pools/${pool.pool_id}`}
                        className="text-primary-600 hover:text-primary-700 hover:underline font-medium"
                      >
                        {pool.pool_name}
                      </Link>
                    </td>
                    <td className="text-center py-3 px-3">
                      {pool.current_rank ? (
                        <span className="inline-flex items-center gap-1">
                          {pool.current_rank <= 3 && (
                            <span className="text-sm">{pool.current_rank === 1 ? '🥇' : pool.current_rank === 2 ? '🥈' : '🥉'}</span>
                          )}
                          <span className="text-neutral-900 font-medium">#{pool.current_rank}</span>
                          <span className="text-neutral-400 text-xs">/{memberCounts[pool.pool_id] ?? '?'}</span>
                        </span>
                      ) : (
                        <span className="text-neutral-400">--</span>
                      )}
                    </td>
                    <td className="text-center py-3 px-3 font-semibold text-neutral-900">
                      {(() => {
                        const ps = playerScoresMap[pool.member_id]
                        const total = ps ? ps.total_points : pool.total_points
                        const bonus = ps?.bonus_points ?? 0
                        return (
                          <span title={bonus > 0 ? `Match: ${ps!.match_points} + Bonus: ${bonus}` : undefined}>
                            {total}
                            {bonus > 0 && (
                              <span className="text-xs text-success-600 ml-1">+{bonus}</span>
                            )}
                          </span>
                        )
                      })()}
                    </td>
                    <td className="text-center py-3 px-3 text-neutral-700">
                      {pool.totalPredictions}/{totalMatchCount}
                    </td>
                    <td className="text-center py-3 px-3 sm:px-6">
                      {pool.accuracy !== null ? (
                        <span className={`font-semibold ${
                          pool.accuracy >= 70 ? 'text-success-600' :
                          pool.accuracy >= 40 ? 'text-warning-600' :
                          'text-neutral-900'
                        }`}>{pool.accuracy}%</span>
                      ) : (
                        <span className="text-neutral-400">--</span>
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
          <h4 className="text-base font-semibold text-neutral-900 mb-4">Prediction Accuracy</h4>
          <div className="space-y-3">
            <AccuracyRow label="Exact Scores" color="bg-accent-500" count={totals.exact} total={totals.completed} />
            <AccuracyRow label="Winner + GD" color="bg-success-500" count={totals.winnerGd} total={totals.completed} />
            <AccuracyRow label="Winner Only" color="bg-primary-500" count={totals.winnerOnly} total={totals.completed} />
            <AccuracyRow label="Incorrect" color="bg-danger-400" count={totals.incorrect} total={totals.completed} />
          </div>
          {totals.accuracy !== null && (
            <div className="mt-4 pt-4 border-t border-neutral-100">
              <div className="flex items-center justify-between">
                <p className="text-sm text-neutral-600">Overall Accuracy</p>
                <p className={`text-xl font-bold ${
                  totals.accuracy >= 70 ? 'text-success-600' :
                  totals.accuracy >= 40 ? 'text-warning-600' :
                  'text-neutral-900'
                }`}>{totals.accuracy}%</p>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Empty state */}
      {poolStats.length === 0 && (
        <Card padding="lg" className="text-center">
          <div className="w-16 h-16 bg-neutral-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-neutral-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
          </div>
          <p className="text-neutral-700 text-lg font-medium mb-1">No statistics yet</p>
          <p className="text-neutral-500 text-sm">Join a pool and make predictions to see your stats.</p>
        </Card>
      )}
    </div>
  )
}

function AccuracyRow({ label, color, count, total }: { label: string; color: string; count: number; total: number }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-neutral-700 w-28 sm:w-32 shrink-0">{label}</span>
      <div className="flex-1 bg-neutral-100 rounded-full h-2.5 min-w-0">
        <div
          className={`${color} rounded-full h-2.5 transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-sm font-medium text-neutral-700 w-20 text-right shrink-0">
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

  const memberToPool = useMemo(() => {
    const map: Record<string, PoolMembership> = {}
    for (const pm of poolMemberships) {
      map[pm.member_id] = pm
    }
    return map
  }, [poolMemberships])

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

  const stages = useMemo(() => {
    const set = new Set<string>()
    for (const p of predictions) {
      if (p.matches) set.add(p.matches.stage)
    }
    return Array.from(set)
  }, [predictions])

  const classified = useMemo(() => {
    return predictions.filter(pred => pred.matches).map(pred => {
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
          pointsDisplay = `+${result.points}`
        } else if (result.type === 'winner_gd') {
          classification = 'winner_gd'
          pointsDisplay = `+${result.points}`
        } else if (result.type === 'winner') {
          classification = 'winner'
          pointsDisplay = `+${result.points}`
        } else {
          classification = 'incorrect'
          pointsDisplay = '+0'
        }
      }

      return { ...pred, classification, pointsDisplay }
    })
  }, [predictions, memberToSettings])

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
      result = result.filter(p => p.matches?.stage === stageFilter)
    }

    return result
  }, [classified, poolFilter, statusFilter, stageFilter, poolMemberships])

  const totalPages = Math.ceil(filtered.length / perPage)
  const paginated = filtered.slice((currentPage - 1) * perPage, currentPage * perPage)

  const handleFilterChange = (setter: (v: string) => void, value: string) => {
    setter(value)
    setCurrentPage(1)
  }

  const classificationBadge = (classification: string) => {
    switch (classification) {
      case 'exact': return <Badge variant="yellow">Exact</Badge>
      case 'winner_gd': return <Badge variant="green">W+GD</Badge>
      case 'winner': return <Badge variant="green">Winner</Badge>
      case 'incorrect': return <Badge variant="gray">Miss</Badge>
      default: return <Badge variant="gray">Pending</Badge>
    }
  }

  const pointsColor = (classification: string) => {
    switch (classification) {
      case 'exact': return 'text-accent-700 font-bold'
      case 'winner_gd':
      case 'winner': return 'text-success-600 font-semibold'
      case 'incorrect': return 'text-danger-500'
      default: return 'text-neutral-400'
    }
  }

  return (
    <div className="space-y-6">
      {/* Section header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center">
          <svg className="w-5 h-5 text-primary-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div>
          <h3 className="text-lg font-bold text-neutral-900">Prediction History</h3>
          <p className="text-neutral-500 text-sm">All your predictions across all pools</p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1.5 uppercase tracking-wider">Pool</label>
            <select
              value={poolFilter}
              onChange={e => handleFilterChange(setPoolFilter, e.target.value)}
              className="border border-neutral-300 rounded-lg px-3 py-2 text-sm text-neutral-900 bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition"
            >
              <option value="all">All Pools</option>
              {poolMemberships.map(pm => (
                <option key={pm.pool_id} value={pm.pool_id}>{pm.pool_name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1.5 uppercase tracking-wider">Status</label>
            <div className="flex gap-1">
              {(['all', 'correct', 'incorrect', 'pending'] as const).map(status => (
                <button
                  key={status}
                  onClick={() => handleFilterChange(setStatusFilter, status)}
                  className={`px-3 py-2 text-sm rounded-lg font-medium transition-colors ${
                    statusFilter === status
                      ? 'bg-primary-600 text-white shadow-sm'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                  }`}
                >
                  {status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1.5 uppercase tracking-wider">Stage</label>
            <select
              value={stageFilter}
              onChange={e => handleFilterChange(setStageFilter, e.target.value)}
              className="border border-neutral-300 rounded-lg px-3 py-2 text-sm text-neutral-900 bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition"
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
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-neutral-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-neutral-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
            </div>
            <p className="text-neutral-700 font-medium mb-1">No predictions found</p>
            <p className="text-neutral-500 text-sm">Try adjusting your filters.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto -mx-6">
              <table className="w-full text-sm min-w-[520px]">
                <thead>
                  <tr className="border-b border-neutral-200 bg-neutral-50">
                    <th className="text-left py-3 px-4 sm:px-6 text-neutral-600 font-medium text-xs uppercase tracking-wider">Match</th>
                    <th className="text-center py-3 px-3 text-neutral-600 font-medium text-xs uppercase tracking-wider">Prediction</th>
                    <th className="text-center py-3 px-3 text-neutral-600 font-medium text-xs uppercase tracking-wider">Result</th>
                    <th className="text-center py-3 px-3 text-neutral-600 font-medium text-xs uppercase tracking-wider">Status</th>
                    <th className="text-center py-3 px-3 sm:px-6 text-neutral-600 font-medium text-xs uppercase tracking-wider">Points</th>
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
                      <tr key={pred.prediction_id} className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors">
                        <td className="py-3 px-4 sm:px-6">
                          <p className="font-medium text-neutral-900">{homeTeam} vs {awayTeam}</p>
                          <p className="text-xs text-neutral-500 mt-0.5">
                            {formatDate(m.match_date)} &middot; {formatStage(m.stage)}
                            {m.group_letter ? ` (Group ${m.group_letter})` : ''}
                          </p>
                        </td>
                        <td className="text-center py-3 px-3">
                          <span className="inline-block bg-neutral-100 rounded-md px-2.5 py-1 font-mono font-bold text-neutral-900">
                            {pred.predicted_home_score}-{pred.predicted_away_score}
                          </span>
                        </td>
                        <td className="text-center py-3 px-3">
                          <span className="inline-block bg-neutral-100 rounded-md px-2.5 py-1 font-mono text-neutral-700">
                            {result}
                          </span>
                        </td>
                        <td className="text-center py-3 px-3">
                          {classificationBadge(pred.classification)}
                        </td>
                        <td className={`text-center py-3 px-3 sm:px-6 ${pointsColor(pred.classification)}`}>
                          {pred.pointsDisplay}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-neutral-100">
                <p className="text-sm text-neutral-500">
                  Showing {(currentPage - 1) * perPage + 1}-{Math.min(currentPage * perPage, filtered.length)} of {filtered.length}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 text-sm rounded-lg border border-neutral-300 text-neutral-700 hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1.5 text-sm rounded-lg border border-neutral-300 text-neutral-700 hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
  const [darkMode, setDarkMode] = useState(false)

  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null)

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
      const response = await fetch('/api/account/delete', {
        method: 'DELETE',
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to delete account')
      }

      router.push('/account-deleted')
    } catch (err: any) {
      setDeleteError(err.message || 'Failed to delete account.')
      setDeleteLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Section header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center">
          <svg className="w-5 h-5 text-primary-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
        <div>
          <h3 className="text-lg font-bold text-neutral-900">Account Settings</h3>
          <p className="text-neutral-500 text-sm">Manage your account and security</p>
        </div>
      </div>

      {/* Security section */}
      <Card>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center">
            <svg className="w-4 h-4 text-primary-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
          </div>
          <h4 className="text-base font-semibold text-neutral-900">Security</h4>
        </div>
        <div className="flex items-center justify-between bg-neutral-50 rounded-lg p-4">
          <div>
            <p className="text-sm font-medium text-neutral-700">Password</p>
            <p className="text-xs text-neutral-500 mt-0.5">Change your account password</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowPasswordModal(true)}>
            Change Password
          </Button>
        </div>
      </Card>

      {/* Appearance */}
      <Card>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-accent-50 flex items-center justify-center">
            <svg className="w-4 h-4 text-accent-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.098 19.902a3.75 3.75 0 005.304 0l6.401-6.402M6.75 21A3.75 3.75 0 013 17.25V4.125C3 3.504 3.504 3 4.125 3h5.25c.621 0 1.125.504 1.125 1.125v4.072M6.75 21a3.75 3.75 0 003.75-3.75V8.197M6.75 21h13.125c.621 0 1.125-.504 1.125-1.125v-5.25c0-.621-.504-1.125-1.125-1.125h-4.072M10.5 8.197l2.88-2.88c.438-.439 1.15-.439 1.59 0l3.712 3.713c.44.44.44 1.152 0 1.59l-2.879 2.88M6.75 17.25h.008v.008H6.75v-.008z" />
            </svg>
          </div>
          <h4 className="text-base font-semibold text-neutral-900">Appearance</h4>
          <Badge variant="gray">Coming Soon</Badge>
        </div>
        <div className="flex items-center justify-between bg-neutral-50 rounded-lg p-4 opacity-50">
          <div>
            <p className="text-sm font-medium text-neutral-700">Dark Mode</p>
            <p className="text-xs text-neutral-500 mt-0.5">
              {darkMode ? 'Dark theme enabled' : 'Light theme enabled'}
            </p>
          </div>
          <button
            onClick={() => setDarkMode(!darkMode)}
            className={`relative inline-flex h-8 w-16 items-center rounded-full border border-neutral-300 p-0.5 transition-colors shadow-sm ${
              darkMode ? 'bg-primary-600 border-primary-600' : 'bg-neutral-200'
            }`}
          >
            <span
              className={`inline-flex h-7 w-7 items-center justify-center rounded-full bg-white shadow transition-transform duration-200 ${
                darkMode ? 'translate-x-8' : 'translate-x-0'
              }`}
            >
              {darkMode ? (
                <svg className="w-4 h-4 text-primary-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
                </svg>
              ) : (
                <svg className="w-4 h-4 text-warning-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
                </svg>
              )}
            </span>
          </button>
        </div>
      </Card>

      {/* Notifications */}
      <Card>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-warning-50 flex items-center justify-center">
            <svg className="w-4 h-4 text-warning-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
            </svg>
          </div>
          <h4 className="text-base font-semibold text-neutral-900">Notifications</h4>
          <Badge variant="gray">Coming Soon</Badge>
        </div>
        <div className="space-y-3 opacity-50 bg-neutral-50 rounded-lg p-4">
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

      {/* Delete account */}
      <div className="flex justify-end">
        <Button
          variant="gray"
          onClick={() => setShowDeleteModal(true)}
          className="!bg-danger-600 !text-white hover:!bg-danger-700"
        >
          Delete My Account
        </Button>
      </div>

      {/* Password change modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 sm:p-4">
          <div className="bg-white rounded-t-xl sm:rounded-xl shadow-xl sm:max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-neutral-100">
              <h3 className="text-lg font-bold text-neutral-900">Change Password</h3>
              <button
                onClick={() => {
                  setShowPasswordModal(false)
                  setNewPassword('')
                  setConfirmPassword('')
                  setPasswordError(null)
                  setPasswordSuccess(null)
                }}
                className="text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 rounded-lg p-1.5 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 sm:p-6">
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
        </div>
      )}

      {/* Delete account modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 sm:p-4">
          <div className="bg-white rounded-t-xl sm:rounded-xl shadow-xl sm:max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-neutral-100">
              <h3 className="text-lg font-bold text-danger-600">Delete Account</h3>
              <button
                onClick={() => {
                  setShowDeleteModal(false)
                  setDeleteConfirmation('')
                  setDeleteError(null)
                }}
                className="text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 rounded-lg p-1.5 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 sm:p-6">
              <div className="bg-danger-50 border border-danger-200 rounded-lg p-4 mb-4">
                <p className="text-sm font-medium text-danger-800 mb-2">This action is permanent and will:</p>
                <ul className="text-sm text-danger-700 space-y-1">
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-danger-400 rounded-full shrink-0" />
                    Delete all your predictions and scores
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-danger-400 rounded-full shrink-0" />
                    Remove you from all pools
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-danger-400 rounded-full shrink-0" />
                    Permanently delete your account and login
                  </li>
                </ul>
              </div>

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
        </div>
      )}
    </div>
  )
}
