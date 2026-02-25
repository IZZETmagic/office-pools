'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/Card'
import { Badge, getStatusVariant } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { AppHeader } from '@/components/ui/AppHeader'
import { JoinPoolModal } from '@/components/pools/JoinPoolModal'
import { CreatePoolModal } from '@/components/pools/CreatePoolModal'
import { formatNumber } from '@/lib/format'

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
  tournament_id: string
  created_at: string
  role: string
  total_points: number
  current_rank: number | null
  has_submitted_predictions: boolean
  joined_at: string
  memberCount: number
}

type PublicPool = {
  pool_id: string
  pool_name: string
  pool_code: string
  description: string | null
  status: string
  prediction_deadline: string | null
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

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
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

// =====================
// POOL CARD (for My Pools)
// =====================
function PoolCard({ pool }: { pool: PoolData }) {
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
      <div className="flex justify-between items-start mb-4">
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
      <div className="grid grid-cols-3 gap-2 mb-4 text-center">
        <div className="bg-neutral-50 dark:bg-surface-tertiary dark:border dark:border-border-default rounded-lg py-2 px-1">
          <p className="text-lg font-bold text-neutral-900">{formatNumber(pool.total_points ?? 0)}</p>
          <p className="text-xs text-neutral-500">Points</p>
        </div>
        <div className="bg-neutral-50 dark:bg-surface-tertiary dark:border dark:border-border-default rounded-lg py-2 px-1">
          <span className="text-lg font-bold text-neutral-900 inline-flex items-center gap-1">
            {pool.current_rank ? (
              <>#{pool.current_rank}</>
            ) : (
              '--'
            )}
            <span className="text-neutral-400 font-normal text-sm">/ {pool.memberCount}</span>
          </span>
          <p className="text-xs text-neutral-500">Rank</p>
        </div>
        <div className="bg-neutral-50 dark:bg-surface-tertiary dark:border dark:border-border-default rounded-lg py-2 px-1">
          <p className="text-lg font-bold text-neutral-900">{pool.memberCount}</p>
          <p className="text-xs text-neutral-500">Members</p>
        </div>
      </div>

      {/* Status row */}
      <div className="flex items-center justify-between mb-4 text-xs">
        <span className="text-neutral-500">
          Joined {formatDate(pool.joined_at)}
        </span>
        <span className={deadline.className}>{deadline.text}</span>
      </div>

      {/* CTA */}
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
// PUBLIC POOL CARD (for Discover)
// =====================
function PublicPoolCard({ pool, onJoin }: { pool: PublicPool; onJoin: (code: string) => void }) {
  const deadline = formatDeadline(pool.prediction_deadline)

  return (
    <Card>
      <div className="flex justify-between items-start mb-3">
        <div className="min-w-0 flex-1 mr-3">
          <h4 className="text-base font-bold text-neutral-900 truncate">{pool.pool_name}</h4>
          {pool.description && (
            <p className="text-sm text-neutral-500 mt-0.5 line-clamp-2">{pool.description}</p>
          )}
        </div>
        <Badge variant={getStatusVariant(pool.status)}>{pool.status}</Badge>
      </div>

      <div className="flex items-center gap-4 mb-4 text-xs text-neutral-500">
        <span className="inline-flex items-center gap-1">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
          </svg>
          {pool.memberCount} members
        </span>
        <span className={deadline.className}>{deadline.text}</span>
      </div>

      <Button
        variant="primary"
        size="sm"
        fullWidth
        onClick={() => onJoin(pool.pool_code)}
      >
        Join Pool
      </Button>
    </Card>
  )
}

// =====================
// MAIN COMPONENT
// =====================
export function PoolsClient({ user, pools, stats }: PoolsClientProps) {
  const router = useRouter()

  // Tab state
  const [activeTab, setActiveTab] = useState<'my-pools' | 'discover'>('my-pools')

  // Filter state (My Pools)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortBy, setSortBy] = useState('newest')

  // Discover state
  const [discoverQuery, setDiscoverQuery] = useState('')
  const [discoverResults, setDiscoverResults] = useState<PublicPool[]>([])
  const [discoverLoading, setDiscoverLoading] = useState(false)
  const [discoverSearched, setDiscoverSearched] = useState(false)

  // Modal state
  const [showJoinModal, setShowJoinModal] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [joinInitialCode, setJoinInitialCode] = useState('')

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

    // Sort: open pools first, then by selected sort
    const statusOrder: Record<string, number> = { open: 0, active: 1, closed: 2, completed: 3 }
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

  const handleJoinFromDiscover = (code: string) => {
    setJoinInitialCode(code)
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
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
          <div className="flex items-center gap-5">
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-white/20 dark:bg-white/10 backdrop-blur-sm flex items-center justify-center text-white text-2xl sm:text-3xl font-bold border-2 border-white/30 dark:border-white/15 shadow-lg shrink-0">
              {getInitials(user.full_name, user.username)}
            </div>
            <div className="min-w-0">
              <h2 className="text-2xl sm:text-3xl font-bold text-white truncate">
                Pools
              </h2>
              <p className="text-primary-100 dark:text-white/60 text-sm sm:text-base">
                Create, manage, and discover prediction pools
              </p>
            </div>
          </div>

          {/* Quick stats in hero */}
          <div className="grid grid-cols-3 gap-3 mt-6">
            <div className="bg-white/10 backdrop-blur-sm rounded-lg px-3 py-2.5 text-center border border-white/10">
              <p className="text-xl sm:text-2xl font-bold text-white">{stats.totalPools}</p>
              <p className="text-xs text-primary-200 dark:text-white/50">Total Pools</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-lg px-3 py-2.5 text-center border border-white/10">
              <p className="text-xl sm:text-2xl font-bold text-white">{stats.activePools}</p>
              <p className="text-xs text-primary-200 dark:text-white/50">Active</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-lg px-3 py-2.5 text-center border border-white/10">
              <p className="text-xl sm:text-2xl font-bold text-white">{formatNumber(stats.totalPoints)}</p>
              <p className="text-xs text-primary-200 dark:text-white/50">Total Points</p>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Tab bar + Action buttons */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex gap-1 bg-neutral-100 rounded-lg p-1">
            <button
              onClick={() => setActiveTab('my-pools')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'my-pools'
                  ? 'bg-surface text-neutral-900 shadow-sm'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              My Pools
            </button>
            <button
              onClick={() => setActiveTab('discover')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'discover'
                  ? 'bg-surface text-neutral-900 shadow-sm'
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
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary-600 bg-primary-50 border border-primary-200 rounded-lg hover:bg-primary-100 hover:border-primary-300 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM3 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 9.374 21c-2.331 0-4.512-.645-6.374-1.766Z" />
              </svg>
              Join
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-success-600 bg-success-50 border border-success-200 rounded-lg hover:bg-success-100 hover:border-success-300 transition-colors"
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
                  className="px-3 py-2 border border-neutral-300 rounded-lg text-sm text-neutral-700 bg-surface focus:ring-2 focus:ring-primary-500 focus:border-transparent"
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
                  className="px-3 py-2 border border-neutral-300 rounded-lg text-sm text-neutral-700 bg-surface focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="newest">Newest Joined</option>
                  <option value="oldest">Oldest Joined</option>
                  <option value="name">Name A-Z</option>
                  <option value="points">Most Points</option>
                </select>
              </div>
            </div>

            {/* Pool grid */}
            {filteredPools.length === 0 ? (
              <Card padding="lg" className="text-center">
                {pools.length === 0 ? (
                  <>
                    <p className="text-neutral-600 text-lg mb-2">You haven&apos;t joined any pools yet.</p>
                    <p className="text-neutral-500 mb-4">Use the Join or Create buttons above, or switch to the Discover tab to find public pools.</p>
                    <div className="flex justify-center gap-3">
                      <Button onClick={() => setShowJoinModal(true)} size="sm">
                        Join a Pool
                      </Button>
                      <Button onClick={() => setActiveTab('discover')} variant="outline" size="sm">
                        Discover Pools
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-neutral-600 text-lg mb-1">No pools match your filters.</p>
                    <p className="text-neutral-500">
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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredPools.map((pool) => (
                    <PoolCard key={pool.pool_id} pool={pool} />
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {/* DISCOVER TAB */}
        {activeTab === 'discover' && (
          <>
            <div className="mb-6">
              <Input
                type="text"
                value={discoverQuery}
                onChange={(e) => setDiscoverQuery(e.target.value)}
                placeholder="Search public pools by name, code, or description..."
              />
              <p className="text-xs text-neutral-500 mt-1.5">
                Find and join public pools created by other users.
              </p>
            </div>

            {discoverLoading ? (
              <div className="text-center py-12">
                <div className="inline-block w-6 h-6 border-2 border-primary-300 border-t-primary-600 rounded-full animate-spin" />
                <p className="text-neutral-500 text-sm mt-2">Searching pools...</p>
              </div>
            ) : discoverResults.length > 0 ? (
              <>
                <p className="text-sm text-neutral-500 mb-3">
                  {discoverResults.length} public pool{discoverResults.length !== 1 ? 's' : ''} found
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {discoverResults.map((pool) => (
                    <PublicPoolCard
                      key={pool.pool_id}
                      pool={pool}
                      onJoin={handleJoinFromDiscover}
                    />
                  ))}
                </div>
              </>
            ) : discoverSearched ? (
              <Card padding="lg" className="text-center">
                <p className="text-neutral-600 text-lg mb-1">No public pools found.</p>
                <p className="text-neutral-500">
                  {discoverQuery
                    ? 'Try a different search term or create your own pool.'
                    : 'There are no open public pools available right now.'}
                </p>
              </Card>
            ) : null}
          </>
        )}
      </main>

      {/* Modals */}
      {showJoinModal && (
        <JoinPoolModal
          onClose={() => { setShowJoinModal(false); setJoinInitialCode('') }}
          onSuccess={handleModalSuccess}
          initialCode={joinInitialCode}
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
