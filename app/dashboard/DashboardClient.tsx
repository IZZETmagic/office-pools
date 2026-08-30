'use client'

import { useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Icon } from '@/components/ui/Icon'
import { AppHeader } from '@/components/ui/AppHeader'
import { JoinPoolModal } from '@/components/pools/JoinPoolModal'
import { CreatePoolModal } from '@/components/pools/CreatePoolModal'
import { formatNumber } from '@/lib/format'
import { LocalTime } from '@/components/LocalTime'
import { useSlideIndicator } from '@/hooks/useSlideIndicator'
import { useUnreadBanter } from '@/hooks/useUnreadBanter'
import type { PredictionMode } from '@/lib/predictionMode'
import type { ShowdownCardFacts, LmsCardFacts, TableCardFacts } from '@/lib/league/poolCards'
import { shortClubName } from '@/lib/league/clubName'
import { PoolCard, PoolStripCard } from '@/components/pools/PoolCard'
import { byAttention } from '@/lib/pools/card'

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
  // The full union from lib/predictionMode.ts — this line omitting
  // `league_pickem` is what let a league pool be typed as a World Cup one.
  prediction_mode: PredictionMode
  /** pickem | showdown | last_man_standing | table. NULL on a World Cup pool. */
  league_mode: string | null
  tournament_id: string
  role: string
  match_points: number
  bonus_points: number
  total_points: number
  current_rank: number | null
  /** NULL for a league pool: there is no league XP system. */
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
  has_submitted_predictions: boolean
  predictions_submitted_at: string | null
  predictions_last_saved_at: string | null
  joined_at: string
  memberCount: number
  totalEntries: number
  hasScoringStarted: boolean
  totalMatches: number
  completedMatches: number
  predictedMatches: number
  entries: EntryProgress[]
  form: ('exact' | 'winner_gd' | 'winner' | 'miss')[]
  currentRoundLabel?: string | null
  brand_name?: string | null
  brand_emoji?: string | null
  brand_color?: string | null
  brand_accent?: string | null
  brand_logo_url?: string | null
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
  | (ActivityItemBase & { type: 'rank_up'; rankDelta: number; newRank: number; entryName: string })
  | (ActivityItemBase & { type: 'rank_down'; rankDelta: number; newRank: number; entryName: string })
  | (ActivityItemBase & { type: 'mentioned'; mentionedBy: string })
  | (ActivityItemBase & { type: 'points_adjusted'; adjustment: number; reason: string })

type UpcomingMatch = {
  match_id: string
  match_number: number
  stage: string
  match_date: string
  status: string
  venue: string | null
  home_team: { country_name: string; flag_url: string | null } | null
  away_team: { country_name: string; flag_url: string | null } | null
  home_team_placeholder: string | null
  away_team_placeholder: string | null
  /**
   * The competition this fixture belongs to, e.g. "Premier League".
   *
   * Only set for league fixtures. A member in a Premier League pool and a
   * La Liga pool sees both leagues' games in one list, and two crests with no
   * caption cannot say which competition a game belongs to. Absent on World Cup
   * rows, where the panel has only ever shown one competition anyway.
   */
  competition?: string | null
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

/**
 * A club crest or a national flag — they are NOT the same shape.
 *
 * ⚠ Every badge on this page was a 24x16 box with `object-cover`, which is
 * right for a flag and wrong for a crest: a square club badge gets its top and
 * bottom cropped off. The Liverpool liver bird and the Forest tree both lost
 * their heads on the live card.
 *
 * A league fixture is the tell — `competition` is set only for those — so a
 * crest gets a square box and `object-contain`, and flags keep the 3:2 they
 * have always had.
 */
function TeamBadge({ url, name, isCrest, size }: {
  url: string | null
  name: string
  isCrest: boolean
  size: 'sm' | 'md'
}) {
  if (!url) return null
  // Crests run larger than the flags they replace. A flag is a solid rectangle
  // and reads at 24x16; a crest is line art on transparent, so at the same box
  // it disappears next to a 18px score. Sized against the score rather than
  // against the flag.
  const box = isCrest
    ? (size === 'sm' ? 'w-6 h-6' : 'w-9 h-9') + ' object-contain'
    : (size === 'sm' ? 'w-6 h-4' : 'w-10 h-7') + ' rounded-[2px] object-cover'
  return <img src={url} alt={name} className={`${box} shrink-0`} />
}

/**
 * What the small line above a match says.
 *
 * ⚠ It used to say `regular_season` — `formatStage` maps the World Cup's stages
 * and returns anything else unchanged, and a league fixture's stage is a value
 * the adapter invents for the prediction flow's round matching. A database
 * identifier reaching a member is the same defect the mode pill had.
 *
 * A league says which competition, which is the useful fact when two leagues'
 * fixtures are interleaved. `#12` is dropped there too: a fixture number is
 * internal, where a World Cup match number is something people actually cite.
 */
function matchCaption(match: { competition?: string | null; stage: string; match_number: number }): string {
  if (match.competition) return match.competition
  return `${formatStage(match.stage)} \u00B7 #${match.match_number}`
}

function formatDateTime(d: Date) {
  const month = d.toLocaleString('en-US', { month: 'short' })
  const day = d.getDate()
  const hour = d.getHours()
  const minute = d.getMinutes().toString().padStart(2, '0')
  const period = hour >= 12 ? 'PM' : 'AM'
  const h = hour % 12 || 12
  return `${month} ${day}, ${h}:${minute} ${period}`
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

// SF-Symbol names for each activity kind, resolved by components/ui/Icon. Keyed on
// the union so a new activity type fails the build rather than rendering nothing.
/**
 * Hero stat tints, taken verbatim from QuickStats in the RN app so the two
 * surfaces use one palette.
 *
 * These are deliberate, not an oversight: RN draws its stat cards on `surface`,
 * where all three clear 3.8:1, but this hero is a primary-600 → primary-700 →
 * success-600 gradient, so measured against the tile each icon actually lands
 * on they come out at 1.02 (flame, on blue), 1.55 (trophy) and 2.04 (bolt, on
 * green). Ryan chose the shared palette over the contrast on 2026-08-04. If
 * that trade stops being worth it, the fix is to put these tiles on `surface`
 * like RN's — not to re-tint them.
 */
const STAT_TINT = {
  streak: '#EF4444',
  rank: '#D97706',
  points: 'var(--primary-600)',
} as const

const ACTIVITY_ICON: Record<ActivityItem['type'], string> = {
  joined: 'person.badge.plus',
  submitted: 'checkmark.circle.fill',
  auto_submitted: 'clock',
  entry_created: 'doc.text.fill',
  deadline_passed: 'lock.fill',
  rank_up: 'arrow.up.right',
  rank_down: 'arrow.down.right',
  mentioned: 'bubble.left.and.bubble.right.fill',
  points_adjusted: 'slider.horizontal.3',
}

function ActivityIcon({ type }: { type: ActivityItem['type'] }) {
  return <Icon name={ACTIVITY_ICON[type]} size={18} weight="light" />
}

function activityIconColor(type: ActivityItem['type']): string {
  switch (type) {
    case 'joined': return 'text-primary-500 bg-primary-50'
    case 'submitted': return 'text-success-600 bg-success-50'
    case 'auto_submitted': return 'text-warning-600 bg-warning-50'
    case 'entry_created': return 'text-primary-500 bg-primary-50'
    case 'deadline_passed': return 'text-muted bg-mist'
    case 'rank_up': return 'text-success-600 bg-success-50'
    case 'rank_down': return 'text-muted bg-mist'
    case 'mentioned': return 'text-primary-600 bg-primary-50'
    case 'points_adjusted': return 'text-warning-600 bg-warning-50'
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
    case 'rank_up':
      return <>Moved up {activity.rankDelta} {activity.rankDelta === 1 ? 'place' : 'places'} to <span className="font-semibold text-success-900">#{activity.newRank}</span> in {poolLink}</>
    case 'rank_down':
      return <>Dropped {activity.rankDelta} {activity.rankDelta === 1 ? 'place' : 'places'} to #{activity.newRank} in {poolLink}</>
    case 'mentioned':
      return <><span className="font-medium">@{activity.mentionedBy}</span> mentioned you in {poolLink}</>
    case 'points_adjusted':
      return <>Points adjusted <span className={`font-semibold ${activity.adjustment > 0 ? 'text-success-900' : 'text-danger-800'}`}>{activity.adjustment > 0 ? '+' : ''}{activity.adjustment}</span> in {poolLink} &mdash; {activity.reason}</>
  }
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
          <p className={`text-[11px] font-semibold uppercase tracking-wider text-muted ${globalIdx > 0 ? 'mt-4 pt-3 border-t border-border-subtle' : ''} mb-2`}>
            {dayHeader}
          </p>
        )}
        <div className={`flex items-start gap-3 ${!showHeader && globalIdx > 0 ? 'pt-3 border-t border-border-subtle' : ''} ${idx < list.length - 1 || (startIdx === 0 && rest.length > 0) ? 'pb-3' : ''}`}>
          <span className={`shrink-0 w-7 h-7 rounded-pill flex items-center justify-center ${activityIconColor(activity.type)}`} aria-hidden="true">
            <ActivityIcon type={activity.type} />
          </span>
          <div className="min-w-0 pt-0.5">
            <p className="text-sm text-ink">
              {activityDescription(activity, poolLink)}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-muted">{timeAgo(activity.date)}</span>
              {activity.type === 'joined' && !activity.hasPredictions && (
                <Badge variant="yellow" className="!rounded">Needs predictions</Badge>
              )}
              {activity.type === 'auto_submitted' && (
                <Badge variant="blue" className="!rounded">Auto</Badge>
              )}
              {activity.type === 'rank_up' && activity.newRank === 1 && (
                <Badge variant="green" className="!rounded">1st Place!</Badge>
              )}
              {activity.type === 'rank_up' && activity.newRank > 1 && activity.newRank <= 3 && (
                <Badge variant="green" className="!rounded">Podium!</Badge>
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
            className="w-full mt-3 pt-3 border-t border-border-subtle text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors"
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

  // Unread banter badges
  const poolIds = useMemo(() => pools.map(p => p.pool_id), [pools])
  const { unreadCounts } = useUnreadBanter({ userId: user.user_id, poolIds })

  // Best active streak across all pools (consecutive non-miss from most recent)
  const bestStreak = pools.reduce((best, pool) => {
    if (pool.form.length === 0) return best
    let streak = 0
    for (let i = pool.form.length - 1; i >= 0; i--) {
      if (pool.form[i] !== 'miss') streak++
      else break
    }
    return Math.max(best, streak)
  }, 0)

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
            <div className="w-12 h-12 sm:w-24 sm:h-24 rounded-pill bg-white/20 dark:bg-white/10 backdrop-blur-sm flex items-center justify-center text-white text-base sm:text-3xl font-bold border-2 border-white/30 dark:border-white/15 shadow-lg shrink-0">
              {getInitials(user.full_name, user.username)}
            </div>
            <div className="min-w-0">
              <h2 className="text-lg sm:text-3xl font-bold text-white truncate">
                Good {new Date().getHours() < 12 ? 'Morning' : new Date().getHours() < 17 ? 'Afternoon' : 'Evening'}, {user.full_name || user.username || 'Player'}!
              </h2>
              <p className="text-primary-100 dark:text-white/60 text-xs sm:text-base">@{user.username}</p>
            </div>
          </div>

          {/* Quick stats in hero — compact on mobile, glass cards on desktop */}
          {/* Mobile: inline row with dividers */}
          <div className="flex items-center justify-around mt-3 sm:hidden">
            <div className="text-center">
              <p className="text-lg font-bold text-white inline-flex items-center gap-1.5">
                {bestStreak}
                <Icon name="flame.fill" size={16} tint={STAT_TINT.streak} weight="light" solid />
              </p>
              <p className="text-[10px] text-primary-200 dark:text-white/50">Best Streak</p>
            </div>
            <div className="w-px h-8 bg-white/20" />
            <div className="text-center">
              <p className="text-lg font-bold text-white inline-flex items-center gap-1.5">
                {bestRank ? `#${bestRank}` : '--'}
                <Icon name="trophy.fill" size={16} tint={STAT_TINT.rank} weight="light" solid />
              </p>
              <p className="text-[10px] text-primary-200 dark:text-white/50">Best Rank</p>
            </div>
            <div className="w-px h-8 bg-white/20" />
            <div className="text-center">
              <p className="text-lg font-bold text-white inline-flex items-center gap-1.5">
                {formatNumber(totalPoints)}
                <Icon name="bolt.fill" size={16} tint={STAT_TINT.points} weight="light" solid />
              </p>
              <p className="text-[10px] text-primary-200 dark:text-white/50">Total Points</p>
            </div>
          </div>
          {/* Desktop: glass stat cards */}
          <div className="hidden sm:grid grid-cols-3 gap-4 mt-6">
            <div className="bg-white/10 backdrop-blur-sm rounded-control px-3 py-3 text-center border border-white/10">
              <p className="text-2xl font-bold text-white inline-flex items-center gap-2">
                {bestStreak}
                <Icon name="flame.fill" size={20} tint={STAT_TINT.streak} weight="light" solid />
              </p>
              <p className="text-xs text-primary-200 dark:text-white/50">Best Streak</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-control px-3 py-3 text-center border-l-2 border-white/20 border border-white/10">
              <p className="text-2xl font-bold text-white inline-flex items-center gap-2">
                {bestRank ? `#${bestRank}` : '--'}
                <Icon name="trophy.fill" size={20} tint={STAT_TINT.rank} weight="light" solid />
              </p>
              <p className="text-xs text-primary-200 dark:text-white/50">Best Rank</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-control px-3 py-3 text-center border-l-2 border-white/20 border border-white/10">
              <p className="text-2xl font-bold text-white inline-flex items-center gap-2">
                {formatNumber(totalPoints)}
                <Icon name="bolt.fill" size={20} tint={STAT_TINT.points} weight="light" solid />
              </p>
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
              <h3 className="text-xl font-bold text-ink">My Pools <span className="text-sm text-muted font-normal">({pools.length})</span></h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowJoinModal(true)}
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

          {pools.length === 0 ? (
            <Card padding="lg" className="text-center">
              <p className="text-muted text-lg mb-2">You haven&apos;t joined any pools yet.</p>
              <p className="text-muted mb-4">Use the buttons above to join or create a pool.</p>
              <Link
                href="/pools?tab=discover"
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-primary-600 bg-primary-50 border border-primary-200 rounded-control hover:bg-primary-100 hover:border-primary-300 transition-colors"
              >
                <Icon name="magnifyingglass" size={16} weight="semibold" />
                Discover Pools
              </Link>
            </Card>
          ) : (
            <>
              {/* Mobile: compact horizontal scroll strip — full-bleed, first card aligns with header */}
              <div className="md:hidden relative -mx-4 sm:-mx-6">
                <div className="flex items-stretch gap-3 overflow-x-auto scrollbar-hide pb-2 pl-4 sm:pl-6 pr-0" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                  {[...pools].sort(byAttention(unreadCounts)).map((pool, i) => (
                    <div key={pool.pool_id} className="shrink-0 flex animate-slide-in-right" style={{ animationDelay: `${i * 0.08}s` }}>
                      <PoolStripCard pool={pool} unreadCount={unreadCounts.get(pool.pool_id) ?? 0} />
                    </div>
                  ))}
                  {/* View All. Matches PoolStripCard beside it — same radius,
                      same border, same hover. It was on rounded-control with a
                      neutral-200 edge, so it read as a slightly different shape
                      sitting at the end of the strip. */}
                  <Link
                    href="/pools"
                    className="shrink-0 w-16 self-stretch rounded-card border border-border-subtle bg-surface flex flex-col items-center justify-center gap-1.5 hover:shadow-md active:scale-[0.98] transition-all duration-200"
                  >
                    <Icon name="chevron.right" size={18} weight="semibold" className="text-muted" />
                    <span className="t-detail text-muted">All</span>
                  </Link>
                </div>
              </div>

              {/* Desktop: full card grid */}
              <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[...pools].sort(byAttention(unreadCounts)).map((pool, i) => (
                  <PoolCard
                    key={pool.pool_id}
                    pool={pool}
                    index={i}
                    unreadCount={unreadCounts.get(pool.pool_id) ?? 0}
                    // ⚠ `grid`, not `list`: this card is 357px in a lg:grid-cols-3
                    // inside max-w-6xl, not the pools list's 544px. That buys a
                    // narrower rail and three KPI tiles instead of four — see
                    // SHAPE in components/pools/PoolCard.tsx for the measurements
                    // behind both.
                    variant="grid"
                    // No onCopyLink/onCopyCode, so no invite nudge — DELIBERATE,
                    // and now a single visible line rather than two card copies
                    // that happened to differ. The dashboard answers "what needs
                    // me today"; growing every under-ten-player card by a row of
                    // admin chrome is the pools list's job, and that list is
                    // 544px wide with room for it.
                  />
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
              <h3 className="text-xl font-bold text-ink">Matches</h3>
              {liveMatches.length > 0 && (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-danger-700 bg-danger-100 px-2.5 py-1 rounded-pill">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-pill bg-danger-400 opacity-75" />
                    <span className="relative inline-flex rounded-pill h-2 w-2 bg-danger-500" />
                  </span>
                  {liveMatches.length} LIVE
                </span>
              )}
            </div>

            {/* Tab toggle */}
            <div ref={matchTabRef} className="relative bg-mist dark:bg-surface-tertiary rounded-control p-1 flex mb-4">
              <div
                className={`absolute top-1 bottom-1 bg-surface rounded-chip shadow-sm pointer-events-none ${matchTabReady ? 'transition-all duration-300 ease-out' : ''}`}
                style={{ left: matchIndicator.left, width: matchIndicator.width }}
              />
              <button
                data-tab-key="live"
                onClick={() => switchMatchTab('live')}
                className={`relative z-10 flex-1 py-1.5 text-xs font-medium rounded-chip transition-colors ${
                  matchTab === 'live'
                    ? 'text-ink'
                    : 'text-muted hover:text-ink'
                }`}
              >
                Live Now
              </button>
              <button
                data-tab-key="upcoming"
                onClick={() => switchMatchTab('upcoming')}
                className={`relative z-10 flex-1 py-1.5 text-xs font-medium rounded-chip transition-colors ${
                  matchTab === 'upcoming'
                    ? 'text-ink'
                    : 'text-muted hover:text-ink'
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
                  <p className="text-muted text-sm text-center py-2">No live matches right now.</p>
                </Card>
              ) : (
                <div className="space-y-3">
                  {liveMatches.map((match) => {
                    const homeTeamData = match.home_team as any
                    const awayTeamData = match.away_team as any
                    // shortClubName is the same label the mobile league table uses,
                    // so a club is called the same thing on every surface. It is a
                    // no-op on a national team, which has no long-name problem.
                    const homeTeam = shortClubName(homeTeamData?.country_name ?? match.home_team_placeholder ?? 'TBD')
                    const awayTeam = shortClubName(awayTeamData?.country_name ?? match.away_team_placeholder ?? 'TBD')
                    const homeFlagUrl = homeTeamData?.flag_url ?? null
                    const awayFlagUrl = awayTeamData?.flag_url ?? null
                    const isCrest = !!match.competition
                    const elapsed = match.match_date ? getElapsedTime(match.match_date) : null
                    return (
                      <div key={match.match_id} className="bg-surface rounded-card shadow dark:shadow-none dark:border dark:border-border-default border border-danger-200/60 dark:border-danger-800/50 px-4 py-2.5">
                        <div className="flex items-center justify-between mb-1.5">
                          <p className="text-[10px] text-muted">{matchCaption(match)}</p>
                          <div className="flex items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-danger-600">
                              <span className="relative flex h-1.5 w-1.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-pill bg-danger-400 opacity-75" />
                                <span className="relative inline-flex rounded-pill h-1.5 w-1.5 bg-danger-500" />
                              </span>
                              LIVE
                            </span>
                            {elapsed && (
                              <span className="text-[10px] font-semibold text-danger-600">{elapsed}</span>
                            )}
                          </div>
                        </div>
                        {/* Same stack as the desktop card, and for the same reason:
                            at 375px this card is 349px wide — within 3px of the
                            desktop one at a third of the page — so the two have
                            the same problem and take the same shape. */}
                        <div className="flex items-center justify-center gap-3">
                          <div className="flex-1 min-w-0 flex flex-col items-center gap-1">
                            <TeamBadge url={homeFlagUrl} name={homeTeam} isCrest={isCrest} size="md" />
                            <p className="font-semibold text-ink text-xs text-center leading-tight w-full truncate">{homeTeam}</p>
                          </div>
                          <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 bg-snow dark:bg-surface-tertiary rounded-chip border border-border-default">
                            <span className="text-xl font-extrabold text-ink">{match.home_score_ft ?? 0}</span>
                            <span className="text-muted text-sm">-</span>
                            <span className="text-xl font-extrabold text-ink">{match.away_score_ft ?? 0}</span>
                          </div>
                          <div className="flex-1 min-w-0 flex flex-col items-center gap-1">
                            <TeamBadge url={awayFlagUrl} name={awayTeam} isCrest={isCrest} size="md" />
                            <p className="font-semibold text-ink text-xs text-center leading-tight w-full truncate">{awayTeam}</p>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            ) : (
              upcomingMatches.length === 0 ? (
                <Card>
                  <p className="text-muted text-sm text-center py-2">
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
                      const homeTeam = shortClubName(homeTeamData?.country_name ?? 'TBD')
                      const awayTeam = shortClubName(awayTeamData?.country_name ?? 'TBD')
                      // A club carries its own abbreviation (LIV, NFO); a national
                      // team carries a country code. Only fall back to slicing when
                      // neither exists — `homeTeam.slice(0, 3)` on "Nottingham
                      // Forest" gives "NOT", which names nobody.
                      const homeCode = (homeTeamData?.country_code ?? homeTeam.slice(0, 3)).toUpperCase()
                      const awayCode = (awayTeamData?.country_code ?? awayTeam.slice(0, 3)).toUpperCase()
                      const homeFlagUrl = homeTeamData?.flag_url ?? null
                      const awayFlagUrl = awayTeamData?.flag_url ?? null
                      return (
                        <Card key={match.match_id} className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="flex flex-col items-center gap-1">
                              <TeamBadge url={homeFlagUrl} name={homeTeam} isCrest={!!match.competition} size="md" />
                              <span className="text-xs font-semibold tracking-wide text-ink tabular-nums">{homeCode}</span>
                            </div>
                            <span className="text-muted text-xs self-center">vs</span>
                            <div className="flex flex-col items-center gap-1">
                              <TeamBadge url={awayFlagUrl} name={awayTeam} isCrest={!!match.competition} size="md" />
                              <span className="text-xs font-semibold tracking-wide text-ink tabular-nums">{awayCode}</span>
                            </div>
                          </div>
                          <div className="text-right shrink-0 ml-3">
                            <p className="text-xs font-medium text-muted">
                              {match.match_date ? <LocalTime iso={match.match_date} format={formatDateTime} /> : 'TBD'}
                            </p>
                            {match.competition && (
                              <p className="text-[11px] text-muted mt-0.5">{match.competition}</p>
                            )}
                            {match.venue && (
                              <p className="text-xs text-muted mt-0.5">{match.venue}</p>
                            )}
                          </div>
                        </Card>
                      )
                    })}
                    {tbdMatches.length > 0 && (
                      <Card>
                        <p className="text-xs font-medium text-muted uppercase tracking-wide mb-2">Awaiting Results</p>
                        <ul className="divide-y divide-border-subtle">
                          {tbdMatches.map((match) => {
                            const homeLabel = match.home_team_placeholder ?? 'TBD'
                            const awayLabel = match.away_team_placeholder ?? 'TBD'
                            return (
                              <li key={match.match_id} className="flex items-center justify-between py-2 first:pt-0 last:pb-0">
                                <div className="flex items-center min-w-0">
                                  <span className="text-xs text-muted w-8 shrink-0 tabular-nums">#{match.match_number}</span>
                                  <span className="text-xs text-muted w-8 shrink-0">{formatStageShort(match.stage)}</span>
                                  <span className="text-sm text-muted truncate">{homeLabel} vs {awayLabel}</span>
                                </div>
                                <span className="text-xs text-muted shrink-0 ml-3">
                                  {match.match_date ? <LocalTime iso={match.match_date} format={formatDateTime} /> : 'TBD'}
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
          <div className="hidden md:block mb-8 bg-danger-50/40 dark:bg-danger-950/20 border border-danger-200/50 dark:border-danger-800/30 rounded-card p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-4">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-pill bg-danger-400 opacity-75" />
                <span className="relative inline-flex rounded-pill h-3 w-3 bg-danger-500" />
              </span>
              <h3 className="text-xl font-bold text-ink">Live Matches</h3>
            </div>
            {/* Three across is affordable again now the name sits UNDER its
                badge rather than beside it. Measured at a 1440 viewport: a
                346px card gave a side-by-side name 50px, where the stacked one
                gets 98px — about 16 characters, which holds every club in the
                four leagues after shortClubName runs. */}
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
              {liveMatches.map((match) => {
                const homeTeamData = match.home_team as any
                const awayTeamData = match.away_team as any
                const homeTeam = shortClubName(homeTeamData?.country_name ?? match.home_team_placeholder ?? 'TBD')
                const awayTeam = shortClubName(awayTeamData?.country_name ?? match.away_team_placeholder ?? 'TBD')
                const homeFlagUrl = homeTeamData?.flag_url ?? null
                const awayFlagUrl = awayTeamData?.flag_url ?? null
                const isCrest = !!match.competition
                const elapsed = match.match_date ? getElapsedTime(match.match_date) : null
                return (
                  <Card key={match.match_id} className="border-danger-200 dark:border-danger-800/50 bg-surface">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs text-muted">{matchCaption(match)}</p>
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-danger-600 px-2 py-0.5 rounded-pill">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-pill bg-danger-400 opacity-75" />
                          <span className="relative inline-flex rounded-pill h-2 w-2 bg-danger-500" />
                        </span>
                        LIVE
                      </span>
                    </div>
                    {/* Badge over name, both flanking the score. Stacking is what
                        makes the name legible in a third-width card: laid out
                        beside its badge it competes with the score for the same
                        horizontal run, and the score always wins. */}
                    <div className="flex items-center justify-center gap-3">
                      <div className="flex-1 min-w-0 flex flex-col items-center gap-1">
                        <TeamBadge url={homeFlagUrl} name={homeTeam} isCrest={isCrest} size="md" />
                        <p className="font-semibold text-ink text-xs text-center leading-tight w-full truncate">{homeTeam}</p>
                      </div>
                      <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 bg-snow dark:bg-surface-tertiary rounded-control shadow-sm border border-border-default">
                        <span className="text-2xl font-extrabold text-ink">{match.home_score_ft ?? 0}</span>
                        <span className="text-muted text-lg">-</span>
                        <span className="text-2xl font-extrabold text-ink">{match.away_score_ft ?? 0}</span>
                      </div>
                      <div className="flex-1 min-w-0 flex flex-col items-center gap-1">
                        <TeamBadge url={awayFlagUrl} name={awayTeam} isCrest={isCrest} size="md" />
                        <p className="font-semibold text-ink text-xs text-center leading-tight w-full truncate">{awayTeam}</p>
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
            <h3 className="text-xl font-bold text-ink mb-4">Upcoming Matches</h3>
            {upcomingMatches.length === 0 ? (
              <Card>
                <p className="text-muted">
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
                    const homeTeam = shortClubName(homeTeamData?.country_name ?? 'TBD')
                    const awayTeam = shortClubName(awayTeamData?.country_name ?? 'TBD')
                    const homeFlagUrl = homeTeamData?.flag_url ?? null
                    const awayFlagUrl = awayTeamData?.flag_url ?? null
                    const isCrest = !!match.competition
                    return (
                      // ⚠ THE COMPETITION APPEARS ONCE, on the left, as the match's
                      // caption. It used to sit under the kick-off time on the
                      // right while the left read `regular_season · Match #14` —
                      // so the card showed a raw database value AND named the
                      // competition twice over. `matchCaption` gives a league its
                      // competition and a World Cup match its stage and number.
                      <Card key={match.match_id} padding="sm" className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <p className="font-semibold text-ink flex items-center gap-2 min-w-0">
                            <span className="inline-flex items-center gap-1.5 min-w-0">
                              <TeamBadge url={homeFlagUrl} name={homeTeam} isCrest={isCrest} size="sm" />
                              <span className="truncate">{homeTeam}</span>
                            </span>
                            <span className="text-muted font-normal shrink-0">vs</span>
                            <span className="inline-flex items-center gap-1.5 min-w-0">
                              <TeamBadge url={awayFlagUrl} name={awayTeam} isCrest={isCrest} size="sm" />
                              <span className="truncate">{awayTeam}</span>
                            </span>
                          </p>
                          <p className="text-xs text-muted mt-0.5">{matchCaption(match)}</p>
                        </div>
                        {/* ⚠ CAPPED, because venues run long. The longest in the
                            four leagues is "Waldstadion Kaiserlinde,
                            Spiesen-Elversberg" at 43 characters, and with the
                            right column shrink-0 an uncapped one would push the
                            clubs off the left rather than truncate itself. */}
                        <div className="text-right shrink-0 max-w-[45%]">
                          <p className="text-sm font-medium text-ink whitespace-nowrap">
                            {match.match_date ? <LocalTime iso={match.match_date} format={formatDateTime} /> : 'TBD'}
                          </p>
                          {match.venue && (
                            <p className="text-xs text-muted mt-0.5 truncate" title={match.venue}>{match.venue}</p>
                          )}
                        </div>
                      </Card>
                    )
                  })}
                  {tbdMatches.length > 0 && (
                    <Card>
                      <p className="text-xs font-medium text-muted uppercase tracking-wide mb-2">Awaiting Results</p>
                      <ul className="divide-y divide-border-subtle">
                        {tbdMatches.map((match) => {
                          const homeLabel = match.home_team_placeholder ?? 'TBD'
                          const awayLabel = match.away_team_placeholder ?? 'TBD'
                          return (
                            <li key={match.match_id} className="flex items-center justify-between py-2 first:pt-0 last:pb-0">
                              <div className="flex items-center min-w-0">
                                <span className="text-xs text-muted w-8 shrink-0 tabular-nums">#{match.match_number}</span>
                                <span className="text-xs text-muted w-8 shrink-0">{formatStageShort(match.stage)}</span>
                                <span className="text-sm text-muted truncate">{homeLabel} vs {awayLabel}</span>
                              </div>
                              <span className="text-xs text-muted shrink-0 ml-3">
                                {match.match_date ? <LocalTime iso={match.match_date} format={formatDateTime} /> : 'TBD'}
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
            <h3 className="text-xl font-bold text-ink mb-4">Recent Activity</h3>
            {activities.length === 0 ? (
              <Card>
                <p className="text-muted">No recent activity.</p>
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
          <h3 className="text-xl font-bold text-ink mb-4">Recent Activity</h3>
          {activities.length === 0 ? (
            <Card>
              <p className="text-muted">No recent activity.</p>
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
