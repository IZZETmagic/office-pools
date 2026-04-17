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
          <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-700">
            Current Standings
          </span>
        </div>
        <span className="text-[10px] font-medium text-neutral-400 uppercase tracking-wider">
          {meta.pool_name}
        </span>
      </div>

      {/* Divider */}
      <div className="border-t border-neutral-100 dark:border-border-default/50" />

      {/* Leaderboard rows */}
      <div className="px-1 py-1">
        {meta.entries.map((entry, idx) => {
          const isCurrentUser = entry.user_id === currentUserId
          const isFirst = entry.rank === 1
          return (
            <div key={`${entry.user_id}-${idx}`}>
              <div
                className={`flex items-center gap-2 px-2.5 py-2 rounded-lg ${
                  isFirst ? 'bg-accent-50/60 dark:bg-accent-400/30' : ''
                }`}
              >
                {/* Rank */}
                <span className="w-6 text-center text-sm shrink-0">
                  {RANK_MEDALS[entry.rank] ?? (
                    <span className="text-xs text-neutral-400 dark:text-neutral-700 font-medium">{entry.rank}</span>
                  )}
                </span>

                {/* Name */}
                <span className={`text-xs flex-1 truncate ${
                  isCurrentUser
                    ? 'font-semibold text-primary-700 dark:text-neutral-700'
                    : 'font-medium text-neutral-900 dark:text-neutral-700'
                }`}>
                  {entry.full_name}
                </span>

                {/* Points */}
                <span className="text-xs font-bold text-primary-600 dark:text-neutral-700 tabular-nums font-mono">
                  {entry.points.toLocaleString()}
                </span>
              </div>
              {/* Row divider */}
              {idx < meta.entries.length - 1 && (
                <div className="mx-3 border-t border-neutral-100 dark:border-border-default/30" />
              )}
            </div>
          )
        })}
      </div>
    </SharedCardWrapper>
  )
}
