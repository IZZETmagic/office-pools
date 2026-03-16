import type { MemberData, MatchData, EntryData, PredictionData, TeamData, SettingsData, BPGroupRanking, BPThirdPlaceRanking, BPKnockoutPick } from '../types'
import type { EarnedBadge } from '../analytics/xpSystem'
import type { MatchConductData } from '@/lib/tournament'

// =====================
// MESSAGE TYPES
// =====================

export type MessageType = 'text' | 'prediction_share' | 'badge_flex' | 'standings_drop' | 'system_event'

export type Message = {
  message_id: string
  pool_id: string
  user_id: string
  content: string
  mentions: string[]
  created_at: string
  message_type: MessageType
  reply_to_message_id: string | null
  metadata: Record<string, any>
}

export type ReactionCount = {
  emoji: string
  count: number
  reacted_by_me: boolean
}

export type MessageWithReactions = Message & {
  reactions: ReactionCount[]
}

// =====================
// METADATA TYPES
// =====================

export type PredictionShareMetadata = {
  entry_id: string
  match_id: string
  match_number: number
  stage: string
  predicted_home: number
  predicted_away: number
  actual_home: number
  actual_away: number
  outcome: 'exact' | 'correct' | 'miss'
  home_team_name: string
  away_team_name: string
  home_team_code: string
  away_team_code: string
  home_flag_url: string | null
  away_flag_url: string | null
}

export type BadgeFlexMetadata = {
  badges: { id: string; emoji: string; name: string; tier: string; rarity: string; xpBonus: number }[]
  level: number
  level_name: string
  total_xp: number
}

export type StandingsDropMetadata = {
  entries: { user_id: string; full_name: string; rank: number; points: number; delta: number }[]
  pool_name: string
  timestamp: string
}

// =====================
// PINNED MESSAGE
// =====================

export type PinnedMessage = {
  pinned_id: string
  pool_id: string
  pinned_by: string
  title: string
  description: string
  cta_type: 'share_bold_call' | 'custom'
  is_active: boolean
  created_at: string
  updated_at: string
}

// =====================
// PRESENCE
// =====================

export type PresenceState = {
  user_id: string
  username: string
  full_name: string
  online_at: string
  is_typing: boolean
}

// =====================
// SYSTEM EVENTS
// =====================

export type SystemEvent = {
  id: string
  event_type: 'match_result' | 'badge_unlock' | 'streak_alert' | 'rank_movement'
  emoji: string
  content: string
  highlighted_name?: string
  timestamp: string
}

// =====================
// MEMBER WITH LEVEL
// =====================

export type MemberWithLevel = {
  user_id: string
  username: string
  full_name: string
  level: number
  level_name: string
  total_xp: number
  current_rank: number | null
  badges: EarnedBadge[]
}

// =====================
// FEED ITEM (unified type for rendering)
// =====================

export type FeedItem =
  | { type: 'message'; data: MessageWithReactions }
  | { type: 'system_event'; data: SystemEvent }
  | { type: 'day_header'; data: { text: string; key: string } }
  | { type: 'new_divider'; data: null }

// =====================
// REPLY PREVIEW
// =====================

export type ReplyPreview = {
  message_id: string
  content: string
  author_name: string
}

// =====================
// COMPONENT PROPS
// =====================

export type CommunityTabProps = {
  poolId: string
  poolName: string
  currentUserId: string
  members: MemberData[]
  isAdmin: boolean
  matches: MatchData[]
  teams: TeamData[]
  allPredictions: PredictionData[]
  userEntries: EntryData[]
  settings: SettingsData
  conductData: MatchConductData[]
  predictionMode: 'full_tournament' | 'progressive' | 'bracket_picker'
  onShowHowToPlay: () => void
  // Bracket picker data (for BP badge computation)
  allBPGroupRankings?: BPGroupRanking[]
  allBPThirdPlaceRankings?: BPThirdPlaceRanking[]
  allBPKnockoutPicks?: BPKnockoutPick[]
  poolCreatedAt?: string
  /** Pre-fetched last_read_at from useUnreadBanter (captured before markAsRead runs) */
  initialLastReadAt?: string | null
}
