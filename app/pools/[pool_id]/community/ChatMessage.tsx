'use client'

import { MessageRow } from './MessageRow'
import type { MemberData } from '../types'
import type { MessageWithReactions, ReplyPreview, MemberWithLevel, ReactionCount } from './types'
import { getInitials, formatClockTime, renderMessageContent, getLevelPillClasses, getRankTitle } from './helpers'

// =====================
// LEVEL PILL
// =====================

function LevelPill({ level }: { level: number }) {
  return (
    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-chip leading-none whitespace-nowrap ${getLevelPillClasses(level)}`}>
      Lvl {level} · {getRankTitle(level)}
    </span>
  )
}

// =====================
// DAY HEADER
// =====================

export function DayHeader({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3 my-4">
      <div className="flex-1 border-t border-border-default" />
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted shrink-0" suppressHydrationWarning>
        {text}
      </span>
      <div className="flex-1 border-t border-border-default" />
    </div>
  )
}

// =====================
// REPLY PREVIEW HEADER
// =====================

/**
 * The quoted message, rendered INSIDE the bubble above the reply — which is
 * where RN puts it. It used to be a separate block sitting above the bubble
 * with its own top corners, so a reply read as two detached slabs with a seam
 * between them instead of one message quoting another.
 *
 * rounded-chip and six lines, matching the composer's preview — the two are the
 * same quote and should read the same. The radius was the 6px inset step, on the
 * argument that a 12px bubble makes 6px read as nested; at this width it read as
 * square instead, which is the answer that matters.
 */
function ReplyHeader({ reply, isOwn }: { reply: ReplyPreview; isOwn: boolean }) {
  return (
    <div className={`flex items-stretch gap-2 rounded-chip px-2.5 py-2 mb-1 overflow-hidden ${
      isOwn ? 'bg-white/15' : 'bg-ink/5'
    }`}>
      <div className={`w-0.5 shrink-0 rounded-pill ${isOwn ? 'bg-white/60' : 'bg-primary-500'}`} />
      <div className="min-w-0">
        <div className={`text-[11px] font-semibold leading-tight ${isOwn ? 'text-white/80' : 'text-primary-700'}`}>
          {reply.author_name}
        </div>
        {/* Six lines, matching the composer's preview. This was truncate — one
            line and an ellipsis — so the quote in a sent reply showed less of
            the message than the box you typed it in, and a reply to anything
            longer than a sentence lost the thing it was answering. */}
        <div className={`text-[11px] leading-tight line-clamp-6 break-words whitespace-pre-wrap ${isOwn ? 'text-white/70' : 'text-muted'}`}>
          {reply.content}
        </div>
      </div>
    </div>
  )
}

// =====================
// CHAT MESSAGE
// =====================

/**
 * One text message: the bubble, and nothing else.
 *
 * Everything around it — avatar, sender name, width cap, cluster spacing, the
 * reply/react menu, the reaction pills and the who-reacted sheet — lives in
 * MessageRow, which shared cards render through too. This file used to carry
 * its own copy of all of it, which meant every fix to that machinery had to be
 * made twice and the second one was easy to forget.
 *
 * What is genuinely bubble-specific and stays here:
 *
 *  - The `mist` fill with no border, and a 4px tail on the bottom-left of the
 *    LAST received bubble in a run, pointing at the avatar. Own bubbles get no
 *    tail — RN's rule, not an omission.
 *  - The timestamp INSIDE the bubble, bottom-right, on every message. A run of
 *    reserved inline space at the end of the text keeps it off the last words,
 *    which is how the RN version does it too.
 *  - The quoted reply, rendered inside the bubble rather than above it.
 */
export function ChatMessage({
  message,
  members,
  memberLevels,
  currentUserId,
  replyPreview,
  reactions = [],
  onToggleReaction,
  onReply,
  isFirstInCluster = true,
  isLastInCluster = true,
}: {
  message: MessageWithReactions
  members: MemberData[]
  memberLevels: Map<string, MemberWithLevel>
  currentUserId: string
  replyPreview?: ReplyPreview | null
  reactions?: ReactionCount[]
  onToggleReaction?: (emoji: string) => void
  /** Opens the composer's reply banner against this message. */
  onReply?: () => void
  isFirstInCluster?: boolean
  isLastInCluster?: boolean
}) {
  const isOwn = message.user_id === currentUserId

  return (
    <MessageRow
      userId={message.user_id}
      members={members}
      memberLevels={memberLevels}
      currentUserId={currentUserId}
      reactions={reactions}
      onToggleReaction={onToggleReaction}
      onReply={onReply}
      isFirstInCluster={isFirstInCluster}
      isLastInCluster={isLastInCluster}
    >
      <div
        className={`relative px-3.5 py-2 text-base leading-[22px] font-medium break-words rounded-chip ${
          isOwn
            ? 'bg-primary-600 text-white'
            : `bg-mist text-ink ${isLastInCluster ? 'rounded-bl-sm' : ''}`
        }`}
      >
        {replyPreview && <ReplyHeader reply={replyPreview} isOwn={isOwn} />}
        {renderMessageContent(message.content, members, isOwn)}
        {/* Reserves inline room at the end of the last line for the
            absolutely-positioned time below. Without it the time overlaps the
            final words. RN does the same with non-breaking spaces. */}
        <span className="inline-block w-14 align-baseline" aria-hidden />
        <span
          // RN pins this at right:4 bottom:2 inside a text container that itself
          // sits inside the bubble's 4px padding — 8px and 4px from the bubble's
          // visual edge. At 10px/6px it drifted off the corner and read as a
          // word sitting beside the text.
          className={`absolute right-2 bottom-1 text-[11px] font-medium leading-none whitespace-nowrap ${
            isOwn ? 'text-white/70' : 'text-muted'
          }`}
          suppressHydrationWarning
        >
          {formatClockTime(message.created_at)}
        </span>
      </div>
    </MessageRow>
  )
}

// =====================
// MENTION DROPDOWN
// =====================

export function MentionDropdown({
  members,
  memberLevels,
  selectedIndex,
  onSelect,
}: {
  members: MemberData[]
  memberLevels: Map<string, MemberWithLevel>
  selectedIndex: number
  onSelect: (member: MemberData) => void
}) {
  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 bg-surface border border-border-default rounded-control shadow-lg max-h-48 overflow-y-auto z-10">
      {members.map((member, i) => {
        const level = memberLevels.get(member.user_id)
        return (
          <button
            key={member.user_id}
            onClick={() => onSelect(member)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-snow transition-colors ${
              i === selectedIndex ? 'bg-snow' : ''
            } ${i === 0 ? 'rounded-t-control' : ''} ${i === members.length - 1 ? 'rounded-b-control' : ''}`}
          >
            <div className="shrink-0 w-6 h-6 rounded-pill bg-mist flex items-center justify-center text-[9px] font-bold text-muted">
              {getInitials(member.users.full_name, member.users.username)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-medium text-ink truncate">{member.users.full_name}</p>
                {level && <LevelPill level={level.level} />}
              </div>
              <p className="text-[10px] text-muted truncate">@{member.users.username}</p>
            </div>
          </button>
        )
      })}
    </div>
  )
}
