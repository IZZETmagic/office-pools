'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import type { CSSProperties } from 'react'
import { useUnreadBanter } from '@/hooks/useUnreadBanter'
import Link from 'next/link'
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
import { getLevelName } from '@/lib/levelNames'
import { useSlideIndicator } from '@/hooks/useSlideIndicator'
import { poolStatusDisplay, toneToTagClass } from '@/lib/poolStatus'
import { getModeName, getPoolStripe, getModeChip } from '@/lib/design/poolMode'
import type { PredictionMode } from '@/lib/predictionMode'
import { getFormDotClass } from '@/lib/design/formDots'

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
  /** This season's matchweek count — 38 in England, 34 in Germany. */
  matchweekCount?: number | null
  current_rank: number | null
  has_submitted_predictions: boolean
  joined_at: string
  memberCount: number
  totalEntries: number
  hasScoringStarted: boolean
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

function formatDeadline(deadline: string | null) {
  if (!deadline) return { text: 'No deadline set', className: 'text-muted' }
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
    text: (() => {
      const month = d.toLocaleString('en-US', { month: 'short' })
      const day = d.getDate()
      const hour = d.getHours()
      const minute = d.getMinutes().toString().padStart(2, '0')
      const period = hour >= 12 ? 'PM' : 'AM'
      const h = hour % 12 || 12
      return `${month} ${day}, ${h}:${minute} ${period}`
    })(),
    className: 'text-ink',
  }
}

/**
 * The stripe's two stops — the competition's brand colour, lifted at the top —
 * as custom properties for the `.pool-stripe` class.
 *
 * Not a composed `background` string: a React style prop holds one value per
 * property, and `.pool-stripe` needs two background declarations so the OKLCH
 * one can override an sRGB fallback. See app/globals.css.
 */
function stripeVars(pool: { externalLeagueId?: number | null }): CSSProperties {
  const [from, to] = getPoolStripe({ externalLeagueId: pool.externalLeagueId })
  return { '--stripe-from': from, '--stripe-to': to } as CSSProperties
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
      return 'bg-silver'
    default:
      return 'bg-silver'
  }
}

function getPoolAction(pool: PoolData): { label: string; icon: 'arrow' | 'check' | null; className: string; isButton: boolean } {
  if (pool.status === 'completed') return {
    label: 'Results',
    icon: 'arrow',
    className: 'bg-silver text-ink',
    isButton: false,
  }
  // The 'closed' branch that used to sit here is unreachable now that
  // join-ability lives in accepting_members — a pool that has stopped taking
  // joiners is still fully playable for its existing members (migration 025).
  if (pool.has_submitted_predictions) return {
    label: 'Submitted',
    icon: 'check',
    className: 'bg-success-100 dark:bg-success-900/30 text-success-900 font-bold',
    isButton: false,
  }
  return {
    label: pool.currentRoundLabel ? `Predict ${pool.currentRoundLabel}` : 'Predict',
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

/**
 * The card's third tile: XP level on a World Cup pool, the open matchweek on a
 * league one.
 *
 * Two different facts in one slot, which is worth defending. XP does not exist
 * for a league — `entry_xp_state` is written by World Cup scoring and the
 * pre-tournament fallback counts rows in `predictions`, both empty for a league
 * entry — so the tile read "Level 1 · Rookie" on every league card no matter
 * what the member had done, and there is no in-pool Analytics tab on a league
 * pool to check it against. The matchweek is the equivalent orientation: how
 * far into the season this pool is. It is shown for Table mode too, where the
 * order was decided in August but is scored against the real table every week.
 *
 * One component rather than a conditional written twice, because the mobile and
 * desktop cards render the same tile and had already drifted nowhere only by
 * luck.
 */
function ProgressTile({ pool }: { pool: PoolData }) {
  if (pool.prediction_mode === 'league_pickem') {
    const mw = pool.openMatchweekNumber
    return (
      <div className="flex-[1.2] py-3 px-3">
        <p className="text-[10px] font-medium text-muted mb-1 tracking-wide">Matchweek</p>
        <p className={`text-xl font-bold leading-none ${mw == null ? 'text-muted' : 'text-primary-800'}`}>
          {mw == null ? '—' : mw}
        </p>
        {/* Null means no matchweek is open — every one is played or locked, so
            the season is done. Said plainly rather than left as a bare dash. */}
        <p className="text-[10px] text-muted mt-0.5">
          {mw == null ? 'Season over' : pool.matchweekCount ? `of ${pool.matchweekCount}` : 'this week'}
        </p>
      </div>
    )
  }
  const level = pool.highest_level ?? 1
  return (
    <div className="flex-[1.2] py-3 px-3">
      <p className="text-[10px] font-medium text-muted mb-1 tracking-wide">Level</p>
      <p className="text-xl font-bold text-primary-800 leading-none">{level}</p>
      <p className="text-[10px] text-muted mt-0.5">{getLevelName(level)}</p>
    </div>
  )
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
                  {filteredPools.map((pool, i) => {
                    const deadline = formatDeadline(pool.prediction_deadline)
                    const poolAction = getPoolAction(pool)
                    const isCopied = copiedPoolId === pool.pool_id
                    const isLinkCopied = linkCopiedPoolId === pool.pool_id
                    const statusText = getPoolStatusText(pool)

                    const hasBranding = !!(pool.brand_name && (pool.brand_emoji || pool.brand_logo_url) && pool.brand_color)

                    return (
                      <Link
                        key={pool.pool_id}
                        href={`/pools/${pool.pool_id}`}
                        className={`flex flex-col h-full rounded-card ${hasBranding ? '' : 'border border-border-subtle'} bg-surface hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-200 overflow-hidden animate-fade-up`}
                        style={{ animationDelay: `${i * 0.06}s` }}
                      >
                        {/* Branded accent strip */}
                        {hasBranding && (
                          <div className="flex items-center gap-2 px-4 py-2 text-white" style={{ backgroundColor: pool.brand_color! }}>
                            {pool.brand_logo_url ? (
                              <img src={pool.brand_logo_url} alt={pool.brand_name || ''} className="w-5 h-5 rounded-sm object-cover" />
                            ) : (
                              <span className="text-base">{pool.brand_emoji}</span>
                            )}
                            <span className="text-xs font-bold">{pool.brand_name}</span>
                            <span className="text-[10px] font-semibold ml-auto" style={{ color: 'rgba(255,255,255,0.85)' }}>Powered by SportPool</span>
                          </div>
                        )}

                        {/* ========== MOBILE CARD ========== */}
                        <div
                          className="md:hidden flex"
                          style={hasBranding ? { backgroundColor: `${pool.brand_color}1F` } : undefined}
                        >
                          {/* Mode stripe — the 5px full-height bar on every pool card in
                              the app. Branded pools get the brand banner above instead,
                              so they skip it, exactly as PoolListItem does in RN. */}
                          {!hasBranding && (
                            <span
                              aria-hidden="true"
                              className="w-[5px] shrink-0 pool-stripe"
                              style={stripeVars(pool)}
                            />
                          )}
                          <div className="flex-1 px-4 py-3.5">
                            {/* Header: name + tags + action pill */}
                            <div className="flex items-center justify-between gap-3 mb-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <h4 className="text-lg font-bold text-ink leading-snug min-w-0 truncate">
                                    {pool.pool_name}
                                  </h4>
                                  {(unreadCounts.get(pool.pool_id) ?? 0) > 0 && (
                                    <span className="min-w-[20px] h-[20px] px-1.5 rounded-pill bg-danger-500 text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                                      {(unreadCounts.get(pool.pool_id) ?? 0) > 99 ? '99+' : unreadCounts.get(pool.pool_id)}
                                    </span>
                                  )}
                                </div>
                                {/* Badges + player count */}
                                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                  {pool.role === 'admin' && <span className="text-[10px] px-1.5 py-0.5 rounded font-bold border border-border-default text-muted">Admin</span>}
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
                              {poolAction.isButton ? (
                                <button
                                  onClick={(e) => {
                                    e.preventDefault()
                                    router.push(`/pools/${pool.pool_id}?tab=predictions`)
                                  }}
                                  className={`shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-chip text-xs font-semibold ${poolAction.className}`}
                                >
                                  {poolAction.label}
                                  {poolAction.icon === 'arrow' && (
                                    <span className="ml-0.5">&rarr;</span>
                                  )}
                                </button>
                              ) : (
                                <span className={`shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-chip text-xs font-semibold ${poolAction.className}`}>
                                  {poolAction.label}
                                  {poolAction.icon === 'arrow' && (
                                    <span className="ml-0.5">&rarr;</span>
                                  )}
                                </span>
                              )}
                            </div>

                            {/* Stats grid */}
                            {(() => {
                              return (
                                <div className="flex items-stretch rounded-control bg-snow/75 mb-3 overflow-hidden">
                                  {/* Points */}
                                  <div className="flex-1 py-3 px-3">
                                    <p className="text-[10px] font-medium text-muted mb-1 tracking-wide">Points</p>
                                    <p className="text-xl font-bold text-primary-800 leading-none">
                                      {formatNumber(pool.total_points ?? 0)}
                                    </p>
                                  </div>
                                  <div className="w-px my-5 bg-silver" />
                                  {/* Rank */}
                                  <div className="flex-1 py-3 px-3">
                                    <p className="text-[10px] font-medium text-muted mb-1 tracking-wide">Rank</p>
                                    {pool.hasScoringStarted && pool.current_rank != null ? (
                                      <div className="flex items-baseline gap-1">
                                        <p className="text-xl font-bold text-ink leading-none">
                                          #{pool.current_rank}
                                        </p>
                                        <p className="text-[11px] text-muted leading-none">
                                          of {pool.totalEntries}
                                        </p>
                                      </div>
                                    ) : (
                                      <p className="text-xl font-bold text-muted leading-none">
                                        —
                                      </p>
                                    )}
                                  </div>
                                  <div className="w-px my-5 bg-silver" />
                                  <ProgressTile pool={pool} />
                                  {/* Form */}
                                  <div className="flex-1 py-3 px-3">
                                    <p className="text-[10px] font-medium text-muted mb-1 tracking-wide text-right">Form</p>
                                    <div className="flex items-center justify-end gap-[5px] mt-1.5">
                                      {pool.form.length > 0
                                        ? pool.form.map((type, i) => (
                                            <div key={i} className={`w-[10px] h-[10px] rounded-pill ${getFormDotClass(type)}`} />
                                          ))
                                        : [0, 1, 2, 3, 4].map((i) => (
                                            <div key={i} className="w-[10px] h-[10px] rounded-pill bg-silver" />
                                          ))
                                      }
                                    </div>
                                  </div>
                                </div>
                              )
                            })()}

                            {/* Bottom row: status + deadline */}
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-muted">
                                {statusText}
                              </span>
                              {deadline.text !== 'No deadline set' && (
                                <span className={`inline-flex items-center gap-1 text-xs font-semibold ${deadline.className}`}>
                                  <Icon name="clock" size={14} weight="semibold" />
                                  {deadline.text}
                                </span>
                              )}
                            </div>

                            {/* Invite nudge — admin pools with fewer than 10 members */}
                            {pool.role === 'admin' && pool.memberCount < 10 && (
                              <div className="mt-2.5 bg-primary-50 dark:bg-primary-500/10 rounded-chip px-3 py-2 flex items-center justify-between">
                                <span className="text-[11px] text-muted">
                                  {pool.memberCount} player{pool.memberCount !== 1 ? 's' : ''} &mdash; invite more
                                </span>
                                <div className="flex items-center gap-2 shrink-0 ml-2">
                                  <button
                                    onClick={(e) => handleCopyInviteLink(e, pool.pool_id, pool.pool_code)}
                                    className="text-[11px] text-primary-800 font-semibold hover:underline"
                                  >
                                    {isLinkCopied ? 'Copied!' : 'Copy Link'}
                                  </button>
                                  <span className="text-muted dark:text-muted">|</span>
                                  <button
                                    onClick={(e) => handleCopyCode(e, pool.pool_id, pool.pool_code)}
                                    className="text-[11px] text-primary-800 font-semibold hover:underline"
                                  >
                                    {isCopied ? 'Copied!' : 'Copy Code'}
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* ========== DESKTOP CARD ========== */}
                        <div
                          className="hidden md:flex flex-1"
                          style={hasBranding ? { backgroundColor: `${pool.brand_color}1F` } : undefined}
                        >
                          {!hasBranding && (
                            <span
                              aria-hidden="true"
                              className="w-[5px] shrink-0 pool-stripe"
                              style={stripeVars(pool)}
                            />
                          )}
                          {/* Column, so the status row below can be pushed to the
                              bottom when the grid stretches this card to match a
                              taller sibling. */}
                          <div className="flex-1 min-w-0 p-4 flex flex-col">
                            {/* Header row */}
                            <div className="flex items-center justify-between gap-3 mb-2">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <h4 className="text-lg font-bold text-ink truncate">
                                    {pool.pool_name}
                                  </h4>
                                  {(unreadCounts.get(pool.pool_id) ?? 0) > 0 && (
                                    <span className="min-w-[20px] h-[20px] px-1.5 rounded-pill bg-danger-500 text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                                      {(unreadCounts.get(pool.pool_id) ?? 0) > 99 ? '99+' : unreadCounts.get(pool.pool_id)}
                                    </span>
                                  )}
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                  {pool.role === 'admin' && <span className="text-[10px] px-1.5 py-0.5 rounded font-bold border border-border-default text-muted">Admin</span>}
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
                              {/* Desktop action pill */}
                              {poolAction.isButton ? (
                                <button
                                  onClick={(e) => {
                                    e.preventDefault()
                                    router.push(`/pools/${pool.pool_id}?tab=predictions`)
                                  }}
                                  className={`shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-chip text-xs font-semibold ${poolAction.className}`}
                                >
                                  {poolAction.label}
                                  {poolAction.icon === 'arrow' && <span className="ml-0.5">&rarr;</span>}
                                </button>
                              ) : (
                                <span className={`shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-chip text-xs font-semibold ${poolAction.className}`}>
                                  {poolAction.label}
                                  {poolAction.icon === 'arrow' && <span className="ml-0.5">&rarr;</span>}
                                </span>
                              )}
                            </div>

                            {/* Stats row */}
                            {(() => {
                              return (
                                <div className="flex items-stretch rounded-control bg-snow/75 mt-3 overflow-hidden">
                                  {/* Points */}
                                  <div className="flex-1 py-3 px-3">
                                    <p className="text-[10px] font-medium text-muted mb-1 tracking-wide">Points</p>
                                    <p className="text-xl font-bold text-primary-800 leading-none">
                                      {formatNumber(pool.total_points ?? 0)}
                                    </p>
                                  </div>
                                  <div className="w-px my-5 bg-silver" />
                                  {/* Rank */}
                                  <div className="flex-1 py-3 px-3">
                                    <p className="text-[10px] font-medium text-muted mb-1 tracking-wide">Rank</p>
                                    {pool.hasScoringStarted && pool.current_rank != null ? (
                                      <div className="flex items-baseline gap-1">
                                        <p className="text-xl font-bold text-ink leading-none">
                                          #{pool.current_rank}
                                        </p>
                                        <p className="text-[11px] text-muted leading-none">
                                          of {pool.totalEntries}
                                        </p>
                                      </div>
                                    ) : (
                                      <p className="text-xl font-bold text-muted leading-none">
                                        —
                                      </p>
                                    )}
                                  </div>
                                  <div className="w-px my-5 bg-silver" />
                                  <ProgressTile pool={pool} />
                                  {/* Form */}
                                  <div className="flex-1 py-3 px-3">
                                    <p className="text-[10px] font-medium text-muted mb-1 tracking-wide text-right">Form</p>
                                    <div className="flex items-center justify-end gap-[5px] mt-1.5">
                                      {pool.form.length > 0
                                        ? pool.form.map((type, i) => (
                                            <div key={i} className={`w-[10px] h-[10px] rounded-pill ${getFormDotClass(type)}`} />
                                          ))
                                        : [0, 1, 2, 3, 4].map((i) => (
                                            <div key={i} className="w-[10px] h-[10px] rounded-pill bg-silver" />
                                          ))
                                      }
                                    </div>
                                  </div>
                                </div>
                              )
                            })()}

                            {/* Bottom row — mt-auto pins it to the card's foot so a
                                stretched card puts its whitespace in the middle
                                rather than dangling below the status line. */}
                            <div className="flex items-center justify-between mt-auto pt-3 border-t border-border-subtle">
                              <span className="text-[11px] text-muted">
                                {statusText}
                              </span>
                              {deadline.text !== 'No deadline set' && (
                                <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${deadline.className}`}>
                                  <Icon name="clock" size={14} weight="semibold" />
                                  {deadline.text}
                                </span>
                              )}
                            </div>

                            {/* Invite nudge — admin pools with fewer than 10 members */}
                            {pool.role === 'admin' && pool.memberCount < 10 && (
                              <div className="mt-3 bg-primary-50 dark:bg-primary-500/10 rounded-chip px-3 py-2 flex items-center justify-between">
                                <span className="text-[11px] text-muted">
                                  {pool.memberCount} player{pool.memberCount !== 1 ? 's' : ''} &mdash; invite more to make it interesting
                                </span>
                                <div className="flex items-center gap-2 shrink-0 ml-2">
                                  <button
                                    onClick={(e) => handleCopyInviteLink(e, pool.pool_id, pool.pool_code)}
                                    className="text-[11px] text-primary-800 font-semibold hover:underline"
                                  >
                                    {isLinkCopied ? 'Copied!' : 'Copy Link'}
                                  </button>
                                  <span className="text-muted dark:text-muted">|</span>
                                  <button
                                    onClick={(e) => handleCopyCode(e, pool.pool_id, pool.pool_code)}
                                    className="text-[11px] text-primary-800 font-semibold hover:underline"
                                  >
                                    {isCopied ? 'Copied!' : 'Copy Code'}
                                  </button>
                                </div>
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
                    const deadline = formatDeadline(pool.prediction_deadline)

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
                              {deadline.text !== 'No deadline set' && (
                                <span className={`inline-flex items-center gap-1 text-xs font-semibold ${deadline.className}`}>
                                  <Icon name="clock" size={14} weight="semibold" />
                                  {deadline.text}
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
                              {deadline.text !== 'No deadline set' && (
                                <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${deadline.className}`}>
                                  <Icon name="clock" size={14} weight="semibold" />
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
