import type { MemberData } from '../types'
import type { MemberWithLevel, ReactionCount } from './types'
import { getInitials, formatMessageTime, getLevelPillClasses, getRankTitle } from './helpers'
import { EmojiReactions } from './EmojiReactions'

type SharedCardWrapperProps = {
  userId: string
  createdAt: string
  members: MemberData[]
  memberLevels: Map<string, MemberWithLevel>
  reactions: ReactionCount[]
  onToggleReaction: (emoji: string) => void
  children: React.ReactNode
}

export function SharedCardWrapper({
  userId,
  createdAt,
  members,
  memberLevels,
  reactions,
  onToggleReaction,
  children,
}: SharedCardWrapperProps) {
  const author = members.find(m => m.user_id === userId)
  const authorLevel = memberLevels.get(userId)

  return (
    <div>
      {/* Attribution row */}
      <div className="flex items-center gap-2 mb-1.5">
        <div className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[8px] font-bold bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300">
          {getInitials(author?.users.full_name, author?.users.username)}
        </div>
        <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 truncate">
          {author?.users.full_name || author?.users.username || 'Unknown'}
        </span>
        {authorLevel && (
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md leading-none whitespace-nowrap ${getLevelPillClasses(authorLevel.level)}`}>
            Lvl {authorLevel.level} · {getRankTitle(authorLevel.level)}
          </span>
        )}
        <span className="text-[10px] text-neutral-400 ml-auto shrink-0" suppressHydrationWarning>
          {formatMessageTime(createdAt)}
        </span>
      </div>

      {/* Card */}
      <div className="rounded-xl border border-neutral-200 dark:border-border-default bg-white dark:bg-neutral-800/50 overflow-hidden">
        {children}
      </div>

      {/* Reaction row */}
      <div className="mt-1.5 flex justify-start">
        <EmojiReactions reactions={reactions} onToggleReaction={onToggleReaction} />
      </div>
    </div>
  )
}
