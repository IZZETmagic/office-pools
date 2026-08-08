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
  /** Passed straight to the message chassis. */
  onReply?: () => void
  currentUserId?: string
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
  currentUserId,
  onReply,
}: BadgeFlexCardProps) {
  const meta = message.metadata as unknown as BadgeFlexMetadata
  if (!meta?.badges) return null

  // RN flexes one badge. Multi-badge payloads predate that and lead with
  // their first rather than tiling.
  const badge = meta.badges[0] ?? null

  return (
    <SharedCardWrapper
      userId={message.user_id}
      createdAt={message.created_at}
      members={members}
      memberLevels={memberLevels}
      reactions={reactions}
      onToggleReaction={onToggleReaction}
      currentUserId={currentUserId}
      onReply={onReply}
    >
      {/* One badge, centred — RN's BadgeBody. The web showed a wrap-grid of
          every badge in 90px cards, which is the "share all your badges"
          affordance the app has no equivalent for: RN flexes a single badge and
          gives it the room to actually be looked at.

          The array is kept in the payload, so older multi-badge messages still
          render; they just lead with their first badge rather than tiling. */}
      <div className="flex flex-col items-center gap-2 px-4 py-4">
        {badge ? (
          <>
            <BadgeMedallion id={badge.id} emoji={badge.emoji} size={96} />
            <span className="text-lg font-bold text-ink text-center leading-tight line-clamp-2">
              {badge.name}
            </span>
            <div className="flex items-center gap-2">
              {badge.rarity && (
                <span className="text-[10px] font-bold uppercase tracking-[0.4px] text-accent-600">
                  {badge.rarity}
                </span>
              )}
              {badge.xpBonus > 0 && (
                <span className="t-num text-[13px] font-bold text-accent-600">
                  +{badge.xpBonus} XP
                </span>
              )}
            </div>
          </>
        ) : (
          <p className="text-xs text-muted italic text-center">
            No badges earned yet — keep predicting!
          </p>
        )}
      </div>
    </SharedCardWrapper>
  )
}
