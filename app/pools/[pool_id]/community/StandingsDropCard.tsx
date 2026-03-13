import type { MemberData } from '../types'
import type { MessageWithReactions, StandingsDropMetadata, MemberWithLevel, ReactionCount } from './types'
import { getInitials, formatMessageTime, getLevelPillClasses } from './helpers'
import { EmojiReactions } from './EmojiReactions'

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

  const author = members.find(m => m.user_id === message.user_id)
  const authorLevel = memberLevels.get(message.user_id)

  return (
    <div className="rounded-xl border border-neutral-200 dark:border-border-default bg-surface overflow-hidden">
      <div className="px-3.5 py-3">
        {/* Header */}
        <div className="flex items-center gap-2 mb-3">
          <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300">
            {getInitials(author?.users.full_name, author?.users.username)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                {author?.users.full_name || author?.users.username || 'Unknown'}
              </span>
              {authorLevel && (
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md leading-none ${getLevelPillClasses(authorLevel.level)}`}>
                  Lvl {authorLevel.level}
                </span>
              )}
            </div>
            <span className="text-[10px] text-neutral-400" suppressHydrationWarning>
              {formatMessageTime(message.created_at)}
            </span>
          </div>
          <span className="text-[10px] font-medium text-neutral-400 uppercase tracking-wider">
            📊 Standings
          </span>
        </div>

        {/* Pool name */}
        <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-2">
          {meta.pool_name} Leaderboard
        </p>

        {/* Leaderboard rows */}
        <div className="space-y-1">
          {meta.entries.map((entry) => {
            const isCurrentUser = entry.user_id === currentUserId
            return (
              <div
                key={entry.user_id}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg ${
                  isCurrentUser
                    ? 'bg-primary-50 dark:bg-primary-900/15 border border-primary-200 dark:border-primary-800'
                    : ''
                }`}
              >
                {/* Rank */}
                <span className="w-6 text-center text-sm shrink-0">
                  {RANK_MEDALS[entry.rank] ?? (
                    <span className="text-xs text-neutral-400 font-medium">{entry.rank}</span>
                  )}
                </span>

                {/* Name */}
                <span className={`text-xs flex-1 truncate ${
                  isCurrentUser
                    ? 'font-semibold text-primary-700 dark:text-primary-400'
                    : 'font-medium text-neutral-900 dark:text-neutral-100'
                }`}>
                  {entry.full_name}
                </span>

                {/* Points */}
                <span className="text-xs font-bold text-neutral-900 dark:text-neutral-100 tabular-nums">
                  {entry.points.toLocaleString()}
                </span>

                {/* Delta */}
                {entry.delta !== 0 && (
                  <span className={`text-[10px] font-medium w-8 text-right ${
                    entry.delta > 0 ? 'text-success-600 dark:text-success-400' : 'text-danger-600 dark:text-danger-400'
                  }`}>
                    {entry.delta > 0 ? '▲' : '▼'}{Math.abs(entry.delta)}
                  </span>
                )}
                {entry.delta === 0 && (
                  <span className="text-[10px] text-neutral-300 dark:text-neutral-600 w-8 text-right">—</span>
                )}
              </div>
            )
          })}
        </div>

        {/* Reactions */}
        <div className="mt-2.5 flex justify-start">
          <EmojiReactions reactions={reactions} onToggleReaction={onToggleReaction} />
        </div>
      </div>
    </div>
  )
}
