import type { MemberData } from '../types'
import type { MessageWithReactions, BadgeFlexMetadata, MemberWithLevel, ReactionCount } from './types'
import { SharedCardWrapper } from './SharedCardWrapper'
import { rarityColor } from '@/lib/design/badges'
import { BadgeMedallion } from '@/components/BadgeMedallion'

type BadgeFlexCardProps = {
  message: MessageWithReactions
  members: MemberData[]
  memberLevels: Map<string, MemberWithLevel>
  reactions: ReactionCount[]
  onToggleReaction: (emoji: string) => void
}

const TIER_BORDER_COLORS: Record<string, string> = {
  Bronze: 'border-l-warning-500',
  Silver: 'border-l-muted',
  Gold: 'border-l-accent-500',
  Platinum: 'border-l-accent-500',
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
        <span className="text-sm font-semibold text-ink">
          Badge Flex
        </span>
      </div>

      {/* Divider */}
      <div className="border-t border-border-subtle/50" />

      {/* Badges grid — matching XP tab BadgeCard style */}
      <div className="px-3 py-3">
        {badges.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {badges.map((badge) => (
              <div
                key={badge.id}
                className={`relative w-[90px] rounded-chip px-1.5 py-1.5 text-center bg-surface border-l-[3px] ${TIER_BORDER_COLORS[badge.tier] || 'border-l-silver'} border border-border-default shadow-card dark:shadow-none ${badge.tier === 'Platinum' ? 'shimmer-effect' : ''}`}
              >
                {/* Emoji */}
                <div className="mb-1">
                  <BadgeMedallion id={badge.id} emoji={badge.emoji} size={28} className="mx-auto" />
                </div>
                {/* Name */}
                <div className="t-detail font-semibold text-ink mb-0.5 leading-tight">
                  {badge.name}
                </div>
                {/* Rarity */}
                <div className="text-[9px] font-medium" style={{ color: rarityColor(badge.rarity) }}>
                  {badge.rarity}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted italic text-center">No badges earned yet — keep predicting!</p>
        )}
      </div>
    </SharedCardWrapper>
  )
}
