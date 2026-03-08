'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { AppHeader } from '@/components/ui/AppHeader'
import { JoinPoolModal } from '@/components/pools/JoinPoolModal'
import { CreatePoolModal } from '@/components/pools/CreatePoolModal'
import { formatNumber } from '@/lib/format'
import { useSlideIndicator } from '@/hooks/useSlideIndicator'

// =====================
// TYPES
// =====================
type EntryProgress = {
  entry_id: string
  entry_name: string
  predictedMatches: number
  has_submitted: boolean
}

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
  entries: EntryProgress[]
}

type ActivityItemBase = {
  poolName: string
  poolId: string
  date: string
}

type ActivityItem =
  | (ActivityItemBase & { type: 'joined'; hasPredictions: boolean })
  | (ActivityItemBase & { type: 'submitted'; entryName: string })
  | (ActivityItemBase & { type: 'auto_submitted'; entryName: string })
  | (ActivityItemBase & { type: 'entry_created'; entryName: string })
  | (ActivityItemBase & { type: 'deadline_passed' })

type UpcomingMatch = {
  match_id: string
  match_number: number
  stage: string
  match_date: string
  status: string
  home_team: { country_name: string; flag_url: string | null } | null
  away_team: { country_name: string; flag_url: string | null } | null
  home_team_placeholder: string | null
  away_team_placeholder: string | null
}

type LiveMatch = UpcomingMatch & {
  home_score_ft: number | null
  away_score_ft: number | null
}

type DashboardClientProps = {
  user: { user_id: string; username: string; full_name: string; is_super_admin?: boolean }
  pools: PoolCardData[]
  liveMatches: LiveMatch[]
  upcomingMatches: UpcomingMatch[]
  activities: ActivityItem[]
  totalPools: number
  totalPoints: number
  bestRank: number | null
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

function formatDeadline(deadline: string | null) {
  if (!deadline) return { text: 'No deadline set', className: 'text-neutral-500' }

  const deadlineDate = new Date(deadline)
  const now = new Date()
  const daysUntil = Math.floor((deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

  const formatted = deadlineDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  if (daysUntil < 0) {
    return { text: `${formatted} (closed)`, className: 'text-danger-600 font-semibold' }
  } else if (daysUntil === 0) {
    return { text: `${formatted} (today!)`, className: 'text-danger-600 font-semibold' }
  } else if (daysUntil === 1) {
    return { text: `${formatted} (1 day)`, className: 'text-warning-600 font-semibold' }
  } else if (daysUntil < 7) {
    return { text: `${formatted} (${daysUntil} days)`, className: 'text-warning-600 font-semibold' }
  } else {
    return { text: `${formatted} (${daysUntil} days)`, className: 'text-neutral-600' }
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

function formatStageShort(stage: string) {
  const map: Record<string, string> = {
    group: 'GS',
    round_32: 'R32',
    round_16: 'R16',
    quarter_final: 'QF',
    semi_final: 'SF',
    third_place: '3rd',
    finals: 'F',
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

function getElapsedTime(matchDate: string): string | null {
  const start = new Date(matchDate)
  const now = new Date()
  const elapsedMinutes = Math.floor((now.getTime() - start.getTime()) / 60000)

  if (elapsedMinutes < 0) return null
  if (elapsedMinutes <= 45) return `${elapsedMinutes}'`
  if (elapsedMinutes <= 60) return 'HT'
  if (elapsedMinutes <= 105) return `${elapsedMinutes - 15}'` // subtract 15 min HT
  if (elapsedMinutes <= 120) return 'FT'
  return 'FT'
}

function formatDayHeader(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const activityDay = new Date(date.getFullYear(), date.getMonth(), date.getDate())

  if (activityDay.getTime() === today.getTime()) return 'Today'
  if (activityDay.getTime() === yesterday.getTime()) return 'Yesterday'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function ActivityIcon({ type }: { type: ActivityItem['type'] }) {
  const base = 'w-4.5 h-4.5'
  switch (type) {
    case 'joined':
      return (
        <svg className={base} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM3 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 019.374 21c-2.331 0-4.512-.645-6.374-1.766z" />
        </svg>
      )
    case 'submitted':
      return (
        <svg className={base} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    case 'auto_submitted':
      return (
        <svg className={base} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    case 'entry_created':
      return (
        <svg className={base} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
      )
    case 'deadline_passed':
      return (
        <svg className={base} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
        </svg>
      )
  }
}

function activityIconColor(type: ActivityItem['type']): string {
  switch (type) {
    case 'joined': return 'text-primary-500 bg-primary-50'
    case 'submitted': return 'text-success-600 bg-success-50'
    case 'auto_submitted': return 'text-warning-600 bg-warning-50'
    case 'entry_created': return 'text-primary-500 bg-primary-50'
    case 'deadline_passed': return 'text-neutral-500 bg-neutral-100'
  }
}

function activityDescription(activity: ActivityItem, poolLink: React.ReactNode): React.ReactNode {
  switch (activity.type) {
    case 'joined':
      return <>Joined {poolLink}</>
    case 'submitted':
      return <>Submitted <span className="font-medium">{activity.entryName}</span> for {poolLink}</>
    case 'auto_submitted':
      return <><span className="font-medium">{activity.entryName}</span> auto-submitted for {poolLink}</>
    case 'entry_created':
      return <>Added entry <span className="font-medium">{activity.entryName}</span> in {poolLink}</>
    case 'deadline_passed':
      return <>Predictions locked for {poolLink}</>
  }
}

// =====================
// MOBILE POOL CARD
// =====================
function MobilePoolCard({ pool }: { pool: PoolCardData }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(pool.pool_code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback - ignore
    }
  }

  return (
    <Link
      href={`/pools/${pool.pool_id}`}
      className="shrink-0 w-48 min-h-[10rem] bg-surface rounded-2xl shadow dark:shadow-none dark:border dark:border-border-default p-4 flex flex-col hover:shadow-md transition-shadow"
    >
      <h4 className="text-sm font-bold text-neutral-900 line-clamp-2">{pool.pool_name}</h4>
      {pool.role === 'admin' && (
        <div className="flex gap-1.5 flex-wrap mt-2 text-[10px] [&>span]:text-[10px] [&>span]:px-1.5 [&>span]:py-0">
          <Badge variant="outline">Admin</Badge>
        </div>
      )}
      <div className="mt-auto pt-3 flex items-end justify-between">
        <div>
          <p className="text-xs text-neutral-500">Points</p>
          <p className="text-2xl font-bold text-neutral-900 leading-tight">{formatNumber(pool.total_points ?? 0)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-neutral-500">Rank</p>
          <p className="text-2xl font-bold text-neutral-900 leading-tight">
            #{pool.current_rank ?? '--'}
          </p>
        </div>
      </div>
    </Link>
  )
}

// =====================
// POOL CARD
// =====================
function PoolCard({ pool }: { pool: PoolCardData }) {
  const deadline = formatDeadline(pool.prediction_deadline)

  return (
    <Link
      href={`/pools/${pool.pool_id}`}
      className="block bg-surface rounded-2xl shadow dark:shadow-none dark:border dark:border-border-default p-6 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
    >
      {/* Header */}
      <div className="flex justify-between items-start mb-5">
        <h4 className="text-lg font-bold text-neutral-900 truncate min-w-0 flex-1 mr-3">{pool.pool_name}</h4>
        {pool.role === 'admin' && (
          <div className="shrink-0">
            <Badge variant="outline">Admin</Badge>
          </div>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 mb-5 text-center">
        <div className="bg-neutral-50 dark:bg-surface-tertiary dark:border dark:border-border-default rounded-xl py-2 px-1">
          <p className="text-lg font-bold text-neutral-900">{formatNumber(pool.total_points ?? 0)}</p>
          <p className="text-xs text-neutral-500">Total Points</p>
        </div>
        <div className="bg-neutral-50 dark:bg-surface-tertiary dark:border dark:border-border-default rounded-xl py-2 px-1 flex items-center justify-center">
          <span className="text-lg font-bold text-neutral-900 inline-flex items-center gap-1 whitespace-nowrap">
            {pool.current_rank ? (
              <>
                {pool.current_rank <= 3 && (
                  <span>{pool.current_rank === 1 ? '🥇' : pool.current_rank === 2 ? '🥈' : '🥉'}</span>
                )}
                <span>#{pool.current_rank}<span className="text-neutral-400 font-normal"> / {pool.memberCount}</span></span>
              </>
            ) : (
              <span>--<span className="text-neutral-400 font-normal"> / {pool.memberCount}</span></span>
            )}
          </span>
        </div>
        <div className="bg-neutral-50 dark:bg-surface-tertiary dark:border dark:border-border-default rounded-xl py-2 px-1">
          <p className="text-lg font-bold text-neutral-900">{pool.completedMatches}/{pool.totalMatches}</p>
          <p className="text-xs text-neutral-500">Matches</p>
        </div>
      </div>

      {/* Deadline */}
      <div className="text-xs">
        <span className="text-neutral-500">Pool closes: </span>
        <span className={deadline.className}>{deadline.text}</span>
      </div>
    </Link>
  )
}

// =====================
// ACTIVITY LIST WITH EXPAND/COLLAPSE ANIMATION
// =====================
function ActivityList({
  activities,
  showAll,
  onToggle,
}: {
  activities: ActivityItem[]
  showAll: boolean
  onToggle: () => void
}) {
  const firstThree = activities.slice(0, 3)
  const rest = activities.slice(3)
  let dayCounter = ''

  function renderItem(activity: ActivityItem, idx: number, list: ActivityItem[], startIdx: number) {
    const dayHeader = formatDayHeader(activity.date)
    const globalIdx = startIdx + idx
    const showHeader = dayHeader !== dayCounter
    dayCounter = dayHeader
    const poolLink = (
      <Link href={`/pools/${activity.poolId}`} className="font-medium text-primary-600 hover:underline">
        {activity.poolName}
      </Link>
    )
    return (
      <li key={globalIdx}>
        {showHeader && (
          <p className={`text-[11px] font-semibold uppercase tracking-wider text-neutral-400 ${globalIdx > 0 ? 'mt-4 pt-3 border-t border-neutral-100 dark:border-border-default' : ''} mb-2`}>
            {dayHeader}
          </p>
        )}
        <div className={`flex items-start gap-3 ${!showHeader && globalIdx > 0 ? 'pt-3 border-t border-neutral-50 dark:border-border-default' : ''} ${idx < list.length - 1 || (startIdx === 0 && rest.length > 0) ? 'pb-3' : ''}`}>
          <span className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${activityIconColor(activity.type)}`} aria-hidden="true">
            <ActivityIcon type={activity.type} />
          </span>
          <div className="min-w-0 pt-0.5">
            <p className="text-sm text-neutral-900">
              {activityDescription(activity, poolLink)}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-neutral-500">{timeAgo(activity.date)}</span>
              {activity.type === 'joined' && !activity.hasPredictions && (
                <Badge variant="yellow">Needs predictions</Badge>
              )}
              {activity.type === 'auto_submitted' && (
                <Badge variant="blue">Auto</Badge>
              )}
            </div>
          </div>
        </div>
      </li>
    )
  }

  return (
    <Card>
      <ul>
        {firstThree.map((a, i) => renderItem(a, i, firstThree, 0))}
      </ul>
      {rest.length > 0 && (
        <>
          <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${showAll ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
            <div className="overflow-hidden">
              <ul>
                {rest.map((a, i) => renderItem(a, i, rest, 3))}
              </ul>
            </div>
          </div>
          <button
            onClick={onToggle}
            className="w-full mt-3 pt-3 border-t border-neutral-100 dark:border-border-default text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors"
          >
            {showAll ? 'Show less' : `Show ${rest.length} more`}
          </button>
        </>
      )}
    </Card>
  )
}

// =====================
// MAIN COMPONENT
// =====================
export function DashboardClient({
  user,
  pools,
  liveMatches,
  upcomingMatches,
  activities,
  totalPools,
  totalPoints,
  bestRank,
}: DashboardClientProps) {
  const router = useRouter()

  // Modal state
  const [showJoinModal, setShowJoinModal] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showAllActivity, setShowAllActivity] = useState(false)
  const [matchTab, setMatchTab] = useState<'live' | 'upcoming'>(liveMatches.length > 0 ? 'live' : 'upcoming')
  const [matchTabDir, setMatchTabDir] = useState<'left' | 'right'>('right')
  const { containerRef: matchTabRef, indicatorStyle: matchIndicator, ready: matchTabReady } = useSlideIndicator(matchTab)

  const switchMatchTab = useCallback((tab: 'live' | 'upcoming') => {
    if (tab === matchTab) return
    setMatchTabDir(tab === 'upcoming' ? 'right' : 'left')
    setMatchTab(tab)
  }, [matchTab])

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
                Welcome, {user.full_name || user.username || 'Player'}!
              </h2>
              <p className="text-primary-100 dark:text-white/60 text-xs sm:text-base">@{user.username}</p>
            </div>
          </div>

          {/* Quick stats in hero — compact on mobile, glass cards on desktop */}
          {/* Mobile: inline row with dividers */}
          <div className="flex items-center justify-around mt-3 sm:hidden">
            <div className="text-center">
              <p className="text-lg font-bold text-white">{totalPools}</p>
              <p className="text-[10px] text-primary-200 dark:text-white/50">Active Pools</p>
            </div>
            <div className="w-px h-8 bg-white/20" />
            <div className="text-center">
              <p className="text-lg font-bold text-white flex items-center justify-center gap-1">
                {bestRank === 1 && (
                  <svg className="w-4 h-4 text-accent-500" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M5 3h14l-1.5 6.5a1 1 0 01-.97.75H7.47a1 1 0 01-.97-.75L5 3zm2.5 0L9 8h6l1.5-5h-9zM12 12a3 3 0 100 6 3 3 0 000-6zm0 2a1 1 0 110 2 1 1 0 010-2zM8 20h8a1 1 0 110 2H8a1 1 0 110-2z"/>
                  </svg>
                )}
                {bestRank ? `#${bestRank}` : '--'}
              </p>
              <p className="text-[10px] text-primary-200 dark:text-white/50">Best Rank</p>
            </div>
            <div className="w-px h-8 bg-white/20" />
            <div className="text-center">
              <p className="text-lg font-bold text-white">{formatNumber(totalPoints)}</p>
              <p className="text-[10px] text-primary-200 dark:text-white/50">Total Points</p>
            </div>
          </div>
          {/* Desktop: glass stat cards */}
          <div className="hidden sm:grid grid-cols-3 gap-4 mt-6">
            <div className="bg-white/10 backdrop-blur-sm rounded-xl px-3 py-3 text-center border border-white/10">
              <p className="text-2xl font-bold text-white">{totalPools}</p>
              <p className="text-xs text-primary-200 dark:text-white/50">Active Pools</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl px-3 py-3 text-center border-l-2 border-white/20 border border-white/10">
              <p className={`font-bold text-white flex items-center justify-center gap-1.5 ${bestRank === 1 ? 'text-3xl' : 'text-2xl'}`}>
                {bestRank === 1 && (
                  <svg className="w-6 h-6 text-accent-500" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M5 3h14l-1.5 6.5a1 1 0 01-.97.75H7.47a1 1 0 01-.97-.75L5 3zm2.5 0L9 8h6l1.5-5h-9zM12 12a3 3 0 100 6 3 3 0 000-6zm0 2a1 1 0 110 2 1 1 0 010-2zM8 20h8a1 1 0 110 2H8a1 1 0 110-2z"/>
                  </svg>
                )}
                {bestRank ? `#${bestRank}` : '--'}
              </p>
              <p className="text-xs text-primary-200 dark:text-white/50">Best Rank</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl px-3 py-3 text-center border-l-2 border-white/20 border border-white/10">
              <p className="text-2xl font-bold text-white">{formatNumber(totalPoints)}</p>
              <p className="text-xs text-primary-200 dark:text-white/50">Total Points</p>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">

        {/* My Pools section */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h3 className="text-xl font-bold text-neutral-900">My Pools</h3>
              <Link
                href="/pools"
                className="text-sm text-primary-600 hover:text-primary-700 font-medium"
              >
                View All &rarr;
              </Link>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowJoinModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-neutral-600 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
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

          {pools.length === 0 ? (
            <Card padding="lg" className="text-center">
              <p className="text-neutral-600 text-lg mb-2">You haven&apos;t joined any pools yet.</p>
              <p className="text-neutral-500 mb-4">Use the buttons above to join or create a pool.</p>
              <Link
                href="/pools?tab=discover"
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-primary-600 bg-primary-50 border border-primary-200 rounded-xl hover:bg-primary-100 hover:border-primary-300 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                </svg>
                Discover Pools
              </Link>
            </Card>
          ) : (
            <>
              {/* Mobile: compact horizontal scroll strip with edge fades */}
              <div className="md:hidden relative">
                <div className="absolute left-0 top-0 bottom-2 w-4 bg-gradient-to-r from-surface-secondary to-transparent z-10 pointer-events-none" />
                <div className="absolute right-0 top-0 bottom-2 w-8 bg-gradient-to-l from-surface-secondary to-transparent z-10 pointer-events-none" />
                <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2 px-2" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                  {[...pools].sort((a, b) => {
                    const aScore = !a.has_submitted_predictions && a.predictedMatches > 0 && a.predictedMatches < a.totalMatches
                      ? 0 : !a.has_submitted_predictions && a.predictedMatches === 0 ? 1 : 2
                    const bScore = !b.has_submitted_predictions && b.predictedMatches > 0 && b.predictedMatches < b.totalMatches
                      ? 0 : !b.has_submitted_predictions && b.predictedMatches === 0 ? 1 : 2
                    if (aScore !== bScore) return aScore - bScore
                    const aDeadline = a.prediction_deadline ? new Date(a.prediction_deadline).getTime() : Infinity
                    const bDeadline = b.prediction_deadline ? new Date(b.prediction_deadline).getTime() : Infinity
                    return aDeadline - bDeadline
                  }).map((pool) => (
                    <MobilePoolCard key={pool.pool_id} pool={pool} />
                  ))}
                </div>
              </div>

              {/* Desktop: full card grid */}
              <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[...pools].sort((a, b) => {
                  const aScore = !a.has_submitted_predictions && a.predictedMatches > 0 && a.predictedMatches < a.totalMatches
                    ? 0 : !a.has_submitted_predictions && a.predictedMatches === 0 ? 1 : 2
                  const bScore = !b.has_submitted_predictions && b.predictedMatches > 0 && b.predictedMatches < b.totalMatches
                    ? 0 : !b.has_submitted_predictions && b.predictedMatches === 0 ? 1 : 2
                  if (aScore !== bScore) return aScore - bScore
                  const aDeadline = a.prediction_deadline ? new Date(a.prediction_deadline).getTime() : Infinity
                  const bDeadline = b.prediction_deadline ? new Date(b.prediction_deadline).getTime() : Infinity
                  return aDeadline - bDeadline
                }).map((pool) => (
                  <PoolCard key={pool.pool_id} pool={pool} />
                ))}
              </div>
            </>
          )}
        </div>

        {/* ===== MOBILE: Combined Matches Section ===== */}
        {(liveMatches.length > 0 || upcomingMatches.length > 0) && (
          <div className="md:hidden mb-8">
            {/* Header with live count */}
            <div className="flex items-center gap-2.5 mb-4">
              <h3 className="text-xl font-bold text-neutral-900">Matches</h3>
              {liveMatches.length > 0 && (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-danger-700 bg-danger-100 px-2.5 py-1 rounded-full">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-danger-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-danger-500" />
                  </span>
                  {liveMatches.length} LIVE
                </span>
              )}
            </div>

            {/* Tab toggle */}
            <div ref={matchTabRef} className="relative bg-neutral-100 dark:bg-surface-tertiary rounded-xl p-1 flex mb-4">
              <div
                className={`absolute top-1 bottom-1 bg-surface rounded-lg shadow-sm pointer-events-none ${matchTabReady ? 'transition-all duration-300 ease-out' : ''}`}
                style={{ left: matchIndicator.left, width: matchIndicator.width }}
              />
              <button
                data-tab-key="live"
                onClick={() => switchMatchTab('live')}
                className={`relative z-10 flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
                  matchTab === 'live'
                    ? 'text-neutral-900'
                    : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
                }`}
              >
                Live Now
              </button>
              <button
                data-tab-key="upcoming"
                onClick={() => switchMatchTab('upcoming')}
                className={`relative z-10 flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
                  matchTab === 'upcoming'
                    ? 'text-neutral-900'
                    : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
                }`}
              >
                Upcoming
              </button>
            </div>

            {/* Tab content with slide animation */}
            <div className="overflow-hidden">
            <div
              key={matchTab}
              className={matchTabDir === 'right' ? 'animate-[slideInRight_250ms_ease-out]' : 'animate-[slideInLeft_250ms_ease-out]'}
            >
            {matchTab === 'live' ? (
              liveMatches.length === 0 ? (
                <Card>
                  <p className="text-neutral-500 text-sm text-center py-2">No live matches right now.</p>
                </Card>
              ) : (
                <div className="space-y-3">
                  {liveMatches.map((match) => {
                    const homeTeamData = match.home_team as any
                    const awayTeamData = match.away_team as any
                    const homeTeam = homeTeamData?.country_name ?? match.home_team_placeholder ?? 'TBD'
                    const awayTeam = awayTeamData?.country_name ?? match.away_team_placeholder ?? 'TBD'
                    const homeFlagUrl = homeTeamData?.flag_url ?? null
                    const awayFlagUrl = awayTeamData?.flag_url ?? null
                    const elapsed = match.match_date ? getElapsedTime(match.match_date) : null
                    return (
                      <Card key={match.match_id} className="border-danger-200/60 dark:border-danger-800/50">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-xs text-neutral-500">
                            {formatStage(match.stage)} &middot; #{match.match_number}
                          </p>
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-danger-600 px-2 py-0.5 rounded-full">
                              <span className="relative flex h-1.5 w-1.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-danger-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-danger-500" />
                              </span>
                              LIVE
                            </span>
                            {elapsed && (
                              <span className="text-xs font-semibold text-danger-600">{elapsed}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex-1 flex items-center justify-end gap-2 pr-3">
                            {homeFlagUrl && <img src={homeFlagUrl} alt={homeTeam} className="w-7 h-5 rounded-[2px] object-cover shrink-0" />}
                            <p className="font-semibold text-neutral-900 text-sm">{homeTeam}</p>
                          </div>
                          <div className="flex items-center gap-3 px-4 py-2 bg-neutral-50 dark:bg-surface-tertiary rounded-xl border border-neutral-200 dark:border-border-default">
                            <span className="text-2xl font-extrabold text-neutral-900">{match.home_score_ft ?? 0}</span>
                            <span className="text-neutral-400 text-lg">-</span>
                            <span className="text-2xl font-extrabold text-neutral-900">{match.away_score_ft ?? 0}</span>
                          </div>
                          <div className="flex-1 flex items-center gap-2 pl-3">
                            <p className="font-semibold text-neutral-900 text-sm">{awayTeam}</p>
                            {awayFlagUrl && <img src={awayFlagUrl} alt={awayTeam} className="w-7 h-5 rounded-[2px] object-cover shrink-0" />}
                          </div>
                        </div>
                      </Card>
                    )
                  })}
                </div>
              )
            ) : (
              upcomingMatches.length === 0 ? (
                <Card>
                  <p className="text-neutral-500 text-sm text-center py-2">
                    {pools.length === 0 ? 'Join a pool to see upcoming matches.' : 'No upcoming matches scheduled.'}
                  </p>
                </Card>
              ) : (() => {
                const knownMatches = upcomingMatches.filter(m => m.home_team && m.away_team)
                const tbdMatches = upcomingMatches.filter(m => !m.home_team || !m.away_team)
                return (
                  <div className="space-y-3">
                    {knownMatches.map((match) => {
                      const homeTeamData = match.home_team as any
                      const awayTeamData = match.away_team as any
                      const homeTeam = homeTeamData?.country_name ?? 'TBD'
                      const awayTeam = awayTeamData?.country_name ?? 'TBD'
                      const homeFlagUrl = homeTeamData?.flag_url ?? null
                      const awayFlagUrl = awayTeamData?.flag_url ?? null
                      return (
                        <Card key={match.match_id} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1.5">
                              {homeFlagUrl && <img src={homeFlagUrl} alt={homeTeam} className="w-5 h-3.5 rounded-[2px] object-cover shrink-0" />}
                              <span className="font-semibold text-neutral-900 text-sm">{homeTeam}</span>
                            </div>
                            <span className="text-neutral-400 text-xs">vs</span>
                            <div className="flex items-center gap-1.5">
                              {awayFlagUrl && <img src={awayFlagUrl} alt={awayTeam} className="w-5 h-3.5 rounded-[2px] object-cover shrink-0" />}
                              <span className="font-semibold text-neutral-900 text-sm">{awayTeam}</span>
                            </div>
                          </div>
                          <div className="text-right shrink-0 ml-3">
                            <p className="text-xs font-medium text-neutral-600">
                              {match.match_date ? formatDateTime(match.match_date) : 'TBD'}
                            </p>
                          </div>
                        </Card>
                      )
                    })}
                    {tbdMatches.length > 0 && (
                      <Card>
                        <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">Awaiting Results</p>
                        <ul className="divide-y divide-neutral-100 dark:divide-border-default">
                          {tbdMatches.map((match) => {
                            const homeLabel = match.home_team_placeholder ?? 'TBD'
                            const awayLabel = match.away_team_placeholder ?? 'TBD'
                            return (
                              <li key={match.match_id} className="flex items-center justify-between py-2 first:pt-0 last:pb-0">
                                <div className="flex items-center min-w-0">
                                  <span className="text-xs text-neutral-400 w-8 shrink-0 tabular-nums">#{match.match_number}</span>
                                  <span className="text-xs text-neutral-400 w-8 shrink-0">{formatStageShort(match.stage)}</span>
                                  <span className="text-sm text-neutral-500 truncate">{homeLabel} vs {awayLabel}</span>
                                </div>
                                <span className="text-xs text-neutral-400 shrink-0 ml-3">
                                  {match.match_date ? formatDateTime(match.match_date) : 'TBD'}
                                </span>
                              </li>
                            )
                          })}
                        </ul>
                      </Card>
                    )}
                  </div>
                )
              })()
            )}
            </div>
            </div>
          </div>
        )}

        {/* ===== DESKTOP: Live Matches — only shown when there are live matches ===== */}
        {liveMatches.length > 0 && (
          <div className="hidden md:block mb-8 bg-danger-50/40 dark:bg-danger-950/20 border border-danger-200/50 dark:border-danger-800/30 rounded-2xl p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-4">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-danger-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-danger-500" />
              </span>
              <h3 className="text-xl font-bold text-neutral-900">Live Matches</h3>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
              {liveMatches.map((match) => {
                const homeTeamData = match.home_team as any
                const awayTeamData = match.away_team as any
                const homeTeam = homeTeamData?.country_name ?? match.home_team_placeholder ?? 'TBD'
                const awayTeam = awayTeamData?.country_name ?? match.away_team_placeholder ?? 'TBD'
                const homeFlagUrl = homeTeamData?.flag_url ?? null
                const awayFlagUrl = awayTeamData?.flag_url ?? null
                const elapsed = match.match_date ? getElapsedTime(match.match_date) : null
                return (
                  <Card key={match.match_id} className="border-danger-200 dark:border-danger-800/50 bg-surface">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs text-neutral-500">
                        {formatStage(match.stage)} &middot; Match #{match.match_number}
                      </p>
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-danger-600 px-2 py-0.5 rounded-full">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-danger-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-danger-500" />
                        </span>
                        LIVE
                      </span>
                    </div>
                    <div className="flex items-center justify-between overflow-hidden">
                      <div className="flex-1 min-w-0 flex items-center justify-end pr-3">
                        <p className="font-semibold text-neutral-900 text-sm truncate">{homeTeam}</p>
                      </div>
                      <div className="shrink-0 flex items-center gap-3 px-4 py-2 bg-neutral-50 dark:bg-surface-tertiary rounded-xl shadow-sm border border-neutral-200 dark:border-border-default">
                        <span className="text-2xl font-extrabold text-neutral-900">{match.home_score_ft ?? 0}</span>
                        <span className="text-neutral-400 text-lg">-</span>
                        <span className="text-2xl font-extrabold text-neutral-900">{match.away_score_ft ?? 0}</span>
                      </div>
                      <div className="flex-1 min-w-0 flex items-center pl-3">
                        <p className="font-semibold text-neutral-900 text-sm truncate">{awayTeam}</p>
                      </div>
                    </div>
                    {elapsed && (
                      <p className="text-sm font-semibold text-danger-600 mt-3 text-center">
                        {elapsed}
                      </p>
                    )}
                  </Card>
                )
              })}
            </div>
          </div>
        )}

        {/* ===== DESKTOP: Two column layout: Upcoming matches + Activity feed ===== */}
        <div className="hidden md:grid lg:grid-cols-5 gap-6">
          {/* Upcoming matches - 3/5 width */}
          <div className="lg:col-span-3">
            <h3 className="text-xl font-bold text-neutral-900 mb-4">Upcoming Matches</h3>
            {upcomingMatches.length === 0 ? (
              <Card>
                <p className="text-neutral-600">
                  {pools.length === 0
                    ? 'Join a pool to see upcoming matches.'
                    : 'No upcoming matches scheduled.'}
                </p>
              </Card>
            ) : (() => {
              const knownMatches = upcomingMatches.filter(m => m.home_team && m.away_team)
              const tbdMatches = upcomingMatches.filter(m => !m.home_team || !m.away_team)
              return (
                <div className="space-y-3">
                  {knownMatches.map((match) => {
                    const homeTeamData = match.home_team as any
                    const awayTeamData = match.away_team as any
                    const homeTeam = homeTeamData?.country_name ?? 'TBD'
                    const awayTeam = awayTeamData?.country_name ?? 'TBD'
                    const homeFlagUrl = homeTeamData?.flag_url ?? null
                    const awayFlagUrl = awayTeamData?.flag_url ?? null
                    return (
                      <Card key={match.match_id} className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-neutral-900 flex items-center gap-2">
                            <span className="inline-flex items-center gap-1.5">
                              {homeFlagUrl && <img src={homeFlagUrl} alt={homeTeam} className="w-5 h-3.5 rounded-[2px] object-cover" />}
                              {homeTeam}
                            </span>
                            <span className="text-neutral-400 font-normal">vs</span>
                            <span className="inline-flex items-center gap-1.5">
                              {awayFlagUrl && <img src={awayFlagUrl} alt={awayTeam} className="w-5 h-3.5 rounded-[2px] object-cover" />}
                              {awayTeam}
                            </span>
                          </p>
                          <p className="text-xs text-neutral-500">
                            {formatStage(match.stage)} &middot; Match #{match.match_number}
                          </p>
                        </div>
                        <div className="text-right shrink-0 ml-4">
                          <p className="text-sm font-medium text-neutral-700">
                            {match.match_date ? formatDateTime(match.match_date) : 'TBD'}
                          </p>
                          <Badge variant="outline-gray">{match.status}</Badge>
                        </div>
                      </Card>
                    )
                  })}
                  {tbdMatches.length > 0 && (
                    <Card>
                      <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">Awaiting Results</p>
                      <ul className="divide-y divide-neutral-100 dark:divide-border-default">
                        {tbdMatches.map((match) => {
                          const homeLabel = match.home_team_placeholder ?? 'TBD'
                          const awayLabel = match.away_team_placeholder ?? 'TBD'
                          return (
                            <li key={match.match_id} className="flex items-center justify-between py-2 first:pt-0 last:pb-0">
                              <div className="flex items-center min-w-0">
                                <span className="text-xs text-neutral-400 w-8 shrink-0 tabular-nums">#{match.match_number}</span>
                                <span className="text-xs text-neutral-400 w-8 shrink-0">{formatStageShort(match.stage)}</span>
                                <span className="text-sm text-neutral-500 truncate">{homeLabel} vs {awayLabel}</span>
                              </div>
                              <span className="text-xs text-neutral-400 shrink-0 ml-3">
                                {match.match_date ? formatDateTime(match.match_date) : 'TBD'}
                              </span>
                            </li>
                          )
                        })}
                      </ul>
                    </Card>
                  )}
                </div>
              )
            })()}
          </div>

          {/* Recent activity - 2/5 width */}
          <div className="lg:col-span-2">
            <h3 className="text-xl font-bold text-neutral-900 mb-4">Recent Activity</h3>
            {activities.length === 0 ? (
              <Card>
                <p className="text-neutral-600">No recent activity.</p>
              </Card>
            ) : (
              <ActivityList
                activities={activities}
                showAll={showAllActivity}
                onToggle={() => setShowAllActivity(!showAllActivity)}
              />
            )}
          </div>
        </div>

        {/* ===== MOBILE: Activity feed (separate from desktop grid) ===== */}
        <div className="md:hidden mt-6">
          <h3 className="text-xl font-bold text-neutral-900 mb-4">Recent Activity</h3>
          {activities.length === 0 ? (
            <Card>
              <p className="text-neutral-600">No recent activity.</p>
            </Card>
          ) : (
            <ActivityList
              activities={activities}
              showAll={showAllActivity}
              onToggle={() => setShowAllActivity(!showAllActivity)}
            />
          )}
        </div>
      </main>

      {/* Modals */}
      {showJoinModal && (
        <JoinPoolModal
          onClose={() => setShowJoinModal(false)}
          onSuccess={() => { setShowJoinModal(false); router.refresh() }}
        />
      )}
      {showCreateModal && (
        <CreatePoolModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => { setShowCreateModal(false); router.refresh() }}
        />
      )}
    </div>
  )
}
