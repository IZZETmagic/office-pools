'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import type { CSSProperties } from 'react'
import { useUnreadBanter } from '@/hooks/useUnreadBanter'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Icon } from '@/components/ui/Icon'
import { AppHeader } from '@/components/ui/AppHeader'
import { JoinPoolModal } from '@/components/pools/JoinPoolModal'
import { CreatePoolModal } from '@/components/pools/CreatePoolModal'
import { formatNumber, formatTimeAgo } from '@/lib/format'
import { useSlideIndicator } from '@/hooks/useSlideIndicator'
import { poolStatusDisplay, toneToTagClass } from '@/lib/poolStatus'
import { getModeName, getModeChip } from '@/lib/design/poolMode'
import type { PredictionMode } from '@/lib/predictionMode'
import type { ShowdownCardFacts, LmsCardFacts, TableCardFacts } from '@/lib/league/poolCards'
import { LocalTime } from '@/components/LocalTime'
import { PoolCard } from '@/components/pools/PoolCard'
import { deadlineChip } from '@/lib/pools/card'

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
  // The full union from lib/predictionMode.ts, which exists because this very
  // line used to omit `league_pickem` in four files at once — telling the
  // compiler a league pool is a World Cup pool.
  prediction_mode: PredictionMode
  /** pickem | showdown | last_man_standing | table. NULL on a World Cup pool. */
  league_mode: string | null
  tournament_id: string
  created_at: string
  role: string
  total_points: number
  /** NULL for a league pool: there is no league XP system. See the server note. */
  highest_level: number | null
  /**
   * `tournaments.external_league_id` — the competition, for the stripe's top
   * half. Null renders the unthemed slate rather than guessing a colour.
   */
  externalLeagueId?: number | null
  /** The open matchweek, shown where a World Cup card shows the XP level. */
  openMatchweekNumber?: number | null
  /** The matchweek being played, which the tile prefers. Null between rounds. */
  inPlayMatchweekNumber?: number | null
  /** This season's matchweek count — 38 in England, 34 in Germany. */
  matchweekCount?: number | null
  /** Showdown's KPI tiles. NULL for every other mode. */
  showdown?: ShowdownCardFacts | null
  /** Last Man Standing's KPI tiles. NULL for every other mode. */
  lms?: LmsCardFacts | null
  /** Predict the Table's KPI tiles. NULL for every other mode. */
  table?: TableCardFacts | null
  current_rank: number | null
  has_submitted_predictions: boolean
  joined_at: string
  memberCount: number
  totalEntries: number
  hasScoringStarted: boolean
  /**
   * The decisions owed in the CURRENT unit and how many are made — the open
   * matchweek for a league pool, the whole tournament for a World Cup one.
   *
   * ⚠ Added for the action pill, which now says "6 of 10 picked". Without them
   * a member three fixtures into ten read exactly like one who had not opened
   * the pool. app/dashboard/page.tsx has carried the same pair for longer; the
   * note there explains why the unit is the matchweek and not the season.
   */
  totalMatches: number
  predictedMatches: number
  form: ('exact' | 'winner_gd' | 'winner' | 'miss')[]
  currentRoundLabel?: string | null
  brand_name?: string | null
  brand_emoji?: string | null
  brand_color?: string | null
  brand_accent?: string | null
  brand_landing_url?: string | null
  brand_logo_url?: string | null
}

type PublicPool = {
  pool_id: string
  pool_name: string
  pool_code: string
  description: string | null
  status: string
  prediction_deadline: string | null
  prediction_mode: PredictionMode
  league_mode: string | null
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

function getStatusTagClass(status: string): string {
  return toneToTagClass(poolStatusDisplay({ status }).tone)
}

function getStatusLabel(status: string): string {
  return poolStatusDisplay({ status }).label
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

  // Unread banter badges
  const poolIds = useMemo(() => pools.map(p => p.pool_id), [pools])
  const { unreadCounts } = useUnreadBanter({ userId: user.user_id, poolIds })

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
  const [linkCopiedPoolId, setLinkCopiedPoolId] = useState<string | null>(null)

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

    // Sort: branded pools first, then open pools, then upcoming, then closed/completed
    // Within each tier, pools with unread banter float to top
    const statusOrder: Record<string, number> = { open: 0, active: 0, upcoming: 1, closed: 2, completed: 3 }
    result.sort((a, b) => {
      // Branded pools always first
      const aBrand = (a.brand_name && (a.brand_emoji || a.brand_logo_url) && a.brand_color) ? 0 : 1
      const bBrand = (b.brand_name && (b.brand_emoji || b.brand_logo_url) && b.brand_color) ? 0 : 1
      if (aBrand !== bBrand) return aBrand - bBrand

      const statusDiff = (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9)
      if (statusDiff !== 0) return statusDiff

      // Pools with unread banter first
      const aUnread = (unreadCounts.get(a.pool_id) ?? 0) > 0 ? 0 : 1
      const bUnread = (unreadCounts.get(b.pool_id) ?? 0) > 0 ? 0 : 1
      if (aUnread !== bUnread) return aUnread - bUnread

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
  }, [pools, searchQuery, statusFilter, sortBy, unreadCounts])

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

  const handleCopyInviteLink = (e: React.MouseEvent, poolId: string, code: string) => {
    e.preventDefault()
    e.stopPropagation()
    navigator.clipboard.writeText(`${window.location.origin}/join/${code}`)
    setLinkCopiedPoolId(poolId)
    setTimeout(() => setLinkCopiedPoolId(null), 1500)
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
            <div className="w-12 h-12 sm:w-24 sm:h-24 rounded-pill bg-white/20 dark:bg-white/10 backdrop-blur-sm flex items-center justify-center text-white text-base sm:text-3xl font-bold border-2 border-white/30 dark:border-white/15 shadow-lg shrink-0">
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
            <div className="bg-white/10 backdrop-blur-sm rounded-control px-3 py-2.5 text-center border border-white/10">
              <p className="text-2xl font-bold text-white">{stats.totalPools}</p>
              <p className="text-xs text-primary-200 dark:text-white/50">Total Pools</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-control px-3 py-2.5 text-center border border-white/10">
              <p className="text-2xl font-bold text-white">{stats.activePools}</p>
              <p className="text-xs text-primary-200 dark:text-white/50">Active</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-control px-3 py-2.5 text-center border border-white/10">
              <p className="text-2xl font-bold text-white">{formatNumber(stats.totalPoints)}</p>
              <p className="text-xs text-primary-200 dark:text-white/50">Total Points</p>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Tab bar + Action buttons */}
        <div className="flex items-center justify-between mb-6">
          <div ref={poolTabRef} className="relative flex gap-1 bg-mist rounded-pill p-1">
            <div
              className={`absolute top-1 bottom-1 bg-surface rounded-pill shadow-sm pointer-events-none ${poolTabReady ? 'transition-all duration-300 ease-out' : ''}`}
              style={{ left: poolIndicator.left, width: poolIndicator.width }}
            />
            <button
              data-tab-key="my-pools"
              onClick={() => setActiveTab('my-pools')}
              className={`relative z-10 px-4 py-2 rounded-pill text-sm font-bold transition-colors ${
                activeTab === 'my-pools'
                  ? 'text-ink'
                  : 'text-muted hover:text-ink'
              }`}
            >
              My Pools
            </button>
            <button
              data-tab-key="discover"
              onClick={() => setActiveTab('discover')}
              className={`relative z-10 px-4 py-2 rounded-pill text-sm font-bold transition-colors ${
                activeTab === 'discover'
                  ? 'text-ink'
                  : 'text-muted hover:text-ink'
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
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-muted bg-mist/50 border border-border-default rounded-control hover:bg-silver transition-colors"
            >
              <Icon name="person.badge.plus" size={16} weight="semibold" />
              Join
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-primary-600 rounded-control hover:bg-primary-700 transition-colors shadow-sm"
            >
              <Icon name="plus" size={16} weight="semibold" />
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
                <Select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                                  >
                  <option value="all">All Statuses</option>
                  {availableStatuses.map((s) => (
                    <option key={s} value={s}>
                      {getStatusLabel(s)}
                    </option>
                  ))}
                </Select>
                <Select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                                  >
                  <option value="newest">Newest Joined</option>
                  <option value="oldest">Oldest Joined</option>
                  <option value="name">Name A-Z</option>
                  <option value="points">Most Points</option>
                </Select>
              </div>
            </div>

            {/* Pool cards */}
            {filteredPools.length === 0 ? (
              <Card padding="lg" className="text-center max-w-md mx-auto">
                {pools.length === 0 ? (
                  <>
                    <div className="text-4xl mb-3">&#9917;</div>
                    <p className="text-ink text-lg font-semibold mb-1">
                      You haven&apos;t joined any pools yet
                    </p>
                    <p className="text-muted text-sm mb-5">
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
                    <p className="text-muted text-lg mb-1">No pools match your filters</p>
                    <p className="text-muted text-sm">
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
                <p className="text-sm text-muted mb-3">
                  {filteredPools.length} pool{filteredPools.length !== 1 ? 's' : ''}
                  {searchQuery || statusFilter !== 'all' ? ' found' : ''}
                </p>
                <div className={
                  filteredPools.length <= 3
                    ? 'max-w-[540px] space-y-2.5'
                    : 'space-y-2.5 md:grid md:grid-cols-2 md:gap-4 md:space-y-0'
                }>
                  {filteredPools.map((pool, i) => (
                    <PoolCard
                      key={pool.pool_id}
                      pool={pool}
                      index={i}
                      unreadCount={unreadCounts.get(pool.pool_id) ?? 0}
                      onCopyLink={handleCopyInviteLink}
                      onCopyCode={handleCopyCode}
                      linkCopied={linkCopiedPoolId === pool.pool_id}
                      codeCopied={copiedPoolId === pool.pool_id}
                    />
                  ))}
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
              <Select
                value={discoverSort}
                onChange={(e) => setDiscoverSort(e.target.value as 'newest' | 'members' | 'deadline')}
                              >
                <option value="newest">Newest</option>
                <option value="members">Most Players</option>
                <option value="deadline">Ending Soon</option>
              </Select>
            </div>

            {discoverLoading ? (
              <div className="text-center py-12">
                <div className="inline-block w-6 h-6 border-2 border-primary-300 border-t-primary-600 rounded-pill animate-spin" />
                <p className="text-muted text-sm mt-2">Searching pools...</p>
              </div>
            ) : sortedDiscoverResults.length > 0 ? (
              <>
                <p className="text-sm text-muted mb-3">
                  {sortedDiscoverResults.length} public pool{sortedDiscoverResults.length !== 1 ? 's' : ''} found
                </p>
                <div className={
                  sortedDiscoverResults.length <= 3
                    ? 'max-w-[540px] space-y-2.5'
                    : 'space-y-2.5 md:grid md:grid-cols-2 md:gap-4 md:space-y-0'
                }>
                  {sortedDiscoverResults.map((pool, i) => {
                    const deadline = deadlineChip(pool.prediction_deadline)

                    return (
                      <button
                        key={pool.pool_id}
                        onClick={() => handleJoinFromDiscover(pool.pool_code, pool.pool_name)}
                        className="w-full h-full flex flex-col text-left rounded-card border border-border-subtle bg-surface hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-200 overflow-hidden animate-fade-up cursor-pointer"
                        style={{ animationDelay: `${i * 0.06}s` }}
                      >
                        {/* ========== DISCOVER MOBILE CARD ========== */}
                        <div className="md:hidden flex">
                          <div className="flex-1 px-4 py-3.5">
                            {/* Header: name + tags */}
                            <div className="mb-2">
                              <h4 className="text-lg font-bold text-ink leading-snug min-w-0 truncate">
                                {pool.pool_name}
                              </h4>
                              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                <span
                                  className="text-[10px] px-1.5 py-0.5 rounded font-bold mode-pill"
                                  style={getModeChip(pool.prediction_mode, pool.league_mode) as CSSProperties}
                                >{getModeName(pool.prediction_mode, pool.league_mode)}</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold capitalize ${getStatusTagClass(pool.status)}`}>{getStatusLabel(pool.status)}</span>
                                <span className="text-xs text-muted ml-0.5">
                                  {pool.memberCount} player{pool.memberCount !== 1 ? 's' : ''}
                                </span>
                              </div>
                            </div>

                            {/* Stats section */}
                            <div className="flex items-stretch rounded-control bg-snow/75 mb-3 overflow-hidden">
                              {/* Members */}
                              <div className="shrink-0 py-3 px-3">
                                <p className="text-[10px] font-medium text-muted mb-1 tracking-wide">Members</p>
                                <p className="text-xl font-bold text-ink leading-none">
                                  {pool.memberCount}
                                </p>
                              </div>
                              {pool.description && (
                                <>
                                  <div className="w-px my-5 bg-silver" />
                                  <div className="flex-1 py-3 px-3 min-w-0">
                                    <p className="text-[10px] font-medium text-muted mb-1 tracking-wide">About</p>
                                    <p className="text-xs text-muted dark:text-muted leading-relaxed line-clamp-2">
                                      {pool.description}
                                    </p>
                                  </div>
                                </>
                              )}
                            </div>

                            {/* Bottom row */}
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-muted">
                                Created {formatTimeAgo(pool.created_at)}
                              </span>
                              {deadline.show && (
                                <span className={`inline-flex items-center gap-1 text-xs font-semibold ${deadline.className}`}>
                                  <Icon name="clock" size={14} weight="semibold" />
                                  <LocalTime iso={pool.prediction_deadline!} format={deadline.format} fallback={deadline.fallback} />
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* ========== DISCOVER DESKTOP CARD ========== */}
                        <div className="hidden md:flex">
                          {/* Column, so the status row below can be pushed to the
                              bottom when the grid stretches this card to match a
                              taller sibling. */}
                          <div className="flex-1 min-w-0 p-4 flex flex-col">
                            {/* Header row */}
                            <div className="mb-2">
                              <h4 className="text-lg font-bold text-ink truncate">
                                {pool.pool_name}
                              </h4>
                              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                <span
                                  className="text-[10px] px-1.5 py-0.5 rounded font-bold mode-pill"
                                  style={getModeChip(pool.prediction_mode, pool.league_mode) as CSSProperties}
                                >{getModeName(pool.prediction_mode, pool.league_mode)}</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold capitalize ${getStatusTagClass(pool.status)}`}>{getStatusLabel(pool.status)}</span>
                                <span className="text-[11px] text-muted">
                                  {pool.memberCount} player{pool.memberCount !== 1 ? 's' : ''}
                                </span>
                              </div>
                            </div>

                            {/* Stats row */}
                            <div className="flex items-stretch rounded-control bg-snow/75 mt-1 overflow-hidden">
                              {/* Members */}
                              <div className="shrink-0 py-3 px-3">
                                <p className="text-[10px] font-medium text-muted mb-1 tracking-wide">Members</p>
                                <p className="text-xl font-bold text-ink leading-none">
                                  {pool.memberCount}
                                </p>
                              </div>
                              {pool.description && (
                                <>
                                  <div className="w-px my-5 bg-silver" />
                                  <div className="flex-1 py-3 px-3 min-w-0">
                                    <p className="text-[10px] font-medium text-muted mb-1 tracking-wide">About</p>
                                    <p className="text-xs text-muted dark:text-muted leading-relaxed line-clamp-2">
                                      {pool.description}
                                    </p>
                                  </div>
                                </>
                              )}
                            </div>

                            {/* Bottom row — mt-auto pins it to the card's foot so a
                                stretched card puts its whitespace in the middle
                                rather than dangling below the status line. */}
                            <div className="flex items-center justify-between mt-auto pt-3 border-t border-border-subtle">
                              <span className="text-[11px] text-muted">
                                Created {formatTimeAgo(pool.created_at)}
                              </span>
                              {deadline.show && (
                                <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${deadline.className}`}>
                                  <Icon name="clock" size={14} weight="semibold" />
                                  <LocalTime iso={pool.prediction_deadline!} format={deadline.format} fallback={deadline.fallback} />
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
                    <p className="text-muted text-lg mb-1">
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
                    <p className="text-muted text-lg mb-1">No public pools available</p>
                    <p className="text-muted text-sm">
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
