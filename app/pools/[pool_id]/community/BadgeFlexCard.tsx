import type { MemberData } from '../types'
import type { MessageWithReactions, BadgeFlexMetadata, MemberWithLevel, ReactionCount } from './types'
import { SharedCardWrapper } from './SharedCardWrapper'

type BadgeFlexCardProps = {
  message: MessageWithReactions
  members: MemberData[]
  memberLevels: Map<string, MemberWithLevel>
  reactions: ReactionCount[]
  onToggleReaction: (emoji: string) => void
}

const TIER_BORDER_COLORS: Record<string, string> = {
  Bronze: 'border-l-warning-500',
  Silver: 'border-l-neutral-400',
  Gold: 'border-l-accent-500',
  Platinum: 'border-l-accent-500',
}

const RARITY_COLORS: Record<string, string> = {
  Common: 'text-neutral-500 dark:text-neutral-800',
  Uncommon: 'text-success-600 dark:text-success-400',
  Rare: 'text-primary-600 dark:text-primary-400',
  'Very Rare': 'text-accent-500 dark:text-accent-500',
  Legendary: 'text-warning-500 dark:text-warning-400',
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

  const badges = meta.badges

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
      <div className="flex items-center gap-1.5 px-3.5 pt-3 pb-2">
        <span className="text-sm">🏆</span>
        <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-700">
          Badge Flex
        </span>
      </div>

      {/* Divider */}
      <div className="border-t border-neutral-100 dark:border-border-default/50" />

      {/* Badges grid — matching XP tab BadgeCard style */}
      <div className="px-3 py-3">
        {badges.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {badges.map((badge) => (
              <div
                key={badge.id}
                className={`relative w-[90px] rounded-lg px-1.5 py-1.5 text-center bg-surface border-l-[3px] ${TIER_BORDER_COLORS[badge.tier] || 'border-l-neutral-300'} border border-neutral-200 dark:border-neutral-400 shadow-sm dark:shadow-none ${badge.tier === 'Platinum' ? 'shimmer-effect' : ''}`}
              >
                {/* Emoji */}
                <div className="text-lg mb-1">
                  {badge.emoji}
                </div>
                {/* Name */}
                <div className="text-[10px] font-semibold text-neutral-900 dark:text-white mb-0.5 leading-tight">
                  {badge.name}
                </div>
                {/* Rarity */}
                <div className={`text-[9px] font-medium ${RARITY_COLORS[badge.rarity] || 'text-neutral-500'}`}>
                  {badge.rarity}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-neutral-400 italic text-center">No badges earned yet — keep predicting!</p>
        )}
      </div>
    </SharedCardWrapper>
  )
}
