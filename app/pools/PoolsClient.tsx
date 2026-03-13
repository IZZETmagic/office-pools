'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { AppHeader } from '@/components/ui/AppHeader'
import { JoinPoolModal } from '@/components/pools/JoinPoolModal'
import { CreatePoolModal } from '@/components/pools/CreatePoolModal'
import { formatNumber, formatTimeAgo } from '@/lib/format'
import { useSlideIndicator } from '@/hooks/useSlideIndicator'

// =====================
// TYPES
// =====================
type PoolData = {
  pool_id: string
  pool_name: string
  pool_code: string
  description: string | null
  status: string
  is_private: boolean
  prediction_deadline: string | null
  prediction_mode: 'full_tournament' | 'progressive' | 'bracket_picker'
  tournament_id: string
  created_at: string
  role: string
  total_points: number
  current_rank: number | null
  has_submitted_predictions: boolean
  joined_at: string
  memberCount: number
  form: ('exact' | 'winner_gd' | 'winner' | 'miss')[]
}

type PublicPool = {
  pool_id: string
  pool_name: string
  pool_code: string
  description: string | null
  status: string
  prediction_deadline: string | null
  prediction_mode: 'full_tournament' | 'progressive' | 'bracket_picker'
  created_at: string
  memberCount: number
}

type PoolsClientProps = {
  user: {
    user_id: string
    username: string
    full_name: string | null
    is_super_admin: boolean
  }
  pools: PoolData[]
  stats: {
    totalPools: number
    activePools: number
    totalPoints: number
  }
}

// =====================
// HELPERS
// =====================
function getInitials(fullName: string | null, username: string): string {
  if (fullName) {
    return fullName
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }
  return (username?.[0] ?? '?').toUpperCase()
}

function formatDeadline(deadline: string | null) {
  if (!deadline) return { text: 'No deadline set', className: 'text-neutral-500' }
  const d = new Date(deadline)
  const now = new Date()
  const diffMs = d.getTime() - now.getTime()
  const diffDays = Math.ceil(diffMs / 86400000)

  if (diffMs < 0) return { text: 'Closed', className: 'text-danger-600 font-semibold' }
  if (diffDays <= 3) return {
    text: `${diffDays}d left`,
    className: 'text-danger-600 font-semibold',
  }
  if (diffDays <= 7) return {
    text: `${diffDays}d left`,
    className: 'text-warning-600 font-semibold',
  }
  return {
    text: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    className: 'text-neutral-700',
  }
}

function getStatusAccentColor(status: string): string {
  switch (status) {
    case 'open':
    case 'active':
      return 'bg-warning-400'
    case 'upcoming':
      return 'bg-primary-500'
    case 'completed':
    case 'closed':
      return 'bg-neutral-300 dark:bg-neutral-600'
    default:
      return 'bg-neutral-200'
  }
}

function getStatusBorderColor(pool: PoolData): string {
  const needsPredictions = (pool.status === 'open' || pool.status === 'active') && !pool.has_submitted_predictions
  if (needsPredictions) return 'border-l-[3px] border-l-warning-400'
  return ''
}

function getPoolAction(pool: PoolData): { label: string; icon: 'arrow' | 'check' | null; className: string; isButton: boolean } {
  if (pool.status === 'completed') return {
    label: 'Results',
    icon: 'arrow',
    className: 'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300',
    isButton: false,
  }
  if (pool.status === 'closed') return {
    label: 'Closed',
    icon: null,
    className: 'bg-neutral-200 dark:bg-neutral-700 text-neutral-500',
    isButton: false,
  }
  if (pool.has_submitted_predictions) return {
    label: 'Submitted',
    icon: 'check',
    className: 'bg-success-100 dark:bg-success-900/30 text-success-500 dark:text-success-400 font-bold',
    isButton: false,
  }
  return {
    label: 'Predict',
    icon: 'arrow',
    className: 'bg-warning-500 text-white',
    isButton: true,
  }
}

function getPoolStatusText(pool: PoolData): string {
  if (pool.total_points === 0 && !pool.has_submitted_predictions) return 'No results yet'
  if (pool.total_points === 0 && pool.has_submitted_predictions) return 'Awaiting results'
  if (pool.current_rank && pool.current_rank <= 3) return 'On the podium!'
  if (pool.current_rank) return 'Keep climbing!'
  return `${formatNumber(pool.total_points)} pts`
}

function getLevel(points: number): { level: number; name: string } {
  if (points >= 5000) return { level: 10, name: 'Legend' }
  if (points >= 4000) return { level: 9, name: 'Master' }
  if (points >= 3000) return { level: 8, name: 'Expert' }
  if (points >= 2500) return { level: 7, name: 'Strategist' }
  if (points >= 2000) return { level: 6, name: 'Tactician' }
  if (points >= 1500) return { level: 5, name: 'Competitor' }
  if (points >= 1000) return { level: 4, name: 'Contender' }
  if (points >= 500) return { level: 3, name: 'Amateur' }
  if (points >= 100) return { level: 2, name: 'Beginner' }
  return { level: 1, name: 'Rookie' }
}

function getModeName(mode: string): string {
  switch (mode) {
    case 'full_tournament': return 'Full'
    case 'progressive': return 'Progressive'
    case 'bracket_picker': return 'Bracket'
    default: return mode
  }
}

function getStatusTagClass(status: string): string {
  switch (status) {
    case 'open':
    case 'active': return 'bg-success-100 dark:bg-success-900/30 text-success-700 dark:text-success-400'
    case 'upcoming': return 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400'
    case 'closed': return 'bg-warning-100 dark:bg-warning-900/30 text-warning-700 dark:text-warning-400'
    case 'completed': return 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'
    default: return 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'open':
    case 'active': return 'Open'
    case 'upcoming': return 'Upcoming'
    case 'closed': return 'Closed'
    case 'completed': return 'Completed'
    default: return status
  }
}

function getModeTagClass(mode: string): string {
  switch (mode) {
    case 'full_tournament': return 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400'
    case 'progressive': return 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400'
    case 'bracket_picker': return 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
    default: return 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'
  }
}

function getFormDotColor(type: 'exact' | 'winner_gd' | 'winner' | 'miss'): string {
  switch (type) {
    case 'exact': return 'bg-accent-500'
    case 'winner_gd': return 'bg-success-500'
    case 'winner': return 'bg-primary-500'
    case 'miss': return 'bg-danger-400'
  }
}

// =====================
// MAIN COMPONENT
// =====================
export function PoolsClient({ user, pools, stats }: PoolsClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Tab state (support ?tab=discover from email links)
  const [activeTab, setActiveTab] = useState<'my-pools' | 'discover'>(() => {
    const tabParam = searchParams.get('tab')
    return tabParam === 'discover' ? 'discover' : 'my-pools'
  })

  const { containerRef: poolTabRef, indicatorStyle: poolIndicator, ready: poolTabReady } = useSlideIndicator(activeTab)

  // Filter state (My Pools)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortBy, setSortBy] = useState('newest')

  // Discover state
  const [discoverQuery, setDiscoverQuery] = useState('')
  const [discoverResults, setDiscoverResults] = useState<PublicPool[]>([])
  const [discoverLoading, setDiscoverLoading] = useState(false)
  const [discoverSearched, setDiscoverSearched] = useState(false)
  const [discoverSort, setDiscoverSort] = useState<'newest' | 'members' | 'deadline'>('newest')

  // Modal state
  const [showJoinModal, setShowJoinModal] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [joinInitialCode, setJoinInitialCode] = useState('')
  const [joinPoolName, setJoinPoolName] = useState('')

  // Card interaction state
  const [copiedPoolId, setCopiedPoolId] = useState<string | null>(null)

  // Client-side filtering for My Pools
  const filteredPools = useMemo(() => {
    let result = [...pools]

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (p) =>
          p.pool_name.toLowerCase().includes(q) ||
          p.pool_code.toLowerCase().includes(q)
      )
    }

    if (statusFilter !== 'all') {
      result = result.filter((p) => p.status === statusFilter)
    }

    // Sort: open pools first, then upcoming, then closed/completed
    const statusOrder: Record<string, number> = { open: 0, active: 0, upcoming: 1, closed: 2, completed: 3 }
    result.sort((a, b) => {
      const statusDiff = (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9)
      if (statusDiff !== 0) return statusDiff

      switch (sortBy) {
        case 'newest':
          return new Date(b.joined_at).getTime() - new Date(a.joined_at).getTime()
        case 'oldest':
          return new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime()
        case 'name':
          return a.pool_name.localeCompare(b.pool_name)
        case 'points':
          return (b.total_points ?? 0) - (a.total_points ?? 0)
        default:
          return 0
      }
    })

    return result
  }, [pools, searchQuery, statusFilter, sortBy])

  // Sort discover results client-side
  const sortedDiscoverResults = useMemo(() => {
    const results = [...discoverResults]
    switch (discoverSort) {
      case 'members':
        return results.sort((a, b) => b.memberCount - a.memberCount)
      case 'deadline':
        return results.sort((a, b) => {
          const aTime = a.prediction_deadline ? new Date(a.prediction_deadline).getTime() : Infinity
          const bTime = b.prediction_deadline ? new Date(b.prediction_deadline).getTime() : Infinity
          return aTime - bTime
        })
      case 'newest':
      default:
        return results.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    }
  }, [discoverResults, discoverSort])

  // Discover search (debounced)
  const searchPublicPools = useCallback(async (query: string) => {
    setDiscoverLoading(true)
    setDiscoverSearched(true)
    try {
      const params = new URLSearchParams({ q: query, status: 'open' })
      const res = await fetch(`/api/pools/search?${params}`)
      const data = await res.json()
      setDiscoverResults(data.pools ?? [])
    } catch {
      setDiscoverResults([])
    }
    setDiscoverLoading(false)
  }, [])

  useEffect(() => {
    if (activeTab !== 'discover') return
    const timeout = setTimeout(() => {
      searchPublicPools(discoverQuery)
    }, 400)
    return () => clearTimeout(timeout)
  }, [discoverQuery, activeTab, searchPublicPools])

  const handleJoinFromDiscover = (code: string, name: string) => {
    setJoinInitialCode(code)
    setJoinPoolName(name)
    setShowJoinModal(true)
  }

  const handleModalSuccess = () => {
    setShowJoinModal(false)
    setShowCreateModal(false)
    setJoinInitialCode('')
    router.refresh()
    // Re-search discover results to update available pools
    if (activeTab === 'discover') {
      searchPublicPools(discoverQuery)
    }
  }

  const handleCopyCode = (e: React.MouseEvent, poolId: string, code: string) => {
    e.preventDefault()
    e.stopPropagation()
    navigator.clipboard.writeText(code)
    setCopiedPoolId(poolId)
    setTimeout(() => setCopiedPoolId(null), 1500)
  }

  // Unique statuses for filter dropdown
  const availableStatuses = useMemo(() => {
    const statuses = new Set(pools.map((p) => p.status))
    return Array.from(statuses).sort()
  }, [pools])

  return (
    <div className="min-h-screen bg-surface-secondary">
      <AppHeader isSuperAdmin={user.is_super_admin} />

      {/* Hero header */}
      <div className="bg-gradient-to-br from-primary-600 via-primary-700 to-success-600 dark:from-[oklch(0.22_0.08_262)] dark:via-[oklch(0.18_0.06_264)] dark:to-[oklch(0.20_0.05_165)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 sm:py-10">
          <div className="flex items-center gap-3 sm:gap-5">
            <div className="w-12 h-12 sm:w-24 sm:h-24 rounded-full bg-white/20 dark:bg-white/10 backdrop-blur-sm flex items-center justify-center text-white text-base sm:text-3xl font-bold border-2 border-white/30 dark:border-white/15 shadow-lg shrink-0">
              {getInitials(user.full_name, user.username)}
            </div>
            <div className="min-w-0">
              <h2 className="text-lg sm:text-3xl font-bold text-white truncate">
                Pools
              </h2>
              <p className="text-primary-100 dark:text-white/60 text-xs sm:text-base">
                Create, manage, and discover prediction pools
              </p>
            </div>
          </div>

          {/* Quick stats in hero — compact on mobile, glass cards on desktop */}
          <div className="flex items-center justify-around mt-3 sm:hidden">
            <div className="text-center">
              <p className="text-lg font-bold text-white">{stats.totalPools}</p>
              <p className="text-[10px] text-primary-200 dark:text-white/50">Total Pools</p>
            </div>
            <div className="w-px h-8 bg-white/20" />
            <div className="text-center">
              <p className="text-lg font-bold text-white">{stats.activePools}</p>
              <p className="text-[10px] text-primary-200 dark:text-white/50">Active</p>
            </div>
            <div className="w-px h-8 bg-white/20" />
            <div className="text-center">
              <p className="text-lg font-bold text-white">{formatNumber(stats.totalPoints)}</p>
              <p className="text-[10px] text-primary-200 dark:text-white/50">Total Points</p>
            </div>
          </div>
          <div className="hidden sm:grid grid-cols-3 gap-3 mt-6">
            <div className="bg-white/10 backdrop-blur-sm rounded-xl px-3 py-2.5 text-center border border-white/10">
              <p className="text-2xl font-bold text-white">{stats.totalPools}</p>
              <p className="text-xs text-primary-200 dark:text-white/50">Total Pools</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl px-3 py-2.5 text-center border border-white/10">
              <p className="text-2xl font-bold text-white">{stats.activePools}</p>
              <p className="text-xs text-primary-200 dark:text-white/50">Active</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl px-3 py-2.5 text-center border border-white/10">
              <p className="text-2xl font-bold text-white">{formatNumber(stats.totalPoints)}</p>
              <p className="text-xs text-primary-200 dark:text-white/50">Total Points</p>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Tab bar + Action buttons */}
        <div className="flex items-center justify-between mb-6">
          <div ref={poolTabRef} className="relative flex gap-1 bg-neutral-100 rounded-xl p-1">
            <div
              className={`absolute top-1 bottom-1 bg-surface rounded-lg shadow-sm pointer-events-none ${poolTabReady ? 'transition-all duration-300 ease-out' : ''}`}
              style={{ left: poolIndicator.left, width: poolIndicator.width }}
            />
            <button
              data-tab-key="my-pools"
              onClick={() => setActiveTab('my-pools')}
              className={`relative z-10 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'my-pools'
                  ? 'text-neutral-900'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              My Pools
            </button>
            <button
              data-tab-key="discover"
              onClick={() => setActiveTab('discover')}
              className={`relative z-10 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'discover'
                  ? 'text-neutral-900'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Discover
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setJoinInitialCode('')
                setShowJoinModal(true)
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-neutral-600 dark:text-neutral-700 bg-neutral-100 dark:bg-neutral-600/50 border border-neutral-200 dark:border-neutral-500/50 rounded-xl hover:bg-neutral-200 dark:hover:bg-neutral-700/60 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM3 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 9.374 21c-2.331 0-4.512-.645-6.374-1.766Z" />
              </svg>
              Join
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-primary-600 rounded-xl hover:bg-primary-700 transition-colors shadow-sm"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Create
            </button>
          </div>
        </div>

        {/* MY POOLS TAB */}
        {activeTab === 'my-pools' && (
          <>
            {/* Filter bar */}
            <div className="flex flex-col sm:flex-row gap-3 mb-6">
              <div className="flex-1">
                <Input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name or code..."
                />
              </div>
              <div className="flex gap-2">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-2 border border-neutral-300 rounded-xl text-sm text-neutral-700 bg-surface focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="all">All Statuses</option>
                  {availableStatuses.map((s) => (
                    <option key={s} value={s}>
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </option>
                  ))}
                </select>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="px-3 py-2 border border-neutral-300 rounded-xl text-sm text-neutral-700 bg-surface focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="newest">Newest Joined</option>
                  <option value="oldest">Oldest Joined</option>
                  <option value="name">Name A-Z</option>
                  <option value="points">Most Points</option>
                </select>
              </div>
            </div>

            {/* Pool cards */}
            {filteredPools.length === 0 ? (
              <Card padding="lg" className="text-center max-w-md mx-auto">
                {pools.length === 0 ? (
                  <>
                    <div className="text-4xl mb-3">&#9917;</div>
                    <p className="text-neutral-900 dark:text-white text-lg font-semibold mb-1">
                      You haven&apos;t joined any pools yet
                    </p>
                    <p className="text-neutral-500 dark:text-neutral-400 text-sm mb-5">
                      Compete with friends by predicting match results in the World Cup.
                    </p>
                    <div className="flex flex-col sm:flex-row justify-center items-center gap-3">
                      <Button onClick={() => setActiveTab('discover')} size="sm">
                        Browse Pools
                      </Button>
                      <button
                        onClick={() => setShowCreateModal(true)}
                        className="text-sm text-primary-600 hover:underline font-medium"
                      >
                        or create your own
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-neutral-600 dark:text-neutral-400 text-lg mb-1">No pools match your filters</p>
                    <p className="text-neutral-500 dark:text-neutral-400 text-sm">
                      Try adjusting your search or{' '}
                      <button
                        onClick={() => {
                          setSearchQuery('')
                          setStatusFilter('all')
                        }}
                        className="text-primary-600 hover:underline font-medium"
                      >
                        clear filters
                      </button>
                    </p>
                  </>
                )}
              </Card>
            ) : (
              <>
                <p className="text-sm text-neutral-500 mb-3">
                  {filteredPools.length} pool{filteredPools.length !== 1 ? 's' : ''}
                  {searchQuery || statusFilter !== 'all' ? ' found' : ''}
                </p>
                <div className={
                  filteredPools.length <= 3
                    ? 'max-w-[540px] space-y-2.5'
                    : 'space-y-2.5 md:grid md:grid-cols-2 md:gap-4 md:space-y-0'
                }>
                  {filteredPools.map((pool, i) => {
                    const deadline = formatDeadline(pool.prediction_deadline)
                    const poolAction = getPoolAction(pool)
                    const isCopied = copiedPoolId === pool.pool_id
                    const statusText = getPoolStatusText(pool)

                    return (
                      <Link
                        key={pool.pool_id}
                        href={`/pools/${pool.pool_id}`}
                        className={`block rounded-xl border border-neutral-200 dark:border-border-default ${getStatusBorderColor(pool)} bg-surface hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-200 overflow-hidden animate-fade-up`}
                        style={{ animationDelay: `${i * 0.06}s` }}
                      >
                        {/* ========== MOBILE CARD ========== */}
                        <div className="md:hidden flex">
                          <div className="flex-1 px-4 py-3.5">
                            {/* Header: name + tags + action pill */}
                            <div className="flex items-center justify-between gap-3 mb-3">
                              <div className="min-w-0 flex-1">
                                <h4 className="text-lg font-bold text-neutral-900 dark:text-white leading-snug min-w-0 truncate">
                                  {pool.pool_name}
                                </h4>
                                {/* Badges + player count */}
                                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                  {pool.role === 'admin' && <span className="text-[10px] px-1.5 py-0.5 rounded font-bold border border-neutral-300 dark:border-neutral-600 text-neutral-600 dark:text-neutral-400">Admin</span>}
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${getModeTagClass(pool.prediction_mode)}`}>{getModeName(pool.prediction_mode)}</span>
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold capitalize ${getStatusTagClass(pool.status)}`}>{getStatusLabel(pool.status)}</span>
                                  <span className="text-xs text-neutral-500 dark:text-neutral-400 ml-0.5">
                                    {pool.memberCount} player{pool.memberCount !== 1 ? 's' : ''}
                                  </span>
                                </div>
                              </div>
                              {poolAction.isButton ? (
                                <button
                                  onClick={(e) => {
                                    e.preventDefault()
                                    router.push(`/pools/${pool.pool_id}?tab=predictions`)
                                  }}
                                  className={`shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold ${poolAction.className}`}
                                >
                                  {poolAction.label}
                                  {poolAction.icon === 'arrow' && (
                                    <span className="ml-0.5">&rarr;</span>
                                  )}
                                </button>
                              ) : (
                                <span className={`shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold ${poolAction.className}`}>
                                  {poolAction.label}
                                  {poolAction.icon === 'arrow' && (
                                    <span className="ml-0.5">&rarr;</span>
                                  )}
                                </span>
                              )}
                            </div>

                            {/* Stats grid */}
                            {(() => {
                              const level = getLevel(pool.total_points ?? 0)
                              return (
                                <div className="flex items-stretch rounded-xl bg-neutral-50 dark:bg-neutral-800/50 mb-3 overflow-hidden">
                                  {/* Points */}
                                  <div className="flex-1 py-3 px-3">
                                    <p className="text-[10px] font-medium text-neutral-400 dark:text-neutral-500 mb-1 tracking-wide">Points</p>
                                    <p className="text-xl font-bold text-primary-600 dark:text-primary-400 leading-none">
                                      {formatNumber(pool.total_points ?? 0)}
                                    </p>
                                  </div>
                                  <div className="w-px my-5 bg-neutral-200 dark:bg-neutral-700" />
                                  {/* Rank */}
                                  <div className="flex-1 py-3 px-3">
                                    <p className="text-[10px] font-medium text-neutral-400 dark:text-neutral-500 mb-1 tracking-wide">Rank</p>
                                    <div className="flex items-baseline gap-1.5">
                                      <p className="text-xl font-bold text-neutral-900 dark:text-white leading-none">
                                        #{pool.current_rank ?? 0}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="w-px my-5 bg-neutral-200 dark:bg-neutral-700" />
                                  {/* Level */}
                                  <div className="flex-[1.2] py-3 px-3">
                                    <p className="text-[10px] font-medium text-neutral-400 dark:text-neutral-500 mb-1 tracking-wide">Level</p>
                                    <p className="text-xl font-bold text-primary-600 dark:text-primary-400 leading-none">
                                      {level.level}
                                    </p>
                                    <p className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-0.5">{level.name}</p>
                                  </div>
                                  {/* Form */}
                                  <div className="flex-1 py-3 px-3">
                                    <p className="text-[10px] font-medium text-neutral-400 dark:text-neutral-500 mb-1 tracking-wide text-right">Form</p>
                                    <div className="flex items-center justify-end gap-[5px] mt-1.5">
                                      {pool.form.length > 0
                                        ? pool.form.map((type, i) => (
                                            <div key={i} className={`w-[10px] h-[10px] rounded-full ${getFormDotColor(type)}`} />
                                          ))
                                        : [0, 1, 2, 3, 4].map((i) => (
                                            <div key={i} className="w-[10px] h-[10px] rounded-full bg-neutral-300 dark:bg-neutral-600" />
                                          ))
                                      }
                                    </div>
                                  </div>
                                </div>
                              )
                            })()}

                            {/* Bottom row: status + deadline */}
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-neutral-500 dark:text-neutral-400">
                                {statusText}
                              </span>
                              {deadline.text !== 'No deadline set' && (
                                <span className={`inline-flex items-center gap-1 text-xs font-semibold ${deadline.className}`}>
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                                  </svg>
                                  {deadline.text}
                                </span>
                              )}
                            </div>

                            {/* Invite nudge — admin pools with fewer than 10 members */}
                            {pool.role === 'admin' && pool.memberCount < 10 && (
                              <div className="mt-2.5 bg-primary-50 dark:bg-primary-500/10 rounded-lg px-3 py-2 flex items-center justify-between">
                                <span className="text-[11px] text-neutral-600 dark:text-neutral-400">
                                  {pool.memberCount} player{pool.memberCount !== 1 ? 's' : ''} &mdash; invite more
                                </span>
                                <button
                                  onClick={(e) => handleCopyCode(e, pool.pool_id, pool.pool_code)}
                                  className="text-[11px] text-primary-600 dark:text-primary-400 font-semibold hover:underline shrink-0 ml-2"
                                >
                                  {isCopied ? 'Copied!' : 'Copy Code'}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* ========== DESKTOP CARD ========== */}
                        <div className="hidden md:flex">
                          <div className="flex-1 p-4">
                            {/* Header row */}
                            <div className="flex items-center justify-between gap-3 mb-2">
                              <div className="min-w-0 flex-1">
                                <h4 className="text-lg font-bold text-neutral-900 dark:text-white truncate">
                                  {pool.pool_name}
                                </h4>
                                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                  {pool.role === 'admin' && <span className="text-[10px] px-1.5 py-0.5 rounded font-bold border border-neutral-300 dark:border-neutral-600 text-neutral-600 dark:text-neutral-400">Admin</span>}
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${getModeTagClass(pool.prediction_mode)}`}>{getModeName(pool.prediction_mode)}</span>
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold capitalize ${getStatusTagClass(pool.status)}`}>{getStatusLabel(pool.status)}</span>
                                  <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                                    {pool.memberCount} player{pool.memberCount !== 1 ? 's' : ''}
                                  </span>
                                </div>
                              </div>
                              {/* Desktop action pill */}
                              {poolAction.isButton ? (
                                <button
                                  onClick={(e) => {
                                    e.preventDefault()
                                    router.push(`/pools/${pool.pool_id}?tab=predictions`)
                                  }}
                                  className={`shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold ${poolAction.className}`}
                                >
                                  {poolAction.label}
                                  {poolAction.icon === 'arrow' && <span className="ml-0.5">&rarr;</span>}
                                </button>
                              ) : (
                                <span className={`shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold ${poolAction.className}`}>
                                  {poolAction.label}
                                  {poolAction.icon === 'arrow' && <span className="ml-0.5">&rarr;</span>}
                                </span>
                              )}
                            </div>

                            {/* Stats row */}
                            {(() => {
                              const level = getLevel(pool.total_points ?? 0)
                              return (
                                <div className="flex items-stretch rounded-xl bg-neutral-50 dark:bg-neutral-800/50 mt-3 overflow-hidden">
                                  {/* Points */}
                                  <div className="flex-1 py-3 px-3">
                                    <p className="text-[10px] font-medium text-neutral-400 dark:text-neutral-500 mb-1 tracking-wide">Points</p>
                                    <p className="text-xl font-bold text-primary-600 dark:text-primary-400 leading-none">
                                      {formatNumber(pool.total_points ?? 0)}
                                    </p>
                                  </div>
                                  <div className="w-px my-5 bg-neutral-200 dark:bg-neutral-700" />
                                  {/* Rank */}
                                  <div className="flex-1 py-3 px-3">
                                    <p className="text-[10px] font-medium text-neutral-400 dark:text-neutral-500 mb-1 tracking-wide">Rank</p>
                                    <div className="flex items-baseline gap-1.5">
                                      <p className="text-xl font-bold text-neutral-900 dark:text-white leading-none">
                                        #{pool.current_rank ?? 0}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="w-px my-5 bg-neutral-200 dark:bg-neutral-700" />
                                  {/* Level */}
                                  <div className="flex-[1.2] py-3 px-3">
                                    <p className="text-[10px] font-medium text-neutral-400 dark:text-neutral-500 mb-1 tracking-wide">Level</p>
                                    <p className="text-xl font-bold text-primary-600 dark:text-primary-400 leading-none">
                                      {level.level}
                                    </p>
                                    <p className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-0.5">{level.name}</p>
                                  </div>
                                  {/* Form */}
                                  <div className="flex-1 py-3 px-3">
                                    <p className="text-[10px] font-medium text-neutral-400 dark:text-neutral-500 mb-1 tracking-wide text-right">Form</p>
                                    <div className="flex items-center justify-end gap-[5px] mt-1.5">
                                      {pool.form.length > 0
                                        ? pool.form.map((type, i) => (
                                            <div key={i} className={`w-[10px] h-[10px] rounded-full ${getFormDotColor(type)}`} />
                                          ))
                                        : [0, 1, 2, 3, 4].map((i) => (
                                            <div key={i} className="w-[10px] h-[10px] rounded-full bg-neutral-300 dark:bg-neutral-600" />
                                          ))
                                      }
                                    </div>
                                  </div>
                                </div>
                              )
                            })()}

                            {/* Bottom row */}
                            <div className="flex items-center justify-between mt-3 pt-3 border-t border-neutral-100 dark:border-neutral-800">
                              <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                                {statusText}
                              </span>
                              {deadline.text !== 'No deadline set' && (
                                <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${deadline.className}`}>
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                                  </svg>
                                  {deadline.text}
                                </span>
                              )}
                            </div>

                            {/* Invite nudge — admin pools with fewer than 10 members */}
                            {pool.role === 'admin' && pool.memberCount < 10 && (
                              <div className="mt-3 bg-primary-50 dark:bg-primary-500/10 rounded-lg px-3 py-2 flex items-center justify-between">
                                <span className="text-[11px] text-neutral-600 dark:text-neutral-400">
                                  {pool.memberCount} player{pool.memberCount !== 1 ? 's' : ''} &mdash; invite more to make it interesting
                                </span>
                                <button
                                  onClick={(e) => handleCopyCode(e, pool.pool_id, pool.pool_code)}
                                  className="text-[11px] text-primary-600 dark:text-primary-400 font-semibold hover:underline shrink-0 ml-2"
                                >
                                  {isCopied ? 'Copied!' : 'Copy Code'}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </>
            )}
          </>
        )}

        {/* DISCOVER TAB */}
        {activeTab === 'discover' && (
          <>
            {/* Search + Sort controls */}
            <div className="flex flex-col sm:flex-row gap-3 mb-6">
              <div className="flex-1">
                <Input
                  type="text"
                  value={discoverQuery}
                  onChange={(e) => setDiscoverQuery(e.target.value)}
                  placeholder="Search public pools by name, code, or description..."
                />
              </div>
              <select
                value={discoverSort}
                onChange={(e) => setDiscoverSort(e.target.value as 'newest' | 'members' | 'deadline')}
                className="px-3 py-2 border border-neutral-300 rounded-xl text-sm text-neutral-700 bg-surface focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                <option value="newest">Newest</option>
                <option value="members">Most Players</option>
                <option value="deadline">Ending Soon</option>
              </select>
            </div>

            {discoverLoading ? (
              <div className="text-center py-12">
                <div className="inline-block w-6 h-6 border-2 border-primary-300 border-t-primary-600 rounded-full animate-spin" />
                <p className="text-neutral-500 text-sm mt-2">Searching pools...</p>
              </div>
            ) : sortedDiscoverResults.length > 0 ? (
              <>
                <p className="text-sm text-neutral-500 mb-3">
                  {sortedDiscoverResults.length} public pool{sortedDiscoverResults.length !== 1 ? 's' : ''} found
                </p>
                <div className={
                  sortedDiscoverResults.length <= 3
                    ? 'max-w-[540px] space-y-2.5'
                    : 'space-y-2.5 md:grid md:grid-cols-2 md:gap-4 md:space-y-0'
                }>
                  {sortedDiscoverResults.map((pool, i) => {
                    const deadline = formatDeadline(pool.prediction_deadline)

                    return (
                      <button
                        key={pool.pool_id}
                        onClick={() => handleJoinFromDiscover(pool.pool_code, pool.pool_name)}
                        className="w-full text-left rounded-xl border border-neutral-200 dark:border-border-default bg-surface hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-200 overflow-hidden animate-fade-up cursor-pointer"
                        style={{ animationDelay: `${i * 0.06}s` }}
                      >
                        {/* ========== DISCOVER MOBILE CARD ========== */}
                        <div className="md:hidden flex">
                          <div className="flex-1 px-4 py-3.5">
                            {/* Header: name + tags */}
                            <div className="mb-2">
                              <h4 className="text-lg font-bold text-neutral-900 dark:text-white leading-snug min-w-0 truncate">
                                {pool.pool_name}
                              </h4>
                              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${getModeTagClass(pool.prediction_mode)}`}>{getModeName(pool.prediction_mode)}</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold capitalize ${getStatusTagClass(pool.status)}`}>{getStatusLabel(pool.status)}</span>
                                <span className="text-xs text-neutral-500 dark:text-neutral-400 ml-0.5">
                                  {pool.memberCount} player{pool.memberCount !== 1 ? 's' : ''}
                                </span>
                              </div>
                            </div>

                            {/* Stats section */}
                            <div className="flex items-stretch rounded-xl bg-neutral-50 dark:bg-neutral-800/50 mb-3 overflow-hidden">
                              {/* Members */}
                              <div className="shrink-0 py-3 px-3">
                                <p className="text-[10px] font-medium text-neutral-400 dark:text-neutral-500 mb-1 tracking-wide">Members</p>
                                <p className="text-xl font-bold text-neutral-900 dark:text-white leading-none">
                                  {pool.memberCount}
                                </p>
                              </div>
                              {pool.description && (
                                <>
                                  <div className="w-px my-5 bg-neutral-200 dark:bg-neutral-700" />
                                  <div className="flex-1 py-3 px-3 min-w-0">
                                    <p className="text-[10px] font-medium text-neutral-400 dark:text-neutral-500 mb-1 tracking-wide">About</p>
                                    <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed line-clamp-2">
                                      {pool.description}
                                    </p>
                                  </div>
                                </>
                              )}
                            </div>

                            {/* Bottom row */}
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-neutral-500 dark:text-neutral-400">
                                Created {formatTimeAgo(pool.created_at)}
                              </span>
                              {deadline.text !== 'No deadline set' && (
                                <span className={`inline-flex items-center gap-1 text-xs font-semibold ${deadline.className}`}>
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                                  </svg>
                                  {deadline.text}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* ========== DISCOVER DESKTOP CARD ========== */}
                        <div className="hidden md:flex">
                          <div className="flex-1 p-4">
                            {/* Header row */}
                            <div className="mb-2">
                              <h4 className="text-lg font-bold text-neutral-900 dark:text-white truncate">
                                {pool.pool_name}
                              </h4>
                              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${getModeTagClass(pool.prediction_mode)}`}>{getModeName(pool.prediction_mode)}</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold capitalize ${getStatusTagClass(pool.status)}`}>{getStatusLabel(pool.status)}</span>
                                <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                                  {pool.memberCount} player{pool.memberCount !== 1 ? 's' : ''}
                                </span>
                              </div>
                            </div>

                            {/* Stats row */}
                            <div className="flex items-stretch rounded-xl bg-neutral-50 dark:bg-neutral-800/50 mt-1 overflow-hidden">
                              {/* Members */}
                              <div className="shrink-0 py-3 px-3">
                                <p className="text-[10px] font-medium text-neutral-400 dark:text-neutral-500 mb-1 tracking-wide">Members</p>
                                <p className="text-xl font-bold text-neutral-900 dark:text-white leading-none">
                                  {pool.memberCount}
                                </p>
                              </div>
                              {pool.description && (
                                <>
                                  <div className="w-px my-5 bg-neutral-200 dark:bg-neutral-700" />
                                  <div className="flex-1 py-3 px-3 min-w-0">
                                    <p className="text-[10px] font-medium text-neutral-400 dark:text-neutral-500 mb-1 tracking-wide">About</p>
                                    <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed line-clamp-2">
                                      {pool.description}
                                    </p>
                                  </div>
                                </>
                              )}
                            </div>

                            {/* Bottom row */}
                            <div className="flex items-center justify-between mt-3 pt-3 border-t border-neutral-100 dark:border-neutral-800">
                              <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                                Created {formatTimeAgo(pool.created_at)}
                              </span>
                              {deadline.text !== 'No deadline set' && (
                                <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${deadline.className}`}>
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                                  </svg>
                                  {deadline.text}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </>
            ) : discoverSearched ? (
              <Card padding="lg" className="text-center max-w-md mx-auto">
                {discoverQuery ? (
                  <>
                    <p className="text-neutral-600 dark:text-neutral-400 text-lg mb-1">
                      No pools found for &ldquo;{discoverQuery}&rdquo;
                    </p>
                    <button
                      onClick={() => setDiscoverQuery('')}
                      className="text-sm text-primary-600 hover:underline font-medium mt-2"
                    >
                      Clear search
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-neutral-600 dark:text-neutral-400 text-lg mb-1">No public pools available</p>
                    <p className="text-neutral-500 dark:text-neutral-400 text-sm">
                      There are no open public pools right now. Why not{' '}
                      <button
                        onClick={() => setShowCreateModal(true)}
                        className="text-primary-600 hover:underline font-medium"
                      >
                        create one
                      </button>
                      ?
                    </p>
                  </>
                )}
              </Card>
            ) : null}
          </>
        )}
      </main>

      {/* Modals */}
      {showJoinModal && (
        <JoinPoolModal
          onClose={() => { setShowJoinModal(false); setJoinInitialCode(''); setJoinPoolName('') }}
          onSuccess={handleModalSuccess}
          initialCode={joinInitialCode}
          initialPoolName={joinPoolName}
        />
      )}
      {showCreateModal && (
        <CreatePoolModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={handleModalSuccess}
        />
      )}
    </div>
  )
}
