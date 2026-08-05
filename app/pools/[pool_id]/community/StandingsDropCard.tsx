import type { MemberData } from '../types'
import type { MessageWithReactions, StandingsDropMetadata, MemberWithLevel, ReactionCount } from './types'
import { SharedCardWrapper } from './SharedCardWrapper'

type StandingsDropCardProps = {
  message: MessageWithReactions
  members: MemberData[]
  memberLevels: Map<string, MemberWithLevel>
  currentUserId: string
  reactions: ReactionCount[]
  onToggleReaction: (emoji: string) => void
}

const RANK_MEDALS: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }

export function StandingsDropCard({
  message,
  members,
  memberLevels,
  currentUserId,
  reactions,
  onToggleReaction,
}: StandingsDropCardProps) {
  const meta = message.metadata as unknown as StandingsDropMetadata
  if (!meta?.entries) return null

  return (
    <SharedCardWrapper
      userId={message.user_id}
      createdAt={message.created_at}
      members={members}
      memberLevels={memberLevels}
      reactions={reactions}
      onToggleReaction={onToggleReaction}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3.5 pt-3 pb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-sm">📊</span>
          <span className="text-sm font-semibold text-ink">
            Current Standings
          </span>
        </div>
        <span className="text-[10px] font-medium text-muted uppercase tracking-wider">
          {meta.pool_name}
        </span>
      </div>

      {/* Divider */}
      <div className="border-t border-border-subtle/50" />

      {/* Leaderboard rows */}
      <div className="px-1 py-1">
        {meta.entries.map((entry, idx) => {
          const isCurrentUser = entry.user_id === currentUserId
          const isFirst = entry.rank === 1
          return (
            <div key={`${entry.user_id}-${idx}`}>
              <div
                className={`flex items-center gap-2 px-2.5 py-2 rounded-chip ${
                  // 15%, not 30%: this is the app's tint recipe (see rarityTint), and at 30%
                  // the dark band came out a mid olive that the primary points could not
                  // clear — 2.41:1. The old code worked around it by overriding the points
                  // to a light neutral in dark only.
                  isFirst ? 'bg-accent-50/60 dark:bg-accent-400/15' : ''
                }`}
              >
                {/* Rank */}
                <span className="w-6 text-center text-sm shrink-0">
                  {RANK_MEDALS[entry.rank] ?? (
                    <span className="text-xs text-muted font-medium">{entry.rank}</span>
                  )}
                </span>

                {/* Name */}
                <span className={`text-xs flex-1 truncate ${
                  isCurrentUser
                    ? 'font-semibold text-primary-700'
                    : 'font-medium text-ink'
                }`}>
                  {entry.full_name}
                </span>

                {/* Points */}
                {/* Points are primary everywhere else, but the leader's row already
                    carries the accent band behind it, and primary-on-accent does not
                    clear AA in either mode. On that one row they take ink, the same
                    token the name beside them uses. */}
                <span className={`t-num text-xs ${isFirst ? 'text-ink' : 'text-primary-600'}`}>
                  {entry.points.toLocaleString()}
                </span>
              </div>
              {/* Row divider */}
              {idx < meta.entries.length - 1 && (
                <div className="mx-3 border-t border-border-subtle/30" />
              )}
            </div>
          )
        })}
      </div>
    </SharedCardWrapper>
  )
}
