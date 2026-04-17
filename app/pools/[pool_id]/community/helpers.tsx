import type { MemberData, MatchData, EntryData } from '../types'
import type { SystemEvent, MemberWithLevel } from './types'
import { LEVELS, computeLevel } from '../analytics/xpSystem'
import type { EarnedBadge } from '../analytics/xpSystem'

// =====================
// TEXT HELPERS
// =====================

export function getInitials(fullName: string | null | undefined, username: string | undefined): string {
  if (fullName) {
    return fullName
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }
  return (username ?? '??').slice(0, 2).toUpperCase()
}

export function formatMessageTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function formatDayHeader(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const msgDay = new Date(date.getFullYear(), date.getMonth(), date.getDate())

  if (msgDay.getTime() === today.getTime()) return 'Today'
  if (msgDay.getTime() === yesterday.getTime()) return 'Yesterday'
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

// =====================
// MENTION HELPERS
// =====================

export function parseMentionUserIds(content: string, members: MemberData[]): string[] {
  const mentionPattern = /@(\w+)/g
  const ids: string[] = []
  let match
  while ((match = mentionPattern.exec(content)) !== null) {
    const username = match[1].toLowerCase()
    const member = members.find(m => m.users.username.toLowerCase() === username)
    if (member) {
      ids.push(member.user_id)
    }
  }
  return [...new Set(ids)]
}

export function renderMessageContent(content: string, members: MemberData[], isOwn?: boolean): React.ReactNode {
  const parts = content.split(/(@\w+)/g)
  return parts.map((part, i) => {
    if (part.startsWith('@')) {
      const username = part.slice(1).toLowerCase()
      const member = members.find(m => m.users.username.toLowerCase() === username)
      if (member) {
        return (
          <span key={i} className={`font-semibold ${isOwn ? 'text-accent-800' : 'text-primary-600 dark:text-primary-600'}`}>
            {part}
          </span>
        )
      }
    }
    return part
  })
}

// =====================
// LEVEL HELPERS
// =====================

/**
 * Lightweight level computation from total XP — no full breakdown needed.
 * For use in chat message display where we just need level + name.
 */
export function computeLevelFromXP(totalXP: number): { level: number; levelName: string } {
  const { currentLevel } = computeLevel(totalXP)
  return { level: currentLevel.level, levelName: currentLevel.name }
}

/**
 * Get level tier color classes for the level badge pill.
 * Level 9+: amber (Oracle/Legend), Level 5-8: blue, Below 5: neutral
 */
export function getLevelPillClasses(level: number): string {
  if (level >= 9) return 'bg-warning-200 dark:bg-warning-900/30 text-warning-900 dark:text-warning-300'
  if (level >= 5) return 'bg-primary-100 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400'
  return 'bg-neutral-100 dark:bg-neutral-800/15 text-neutral-500 dark:text-neutral-600'
}

/**
 * Get avatar border color based on badge tier.
 */
export function getTierBorderClass(tier: string | undefined): string {
  switch (tier) {
    case 'Platinum': return 'ring-2 ring-accent-500'
    case 'Gold': return 'ring-2 ring-accent-500'
    case 'Silver': return 'ring-2 ring-neutral-400'
    case 'Bronze': return 'ring-2 ring-neutral-300 dark:ring-neutral-600'
    default: return ''
  }
}

/**
 * Get rank title from LEVELS array by level number.
 */
export function getRankTitle(level: number): string {
  const levelDef = LEVELS.find(l => l.level === level)
  return levelDef?.name ?? 'Rookie'
}

// =====================
// SYSTEM EVENT GENERATION
// =====================

export function generateSystemEvents(
  matches: MatchData[],
  members: MemberData[],
  memberLevels: Map<string, MemberWithLevel>,
): SystemEvent[] {
  const events: SystemEvent[] = []

  // 1. Match results — for each completed match
  const completedMatches = matches
    .filter(m => m.is_completed && m.home_score_ft !== null && m.away_score_ft !== null)
    .sort((a, b) => new Date(b.completed_at || b.match_date).getTime() - new Date(a.completed_at || a.match_date).getTime())
    .slice(0, 5) // Only last 5

  for (const match of completedMatches) {
    const homeName = match.home_team?.country_name ?? match.home_team_placeholder ?? '???'
    const awayName = match.away_team?.country_name ?? match.away_team_placeholder ?? '???'

    const homeWon = match.home_score_ft! > match.away_score_ft!
    const awayWon = match.away_score_ft! > match.home_score_ft!
    const resultText = homeWon
      ? `${homeName} beat ${awayName} ${match.home_score_ft}-${match.away_score_ft}`
      : awayWon
      ? `${awayName} beat ${homeName} ${match.away_score_ft}-${match.home_score_ft}`
      : `${homeName} drew ${awayName} ${match.home_score_ft}-${match.away_score_ft}`

    events.push({
      id: `match-result-${match.match_id}`,
      event_type: 'match_result',
      emoji: '🏟️',
      content: `Match ${match.match_number} results are in! ${resultText}.`,
      timestamp: match.completed_at || match.match_date,
    })
  }

  // 2. Rank movements — from entries with rank changes
  for (const member of members) {
    const entries = member.entries ?? []
    for (const entry of entries) {
      if (
        entry.current_rank !== null &&
        entry.previous_rank !== null &&
        entry.current_rank !== entry.previous_rank &&
        entry.last_rank_update
      ) {
        const delta = entry.previous_rank - entry.current_rank
        const name = member.users.full_name || member.users.username
        if (delta > 0) {
          events.push({
            id: `rank-up-${entry.entry_id}`,
            event_type: 'rank_movement',
            emoji: '📊',
            content: `🔺 Leaderboard updated — ${name} moves to #${entry.current_rank} (+${delta} positions)`,
            highlighted_name: name,
            timestamp: entry.last_rank_update,
          })
        }
      }
    }
  }

  // Use latest completed match date as a stable reference timestamp
  // (avoids hydration mismatch from new Date() differing between server & client)
  const latestCompletedDate = completedMatches.length > 0
    ? (completedMatches[0].completed_at || completedMatches[0].match_date)
    : matches[0]?.match_date || '2026-01-01T00:00:00Z'

  // 3. Streak alerts — members with 5+ streaks
  for (const [userId, memberLevel] of memberLevels) {
    const member = members.find(m => m.user_id === userId)
    if (!member) continue
    const name = member.users.full_name || member.users.username

    // Check for On Fire badge (5-match streak indicator)
    const hasOnFire = memberLevel.badges.some(b => b.id === 'on_fire')
    if (hasOnFire) {
      events.push({
        id: `streak-${userId}`,
        event_type: 'streak_alert',
        emoji: '🔥',
        content: `${name} is on a hot streak! Can anyone stop them?`,
        highlighted_name: name,
        timestamp: latestCompletedDate,
      })
    }
  }

  // 4. Badge unlocks — recent badges from members
  for (const [userId, memberLevel] of memberLevels) {
    const member = members.find(m => m.user_id === userId)
    if (!member) continue
    const name = member.users.full_name || member.users.username

    for (const badge of memberLevel.badges.slice(0, 2)) { // Max 2 badges per member
      events.push({
        id: `badge-${userId}-${badge.id}`,
        event_type: 'badge_unlock',
        emoji: '🏆',
        content: `${name} just unlocked the ${badge.emoji} ${badge.name} badge!`,
        highlighted_name: name,
        timestamp: latestCompletedDate,
      })
    }
  }

  // Sort by timestamp desc, take most recent 10
  return events
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 10)
}

// =====================
// STAGE LABELS
// =====================

export function formatStageLabel(stage: string): string {
  switch (stage) {
    case 'group': return 'Group Stage'
    case 'round_32': return 'Round of 32'
    case 'round_16': return 'Round of 16'
    case 'quarter_final': return 'Quarter-Finals'
    case 'semi_final': return 'Semi-Finals'
    case 'third_place': return 'Third Place'
    case 'final': return 'Final'
    default: return stage
  }
}
