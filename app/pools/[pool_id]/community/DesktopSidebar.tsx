import { useMemo, useState, useRef, useEffect } from 'react'
import { Card } from '@/components/ui/Card'
import type { MemberData, MatchData, PredictionData } from '../types'
import type { MemberWithLevel, SystemEvent } from './types'
import { getInitials, getLevelPillClasses, getRankTitle, formatMessageTime } from './helpers'

type OnlineUser = {
  user_id: string
  username: string
  full_name: string
}

type DesktopSidebarProps = {
  members: MemberData[]
  memberLevels: Map<string, MemberWithLevel>
  currentUserId: string
  matches: MatchData[]
  allPredictions: PredictionData[]
  onlineUsers: OnlineUser[]
  systemEvents: SystemEvent[]
  computedScoreMap: Map<string, number>
}

// =====================
// SECTION 1: ONLINE MEMBERS
// =====================
function MemberRow({
  member,
  level,
  isOnline,
  animation,
}: {
  member: MemberData
  level: MemberWithLevel | undefined
  isOnline: boolean
  animation: 'came-online' | 'went-offline' | null
}) {
  const animStyle = animation === 'came-online'
    ? { animation: 'slideInUp 500ms ease-out, glowGreen 1s ease-out' }
    : animation === 'went-offline'
    ? { animation: 'slideInDown 500ms ease-out, glowGrey 1s ease-out' }
    : undefined

  return (
    <div
      className={`flex items-center gap-2 rounded-lg px-1 -mx-1 ${!isOnline ? 'opacity-45' : ''}`}
      style={animStyle}
    >
      <div className="relative shrink-0">
        <div className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300">
          {getInitials(member.users.full_name, member.users.username)}
        </div>
        <div className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ring-1 ring-surface ${
          isOnline ? 'bg-success-500' : 'bg-neutral-300 dark:bg-neutral-600'
        }`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium text-neutral-900 dark:text-neutral-100 truncate">{member.users.full_name || member.users.username}</p>
        <p className="text-[9px] text-neutral-400 truncate">{level ? getRankTitle(level.level) : 'Rookie'}</p>
      </div>
      {level && (
        <span className={`text-[8px] font-bold px-1.5 py-1 rounded leading-none ${getLevelPillClasses(level.level)}`}>
          Lvl {level.level}
        </span>
      )}
    </div>
  )
}

function OnlineMembersSection({
  members,
  memberLevels,
  onlineUsers,
  currentUserId,
}: {
  members: MemberData[]
  memberLevels: Map<string, MemberWithLevel>
  onlineUsers: OnlineUser[]
  currentUserId: string
}) {
  // Include current user — usePresence excludes yourself from onlineUsers
  const onlineIds = new Set([...onlineUsers.map(u => u.user_id), currentUserId])

  // Track presence transitions
  const prevOnlineIdsRef = useRef<Set<string>>(onlineIds)
  const isFirstRenderRef = useRef(true)
  const [recentlyCameOnline, setRecentlyCameOnline] = useState<Set<string>>(new Set())
  const [recentlyWentOffline, setRecentlyWentOffline] = useState<Set<string>>(new Set())

  useEffect(() => {
    // Skip animation on first render
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false
      prevOnlineIdsRef.current = new Set(onlineIds)
      return
    }

    const prev = prevOnlineIdsRef.current
    const cameOnline = new Set<string>()
    const wentOffline = new Set<string>()

    // Who just came online?
    for (const id of onlineIds) {
      if (!prev.has(id) && id !== currentUserId) cameOnline.add(id)
    }
    // Who just went offline?
    for (const id of prev) {
      if (!onlineIds.has(id) && id !== currentUserId) wentOffline.add(id)
    }

    prevOnlineIdsRef.current = new Set(onlineIds)

    if (cameOnline.size > 0) {
      setRecentlyCameOnline(cameOnline)
      setTimeout(() => setRecentlyCameOnline(new Set()), 1000)
    }
    if (wentOffline.size > 0) {
      setRecentlyWentOffline(wentOffline)
      setTimeout(() => setRecentlyWentOffline(new Set()), 1000)
    }
  }, [onlineIds, currentUserId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sort: online first, then by level desc
  const sortedMembers = useMemo(() => {
    return [...members].sort((a, b) => {
      const aOnline = onlineIds.has(a.user_id) ? 1 : 0
      const bOnline = onlineIds.has(b.user_id) ? 1 : 0
      if (aOnline !== bOnline) return bOnline - aOnline
      const aLevel = memberLevels.get(a.user_id)?.level ?? 0
      const bLevel = memberLevels.get(b.user_id)?.level ?? 0
      return bLevel - aLevel
    })
  }, [members, memberLevels, onlineIds])

  const offlineMembers = sortedMembers.filter(m => !onlineIds.has(m.user_id))
  const onlineMembers = sortedMembers.filter(m => onlineIds.has(m.user_id))
  const [offlineExpanded, setOfflineExpanded] = useState(false)

  const getAnimation = (userId: string): 'came-online' | 'went-offline' | null => {
    if (recentlyCameOnline.has(userId)) return 'came-online'
    if (recentlyWentOffline.has(userId)) return 'went-offline'
    return null
  }

  return (
    <Card className="!p-3">
      {/* Keyframe animations */}
      <style>{`
        @keyframes slideInDown {
          from { opacity: 0; transform: translateY(-24px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideInUp {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes glowGreen {
          0% { background: rgb(34 197 94 / 0.25); }
          100% { background: transparent; }
        }
        @keyframes glowGrey {
          0% { background: rgb(163 163 163 / 0.2); }
          100% { background: transparent; }
        }
      `}</style>

      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-bold text-neutral-900 dark:text-neutral-100">Members</h4>
        <span className="text-[10px] text-neutral-400">{members.length}</span>
      </div>

      {/* Online */}
      {onlineMembers.length > 0 && (
        <>
          <div className="flex items-center gap-1.5 mb-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-success-500" />
            <span className="text-[10px] font-medium text-success-600 dark:text-success-400">Online — {onlineMembers.length}</span>
          </div>
          <div className="space-y-1 mb-3">
            {onlineMembers.map(m => (
              <MemberRow
                key={m.user_id}
                member={m}
                level={memberLevels.get(m.user_id)}
                isOnline
                animation={getAnimation(m.user_id)}
              />
            ))}
          </div>
        </>
      )}

      {/* Offline — collapsible */}
      {offlineMembers.length > 0 && (
        <>
          <button
            onClick={() => setOfflineExpanded(prev => !prev)}
            className="flex items-center justify-between w-full mb-1.5 group"
          >
            <span className="text-[10px] font-medium text-neutral-400">Offline — {offlineMembers.length}</span>
            <svg
              className={`w-3 h-3 text-neutral-400 transition-transform duration-200 ${offlineExpanded ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out ${offlineExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
            <div className="overflow-hidden">
              <div className="space-y-1 pt-0.5">
                {offlineMembers.map(m => (
                  <MemberRow
                    key={m.user_id}
                    member={m}
                    level={memberLevels.get(m.user_id)}
                    isOnline={false}
                    animation={getAnimation(m.user_id)}
                  />
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </Card>
  )
}

// =====================
// SECTION 2: MATCHDAY PULSE
// =====================
function MatchdayPulseSection({
  matches,
  allPredictions,
  members,
}: {
  matches: MatchData[]
  allPredictions: PredictionData[]
  members: MemberData[]
}) {
  const completedMatches = useMemo(() =>
    matches
      .filter(m => m.is_completed && m.home_score_ft !== null)
      .sort((a, b) => new Date(b.completed_at || b.match_date).getTime() - new Date(a.completed_at || a.match_date).getTime())
      .slice(0, 3),
    [matches]
  )

  const upcomingMatches = useMemo(() =>
    matches
      .filter(m => !m.is_completed && new Date(m.match_date) > new Date())
      .sort((a, b) => new Date(a.match_date).getTime() - new Date(b.match_date).getTime())
      .slice(0, 2),
    [matches]
  )

  // Compute accuracy per match
  const totalMembers = members.length

  return (
    <Card className="!p-3">
      <h4 className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-2">Matchday Pulse</h4>

      {/* Recent results */}
      {completedMatches.map(match => {
        const homeName = match.home_team?.country_code ?? '???'
        const awayName = match.away_team?.country_code ?? '???'

        // Count correct predictions
        const predsForMatch = allPredictions.filter(p => p.match_id === match.match_id)
        const correctCount = predsForMatch.filter(p => {
          const predictedWinner = p.predicted_home_score > p.predicted_away_score ? 'home'
            : p.predicted_away_score > p.predicted_home_score ? 'away' : 'draw'
          const actualWinner = match.home_score_ft! > match.away_score_ft! ? 'home'
            : match.away_score_ft! > match.home_score_ft! ? 'away' : 'draw'
          return predictedWinner === actualWinner
        }).length
        const pct = predsForMatch.length > 0 ? Math.round((correctCount / predsForMatch.length) * 100) : 0

        return (
          <div key={match.match_id} className="mb-2 last:mb-0">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[11px] font-medium text-neutral-700 dark:text-neutral-300">
                {homeName} vs {awayName}
              </span>
              <span className="text-[11px] font-bold text-neutral-900 dark:text-neutral-100 tabular-nums">
                {match.home_score_ft}-{match.away_score_ft}
              </span>
            </div>
            {/* Accuracy bar */}
            <div className="flex items-center gap-1.5">
              <div className="flex-1 h-1 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-success-500 transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-[9px] text-neutral-400 tabular-nums w-16 text-right">
                {correctCount}/{predsForMatch.length} · {pct}%
              </span>
            </div>
          </div>
        )
      })}

      {completedMatches.length === 0 && (
        <p className="text-[10px] text-neutral-400 italic">No completed matches yet</p>
      )}

      {/* Upcoming */}
      {upcomingMatches.length > 0 && (
        <div className="mt-2 pt-2 border-t border-neutral-100 dark:border-border-default/50">
          {upcomingMatches.map(match => {
            const homeName = match.home_team?.country_code ?? match.home_team_placeholder ?? '???'
            const awayName = match.away_team?.country_code ?? match.away_team_placeholder ?? '???'
            const matchDate = new Date(match.match_date)
            const now = new Date()
            const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
            const isTomorrow = matchDate.getDate() === tomorrow.getDate() && matchDate.getMonth() === tomorrow.getMonth()
            const dateLabel = isTomorrow ? 'Tomorrow' : matchDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

            return (
              <div key={match.match_id} className="flex items-center justify-between py-1">
                <span className="text-[11px] font-medium text-neutral-700 dark:text-neutral-300">
                  {homeName} vs {awayName}
                </span>
                <span className="text-[10px] font-medium text-primary-600 dark:text-primary-400">
                  {dateLabel}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

// =====================
// SECTION 3: LEADERBOARD SNAPSHOT
// =====================
function LeaderboardSnapshotSection({
  members,
  currentUserId,
  computedScoreMap,
}: {
  members: MemberData[]
  currentUserId: string
  computedScoreMap: Map<string, number>
}) {
  const RANK_MEDALS: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }

  const ranked = useMemo(() =>
    members
      .flatMap(m => (m.entries ?? []).map(e => ({
        user_id: m.user_id,
        full_name: m.users.full_name || m.users.username,
        rank: e.current_rank ?? 999,
        points: computedScoreMap.get(e.entry_id) ?? e.total_points,
        delta: e.previous_rank !== null && e.current_rank !== null ? e.previous_rank - e.current_rank : 0,
      })))
      .filter(e => e.rank < 999)
      .sort((a, b) => a.rank - b.rank)
      .slice(0, 5),
    [members, computedScoreMap]
  )

  return (
    <Card className="!p-3">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Leaderboard</h4>
      </div>

      {ranked.length === 0 ? (
        <p className="text-[10px] text-neutral-400 italic">No rankings yet</p>
      ) : (
        <div className="space-y-0.5">
          {ranked.map((entry) => {
            const isCurrentUser = entry.user_id === currentUserId
            return (
              <div
                key={`${entry.user_id}-${entry.rank}`}
                className={`flex items-center gap-1.5 px-1.5 py-1 rounded-lg ${
                  isCurrentUser ? 'bg-primary-50 dark:bg-primary-900/15' : ''
                }`}
              >
                <span className="w-5 text-center shrink-0">
                  {RANK_MEDALS[entry.rank] ?? (
                    <span className="text-[10px] text-neutral-400 font-medium">{entry.rank}</span>
                  )}
                </span>
                <span className={`text-[11px] flex-1 truncate ${
                  isCurrentUser ? 'font-semibold text-primary-700 dark:text-primary-400' : 'font-medium text-neutral-900 dark:text-neutral-100'
                }`}>
                  {entry.full_name}
                </span>
                <span className="text-[11px] font-bold text-neutral-900 dark:text-neutral-100 tabular-nums">
                  {entry.points.toLocaleString()}
                </span>
                {entry.delta !== 0 && (
                  <span className={`text-[9px] font-medium ${
                    entry.delta > 0 ? 'text-success-600 dark:text-success-400' : 'text-danger-600 dark:text-danger-400'
                  }`}>
                    {entry.delta > 0 ? '▲' : '▼'}{Math.abs(entry.delta)}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

// =====================
// SECTION 4: RECENT ACTIVITY
// =====================
function RecentActivitySection({ events }: { events: SystemEvent[] }) {
  // Filter to gamification events only (no match results — those are in Matchday Pulse)
  const activityEvents = events
    .filter(e => e.event_type !== 'match_result')
    .slice(0, 5)

  return (
    <Card className="!p-3">
      <h4 className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-2">Recent Activity</h4>

      {activityEvents.length === 0 ? (
        <p className="text-[10px] text-neutral-400 italic">No recent activity</p>
      ) : (
        <div className="space-y-1.5">
          {activityEvents.map((event) => (
            <div key={event.id} className="flex items-start gap-1.5">
              <span className="text-sm leading-none mt-0.5 shrink-0">{event.emoji}</span>
              <p className="text-[10px] text-neutral-600 dark:text-neutral-400 flex-1 leading-relaxed">
                {event.content}
              </p>
              <span className="text-[9px] text-neutral-300 dark:text-neutral-600 shrink-0 mt-0.5" suppressHydrationWarning>
                {formatMessageTime(event.timestamp)}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

// =====================
// MAIN EXPORT
// =====================
export function DesktopSidebar({
  members,
  memberLevels,
  currentUserId,
  matches,
  allPredictions,
  onlineUsers,
  systemEvents,
  computedScoreMap,
}: DesktopSidebarProps) {
  return (
    <div
      className="fixed top-[9rem] w-[260px] flex flex-col gap-3 overflow-y-auto max-h-[calc(100vh-10.5rem)] pr-0.5 scrollbar-hide"
      style={{ right: 'max(calc((100vw - 72rem) / 2 + 1.5rem), 1.5rem)' }}
    >
      <OnlineMembersSection
        members={members}
        memberLevels={memberLevels}
        onlineUsers={onlineUsers}
        currentUserId={currentUserId}
      />
      <MatchdayPulseSection
        matches={matches}
        allPredictions={allPredictions}
        members={members}
      />
      <LeaderboardSnapshotSection
        members={members}
        currentUserId={currentUserId}
        computedScoreMap={computedScoreMap}
      />
      <RecentActivitySection events={systemEvents} />
    </div>
  )
}
