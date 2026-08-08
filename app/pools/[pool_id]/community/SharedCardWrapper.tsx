'use client'

import { MessageRow } from './MessageRow'
import type { MemberData } from '../types'
import type { MemberWithLevel, ReactionCount } from './types'

type SharedCardWrapperProps = {
  userId: string
  createdAt: string
  members: MemberData[]
  memberLevels: Map<string, MemberWithLevel>
  reactions: ReactionCount[]
  onToggleReaction: (emoji: string) => void
  currentUserId?: string
  /** Opens the composer's reply banner against this card. */
  onReply?: () => void
  children: React.ReactNode
}

/**
 * A shared card is a message. It just happens to contain a card.
 *
 * This used to build its own row — a 24px avatar above the card, its own name
 * and level pill, its own reaction strip — none of which matched a text bubble.
 * The card then ran the full width of the pane while every message beside it
 * stopped at 85%, and because it never went through the message chassis it had
 * no reply or react gesture at all.
 *
 * It renders through MessageRow now, the same chassis ChatMessage uses, so all
 * three card types inherit the avatar position, the width cap, clustering, the
 * right-click and long-press menu, and the overlapping reaction pills at once.
 * That is how RN does it too: BanterRichCard renders inside the bubble row
 * rather than beside it.
 */
export function SharedCardWrapper({
  userId,
  createdAt,
  members,
  memberLevels,
  reactions,
  onToggleReaction,
  currentUserId,
  onReply,
  children,
}: SharedCardWrapperProps) {
  return (
    <MessageRow
      userId={userId}
      createdAt={createdAt}
      members={members}
      memberLevels={memberLevels}
      currentUserId={currentUserId ?? ''}
      reactions={reactions}
      onToggleReaction={onToggleReaction}
      onReply={onReply}
      wide
    >
      {/* The card keeps its own surface and border — it is a card inside a
          message, not a bubble. rounded-chip matches the bubble's corner so the
          two read as the same family. */}
      <div className="w-full rounded-chip border border-border-default bg-surface overflow-hidden">
        {children}
      </div>
    </MessageRow>
  )
}
