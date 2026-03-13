import type { MemberData } from '../types'
import type { MessageWithReactions, BadgeFlexMetadata, MemberWithLevel, ReactionCount } from './types'
import { getInitials, formatMessageTime, getLevelPillClasses } from './helpers'
import { EmojiReactions } from './EmojiReactions'

type BadgeFlexCardProps = {
  message: MessageWithReactions
  members: MemberData[]
  memberLevels: Map<string, MemberWithLevel>
  reactions: ReactionCount[]
  onToggleReaction: (emoji: string) => void
}

function TierColor(tier: string): string {
  switch (tier) {
    case 'Platinum': return 'bg-neutral-100 dark:bg-neutral-800 border-accent-400 dark:border-accent-500'
    case 'Gold': return 'bg-accent-50 dark:bg-accent-900/15 border-accent-300 dark:border-accent-700'
    case 'Silver': return 'bg-neutral-50 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600'
    case 'Bronze': return 'bg-neutral-50 dark:bg-neutral-800/50 border-neutral-200 dark:border-neutral-700'
    default: return 'bg-neutral-50 dark:bg-neutral-800 border-neutral-200 dark:border-border-default'
  }
}

export function BadgeFlexCard({
  message,
  members,
  memberLevels,
  reactions,
  onToggleReaction,
}: BadgeFlexCardProps) {
  const meta = message.metadata as unknown as BadgeFlexMetadata
  if (!meta?.badges) return null

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
            🏆 Badge Flex
          </span>
        </div>

        {/* Level + XP */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
            {meta.level_name}
          </span>
          <span className="text-[10px] text-neutral-400">
            Level {meta.level} · {meta.total_xp.toLocaleString()} XP
          </span>
        </div>

        {/* Badges grid */}
        <div className="flex flex-wrap gap-1.5">
          {meta.badges.map((badge) => (
            <div
              key={badge.id}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-xs ${TierColor(badge.tier)}`}
            >
              <span>{badge.emoji}</span>
              <span className="font-medium text-neutral-700 dark:text-neutral-300">{badge.name}</span>
              <span className="text-[9px] text-neutral-400">{badge.rarity}</span>
            </div>
          ))}
          {meta.badges.length === 0 && (
            <p className="text-xs text-neutral-400 italic">No badges earned yet — keep predicting!</p>
          )}
        </div>

        {/* Reactions */}
        <div className="mt-2.5 flex justify-start">
          <EmojiReactions reactions={reactions} onToggleReaction={onToggleReaction} />
        </div>
      </div>
    </div>
  )
}
