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

function badgeBgColor(tier: string): string {
  switch (tier) {
    case 'Platinum': return 'bg-neutral-100 dark:bg-neutral-700/50'
    case 'Gold': return 'bg-accent-50 dark:bg-accent-900/15'
    case 'Silver': return 'bg-neutral-50 dark:bg-neutral-800'
    case 'Bronze': return 'bg-neutral-50 dark:bg-neutral-800/50'
    default: return 'bg-neutral-50 dark:bg-neutral-800'
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

  // Show top 3 badges
  const topBadges = meta.badges.slice(0, 3)

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
        <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          Badge Flex
        </span>
      </div>

      {/* Divider */}
      <div className="border-t border-neutral-100 dark:border-border-default/50" />

      {/* Badges row */}
      <div className="px-3.5 py-3">
        {topBadges.length > 0 ? (
          <div className="flex gap-3 justify-center">
            {topBadges.map((badge) => (
              <div key={badge.id} className="flex flex-col items-center gap-1.5">
                {/* Emoji in rounded square */}
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl ${badgeBgColor(badge.tier)}`}>
                  {badge.emoji}
                </div>
                {/* Badge name */}
                <span className="text-[10px] font-medium text-neutral-700 dark:text-neutral-300 text-center leading-tight max-w-[80px]">
                  {badge.name}
                </span>
                {/* Rarity */}
                <span className="text-[10px] font-semibold text-accent-600 dark:text-accent-400">
                  {badge.rarity}
                </span>
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
