'use client'

import type { PoolData, MemberData, MatchData } from './page'
import { Card } from '@/components/ui/Card'
import { Badge, getStatusVariant } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'

type OverviewTabProps = {
  pool: PoolData
  members: MemberData[]
  matches: MatchData[]
  setActiveTab: (tab: 'overview' | 'members' | 'matches' | 'scoring' | 'settings') => void
}

export function OverviewTab({ pool, members, matches, setActiveTab }: OverviewTabProps) {
  // Stats calculations
  const totalMembers = members.length
  const now = new Date()
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const recentJoins = members.filter(
    (m) => new Date(m.joined_at) > oneWeekAgo
  ).length

  const submittedCount = members.filter(
    (m) => m.has_submitted_predictions
  ).length
  const pendingCount = totalMembers - submittedCount
  const submittedPct =
    totalMembers > 0 ? Math.round((submittedCount / totalMembers) * 100) : 0

  const completedMatches = matches.filter(
    (m) => m.status === 'completed'
  ).length
  const totalMatches = matches.length
  const liveMatches = matches.filter((m) => m.status === 'live').length
  const matchPct =
    totalMatches > 0
      ? Math.round((completedMatches / totalMatches) * 100)
      : 0

  const deadlineDate = pool.prediction_deadline
    ? new Date(pool.prediction_deadline)
    : null
  const deadlineApproaching =
    deadlineDate && deadlineDate.getTime() - now.getTime() < 7 * 24 * 60 * 60 * 1000

  // Recent activity
  const recentMembers = [...members]
    .sort((a, b) => new Date(b.joined_at).getTime() - new Date(a.joined_at).getTime())
    .slice(0, 5)

  const recentCompletedMatches = [...matches]
    .filter((m) => m.is_completed && m.completed_at)
    .sort(
      (a, b) =>
        new Date(b.completed_at!).getTime() - new Date(a.completed_at!).getTime()
    )
    .slice(0, 5)

  type Activity = { text: string; time: Date; type: 'join' | 'match' | 'prediction' }
  const activities: Activity[] = []

  recentMembers.forEach((m) => {
    activities.push({
      text: `${m.users.full_name || m.users.username} joined the pool`,
      time: new Date(m.joined_at),
      type: 'join',
    })
  })

  recentCompletedMatches.forEach((m) => {
    const home = m.home_team?.country_name || m.home_team_placeholder || 'TBD'
    const away = m.away_team?.country_name || m.away_team_placeholder || 'TBD'
    activities.push({
      text: `Match #${m.match_number}: ${home} ${m.home_score_ft}-${m.away_score_ft} ${away} completed`,
      time: new Date(m.completed_at!),
      type: 'match',
    })
  })

  const recentPredictions = members
    .filter((m) => m.predictions_submitted_at)
    .sort(
      (a, b) =>
        new Date(b.predictions_submitted_at!).getTime() -
        new Date(a.predictions_submitted_at!).getTime()
    )
    .slice(0, 5)

  recentPredictions.forEach((m) => {
    activities.push({
      text: `${m.users.full_name || m.users.username} submitted predictions`,
      time: new Date(m.predictions_submitted_at!),
      type: 'prediction',
    })
  })

  activities.sort((a, b) => b.time.getTime() - a.time.getTime())
  const displayActivities = activities.slice(0, 10)

  function timeAgo(date: Date): string {
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000)
    if (seconds < 60) return 'just now'
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Dashboard Overview</h2>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {/* Total Members */}
        <Card>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">👥</span>
            <span className="text-sm font-medium text-gray-500">Total Members</span>
          </div>
          <p className="text-3xl font-bold text-gray-900">{totalMembers}</p>
          {recentJoins > 0 && (
            <p className="text-sm text-green-600 mt-1">+{recentJoins} this week</p>
          )}
        </Card>

        {/* Predictions Submitted */}
        <Card>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">📝</span>
            <span className="text-sm font-medium text-gray-500">Predictions</span>
          </div>
          <p className="text-3xl font-bold text-gray-900">
            {submittedCount} / {totalMembers}{' '}
            <span className="text-base font-normal text-gray-400">({submittedPct}%)</span>
          </p>
          {pendingCount > 0 && (
            <p className={`text-sm mt-1 ${deadlineApproaching ? 'text-orange-500 font-medium' : 'text-gray-500'}`}>
              {pendingCount} pending
              {deadlineApproaching && ' - deadline approaching!'}
            </p>
          )}
        </Card>

        {/* Matches Completed */}
        <Card>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">⚽</span>
            <span className="text-sm font-medium text-gray-500">Matches</span>
          </div>
          <p className="text-3xl font-bold text-gray-900">
            {completedMatches} / {totalMatches}{' '}
            <span className="text-base font-normal text-gray-400">({matchPct}%)</span>
          </p>
          {liveMatches > 0 && (
            <p className="text-sm text-red-500 font-medium mt-1">
              {liveMatches} live now
            </p>
          )}
        </Card>

        {/* Pool Status */}
        <Card>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">🎯</span>
            <span className="text-sm font-medium text-gray-500">Pool Status</span>
          </div>
          <div className="mt-1">
            <Badge variant={getStatusVariant(pool.status)}>
              {pool.status.charAt(0).toUpperCase() + pool.status.slice(1)}
            </Badge>
          </div>
          <p className="text-sm text-gray-500 mt-2">
            {pool.status === 'open' ? 'Open for joining' : pool.status === 'closed' ? 'No new members' : 'Tournament finished'}
          </p>
          {deadlineDate && (
            <p className="text-xs text-gray-400 mt-1">
              Deadline: {deadlineDate.toLocaleDateString()}
            </p>
          )}
        </Card>
      </div>

      {/* Quick Actions */}
      <Card className="mb-8">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => setActiveTab('matches')} variant="primary" size="sm">
            ⚽ Enter Match Result
          </Button>
          <Button
            href={`/pools/${pool.pool_id}/leaderboard`}
            variant="outline"
            size="sm"
          >
            📊 View Leaderboard
          </Button>
          <button
            disabled
            className="px-4 py-2 text-sm rounded-lg font-semibold bg-gray-100 text-gray-400 cursor-not-allowed"
            title="Coming in Phase 2"
          >
            📢 Post Announcement (Phase 2)
          </button>
        </div>
      </Card>

      {/* Recent Activity */}
      <Card>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h3>
        {displayActivities.length === 0 ? (
          <p className="text-gray-500 text-sm">No recent activity.</p>
        ) : (
          <ul className="space-y-3">
            {displayActivities.map((activity, i) => (
              <li key={i} className="flex items-start gap-3 text-sm">
                <span className="mt-0.5">
                  {activity.type === 'join' && '👤'}
                  {activity.type === 'match' && '⚽'}
                  {activity.type === 'prediction' && '📝'}
                </span>
                <div className="flex-1">
                  <p className="text-gray-700">{activity.text}</p>
                  <p className="text-xs text-gray-400">{timeAgo(activity.time)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
