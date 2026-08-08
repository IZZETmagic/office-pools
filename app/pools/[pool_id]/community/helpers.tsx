import type { MemberData, MatchData, EntryData } from '../types'
import type { SystemEvent, MemberWithLevel } from './types'
import { levelPillClass } from '@/lib/design/levels'
import { LEVELS, computeLevel } from '../analytics/xpSystem'
import type { EarnedBadge } from '../analytics/xpSystem'

// =====================
// TEXT HELPERS
// =====================

export function getInitials(fullName: string | null | undefined, username: string | undefined): string {
  // Mirrors getInitials in mobile/components/pool-detail/BanterSheet.tsx: first
  // and last initial for a multi-word name, but the FIRST TWO LETTERS of a
  // single-word one. The web copy took only the first letter, so a one-word
  // display name like "OdieBug" showed "O" in a 36px circle where the app
  // shows "OD".
  const source = fullName?.trim() || username?.trim()
  if (!source) return '??'
  const parts = source.split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
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

/**
 * Clock time for a message, e.g. "3:42 pm".
 *
 * Separate from formatMessageTime, which stays relative ("2h ago") for the
 * activity feed and the shared-card headers. In the message list the day is
 * already carried by the day header above, so repeating it on every row said
 * nothing — two messages three hours apart both read "Jul 19".
 */
export function formatClockTime(dateStr: string): string {
  // Pinned to en-US, not the browser locale: RN renders "11:04 PM" and several
  // locales — including the one this machine defaults to — spell it "11:04 p.m."
  return new Date(dateStr).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
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
          // Own bubbles: white + bold, as the RN BanterSheet does. It was
          // accent-800 — a dark gold on primary blue, which is why a mention
          // in your own message was almost unreadable.
          //
          // Received bubbles keep primary rather than RN's accent: gold
          // (#F5C518) on mist (#EEF1F8) measures 1.45:1, so copying that half
          // would trade one invisible mention for another. primary-600 on mist
          // is 3.79:1 and bold.
          <span key={i} className={`font-bold ${isOwn ? 'text-white' : 'text-primary-600'}`}>
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
 * Level pill treatment. Delegates to the canonical ladder in
 * lib/design/levels.ts rather than keeping a third copy: the one that lived
 * here had only three bands where the app has five, so L4 rendered neutral
 * instead of sky and L10 got amber instead of the solid gold top band.
 */
export function getLevelPillClasses(level: number): string {
  return levelPillClass(level)
}

/**
 * Get avatar border color based on badge tier.
 */
export function getTierBorderClass(tier: string | undefined): string {
  switch (tier) {
    case 'Platinum': return 'ring-2 ring-accent-500'
    case 'Gold': return 'ring-2 ring-accent-500'
    case 'Silver': return 'ring-2 ring-muted'
    case 'Bronze': return 'ring-2 ring-silver'
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
            // No inline arrow: the card renders one, tinted, from event_type.
            // This was 🔺 — a RED triangle on a row only ever emitted when
            // delta > 0, so every promotion in the feed was coloured like a loss.
            content: `Leaderboard updated — ${name} moves to #${entry.current_rank} (+${delta} positions)`,
            highlighted_name: name,
            timestamp: entry.last_rank_update,
          })
        }
      }
    }
  }

  // Map match_number → completion timestamp so badge unlocks can be dated to the
  // match in which they were actually earned (EarnedBadge.earnedAt is a match number).
  const matchDateByNumber = new Map<number, string>()
  for (const m of matches) {
    if (m.is_completed) {
      matchDateByNumber.set(m.match_number, m.completed_at || m.match_date)
    }
  }

  // Per-user fallback timestamp for badges with no `earnedAt` (e.g. Lightning Rod,
  // Stadium Regular — earned by submitting predictions, not by match results).
  // Use the earliest non-null predictions_submitted_at across the member's entries.
  const submittedAtByUser = new Map<string, string>()
  for (const member of members) {
    let earliest: string | null = null
    for (const entry of member.entries ?? []) {
      const t = entry.predictions_submitted_at
      if (t && (!earliest || new Date(t).getTime() < new Date(earliest).getTime())) {
        earliest = t
      }
    }
    if (earliest) submittedAtByUser.set(member.user_id, earliest)
  }

  // 3. Streak alerts — members with 5+ streaks
  for (const [userId, memberLevel] of memberLevels) {
    const member = members.find(m => m.user_id === userId)
    if (!member) continue
    const name = member.users.full_name || member.users.username

    // Check for On Fire badge (5-match streak indicator)
    const onFire = memberLevel.badges.find(b => b.id === 'on_fire')
    if (onFire) {
      const streakTimestamp =
        onFire.earnedAt !== undefined ? matchDateByNumber.get(onFire.earnedAt) : undefined
      // Streak only makes sense once matches have completed; skip if we have no real date.
      if (streakTimestamp) {
        events.push({
          id: `streak-${userId}`,
          event_type: 'streak_alert',
          emoji: '🔥',
          content: `${name} is on a hot streak! Can anyone stop them?`,
          highlighted_name: name,
          timestamp: streakTimestamp,
        })
      }
    }
  }

  // 4. Badge unlocks — recent badges from members
  for (const [userId, memberLevel] of memberLevels) {
    const member = members.find(m => m.user_id === userId)
    if (!member) continue
    const name = member.users.full_name || member.users.username

    for (const badge of memberLevel.badges.slice(0, 2)) { // Max 2 badges per member
      // Prefer the match the badge was earned in (match-result badges);
      // fall back to the member's earliest predictions_submitted_at for
      // submission-based badges (Lightning Rod, Stadium Regular, etc.).
      const matchTimestamp =
        badge.earnedAt !== undefined ? matchDateByNumber.get(badge.earnedAt) : undefined
      const badgeTimestamp = matchTimestamp || submittedAtByUser.get(userId)
      // Skip if we still have no real timestamp — better than showing a future date.
      if (!badgeTimestamp) continue
      events.push({
        id: `badge-${userId}-${badge.id}`,
        event_type: 'badge_unlock',
        emoji: '🏆',
        // No inline badge emoji: the row leads with a trophy icon and names the
        // badge immediately after, so the glyph sat between two things already
        // saying it — "🏆 … unlocked the 🎯 Sharpshooter badge".
        content: `${name} just unlocked the ${badge.name} badge!`,
        highlighted_name: name,
        timestamp: badgeTimestamp,
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
