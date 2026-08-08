import { useEffect, useRef, useState } from 'react'

import { EmojiPicker } from './EmojiPicker'
import { EmojiReactions } from './EmojiReactions'
import { ReactorsModal } from './ReactorsModal'
import { Icon } from '@/components/ui/Icon'
import type { MemberData } from '../types'
import type { MessageWithReactions, ReplyPreview, MemberWithLevel, ReactionCount } from './types'
import { getInitials, formatClockTime, renderMessageContent, getLevelPillClasses, getRankTitle } from './helpers'
import { avatarGradient } from '@/lib/design/avatarGradient'

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
 */
function ReplyHeader({ reply, isOwn }: { reply: ReplyPreview; isOwn: boolean }) {
  return (
    <div className={`flex items-stretch gap-2 rounded-inset px-2 py-1.5 mb-1 overflow-hidden ${
      isOwn ? 'bg-white/15' : 'bg-ink/5'
    }`}>
      <div className={`w-0.5 shrink-0 rounded-pill ${isOwn ? 'bg-white/60' : 'bg-primary-500'}`} />
      <div className="min-w-0">
        <div className={`text-[11px] font-semibold leading-tight ${isOwn ? 'text-white/80' : 'text-primary-700'}`}>
          {reply.author_name}
        </div>
        <div className={`text-[11px] leading-tight truncate ${isOwn ? 'text-white/70' : 'text-muted'}`}>
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
 * One message row, ported from BanterBubble in
 * mobile/components/pool-detail/BanterSheet.tsx so the two chats read the same.
 *
 * The parts that carry the look, and what they were before:
 *
 *  - Received bubbles are a flat `mist` fill with no border. They used to be a
 *    bordered `surface` card, which read as a list of cards rather than speech.
 *  - 12px corners (RN radii.sm), with a 4px "tail" on the bottom-left of the
 *    LAST received bubble in a run, pointing at the avatar. Own bubbles get no
 *    tail — that is RN's rule, not an omission.
 *  - The timestamp lives INSIDE the bubble, bottom-right, on every message
 *    rather than once per run. A run of non-breaking space reserves inline room
 *    at the end of the text so the time either shares the last line or drops to
 *    its own, exactly as the RN version does.
 *  - Avatars carry a per-user gradient chosen by a hash of the user id, so the
 *    same person is the same colour here and in the app.
 *
 * isFirstInCluster/isLastInCluster default to true, so a message rendered on
 * its own is a complete row.
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
  // Reply and react were plumbed end to end — the composer takes a replyToId,
  // the row renders a quoted preview — but nothing on a bubble ever started
  // either. The programme measured the result: replies under 1%, and
  // reactions-on-text from about seven people in total, diagnosed as the
  // control being impossible to find.
  //
  // So the bar is VISIBLE on hover rather than gesture-only, with long-press and
  // right-click as accelerators for people who reach for them. Two more hidden
  // gestures would have repeated the cause.
  const [menuOpen, setMenuOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [reactorsOpen, setReactorsOpen] = useState(false)
  const pressTimer = useRef<number | null>(null)
  const rowRef = useRef<HTMLDivElement>(null)

  // 350ms matches delayLongPress in the RN sheet, so the two feel the same.
  const startPress = () => {
    // RN dismisses the keyboard first: with it up, the measured bubble can sit
    // behind it and the picker ends up anchored over empty space. blur() is the
    // web equivalent — it closes the on-screen keyboard and lets the feed
    // re-lay out before the picker is placed.
    pressTimer.current = window.setTimeout(() => {
      ;(document.activeElement as HTMLElement | null)?.blur()
      setPickerOpen(true)
    }, 350)
  }
  const cancelPress = () => {
    if (pressTimer.current !== null) {
      clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
  }

  useEffect(() => {
    if (!menuOpen && !pickerOpen) return
    const onDown = (e: MouseEvent) => {
      if (!rowRef.current?.contains(e.target as Node)) { setMenuOpen(false); setPickerOpen(false) }
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setMenuOpen(false); setPickerOpen(false) } }
    const onScroll = () => { setMenuOpen(false); setPickerOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    // capture: the feed is the scroller, and scroll does not bubble.
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [menuOpen, pickerOpen])

  useEffect(() => cancelPress, [])
  const author = members.find(m => m.user_id === message.user_id)
  const authorLevel = memberLevels.get(message.user_id)
  const isOwn = message.user_id === currentUserId
  const name = author?.users.full_name || author?.users.username || 'Unknown'

  return (
    /* The feed's space-y-3 is the baseline for every other item type; messages
       override it in both directions. A new speaker gets room to breathe, a
       continuation sits almost flush against the bubble above. */
    <div ref={rowRef} className={`group relative ${isFirstInCluster ? 'mt-5' : '-mt-2.5'}`}>
      <div className={`flex gap-1 items-end ${isOwn ? 'flex-row-reverse' : ''}`}>
        {/* Avatar sits beside the LAST bubble of the run; earlier bubbles get an
            empty slot the same size so the whole run keeps one left edge. */}
        {!isOwn && (
          <div className="shrink-0 w-9 h-9" aria-hidden={!isLastInCluster}>
            {isLastInCluster && (
              <div
                className="w-9 h-9 rounded-pill flex items-center justify-center text-[13px] font-bold text-white"
                style={{ backgroundImage: avatarGradient(message.user_id) }}
              >
                {getInitials(author?.users.full_name, author?.users.username)}
              </div>
            )}
          </div>
        )}

        <div className={`relative min-w-0 max-w-[85%] sm:max-w-md flex flex-col ${isOwn ? 'items-end' : 'items-start'} ${
          /* The overhang has to clear TWO things, which mb-3 did not:
             the pills hang 12px below the column, and the next message in a
             cluster pulls itself up by 10px (-mt-2.5). 12 + 10 = 22, so at
             mb-3 the pills landed 10px into the following bubble — which is
             exactly what they did. 24px leaves 2px of daylight. */
          onToggleReaction && reactions.length > 0 ? 'mb-6' : ''
        }`}>
          {/* Sender name — once per run, received side only. RN shows the name
              alone; the level pill is web-only and kept because it is existing
              product content, sized down to sit with the smaller name. */}
          {!isOwn && isFirstInCluster && (
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-[11px] font-semibold tracking-[0.3px] text-muted">
                {name}
              </span>
              {authorLevel && <LevelPill level={authorLevel.level} />}
            </div>
          )}

          <div
            onContextMenu={e => { if (onToggleReaction) { e.preventDefault(); setPickerOpen(true) } }}
            onTouchStart={startPress}
            onTouchEnd={cancelPress}
            onTouchMove={cancelPress}
            onTouchCancel={cancelPress}
            className={`relative px-3.5 py-2 text-base leading-[22px] font-medium break-words rounded-chip ${
            isOwn
              ? 'bg-primary-600 text-white'
              : `bg-mist text-ink ${isLastInCluster ? 'rounded-bl-sm' : ''}`
          }`}>
            {replyPreview && <ReplyHeader reply={replyPreview} isOwn={isOwn} />}
            {renderMessageContent(message.content, members, isOwn)}
            {/* Reserves inline room at the end of the last line for the
                absolutely-positioned time below. Without it the time overlaps
                the final words. RN does the same with non-breaking spaces. */}
            <span className="inline-block w-14 align-baseline" aria-hidden />
            <span
              // RN pins this at right:4 bottom:2 inside a text container that
              // itself sits inside the bubble's 4px padding — 8px and 4px from
              // the bubble's visual edge. At 10px/6px it drifted off the corner
              // and read as a word sitting beside the text.
              className={`absolute right-2 bottom-1 text-[11px] font-medium leading-none whitespace-nowrap ${
                isOwn ? 'text-white/70' : 'text-muted'
              }`}
              suppressHydrationWarning
            >
              {formatClockTime(message.created_at)}
            </span>
          </div>

          {/* Anchored over the bubble, like ReactionPicker in the RN sheet —
              opened by long-press, right-click, or the bar's react button.
              Sides with the bubble so it opens inward, never off-screen. */}
          {pickerOpen && onToggleReaction && (
            <div className="relative">
              <EmojiPicker
                anchor="above"
                side={isOwn ? 'left' : 'right'}
                onSelect={emoji => { onToggleReaction(emoji); setPickerOpen(false) }}
                onClose={() => setPickerOpen(false)}
              />
            </div>
          )}

          {/* Reactions sit under the bubble, using the same component the share
              cards use so a text message and a card react identically. Text was
              excluded before ("no reactions per spec"), which is what the
              programme's discoverability item asked to undo. */}
          {onToggleReaction && reactions.length > 0 && (
            /* Absolute so it adds no height. As a normal child it made the
               column taller, and the row is items-end — so the avatar aligned
               to the bottom of column-plus-reactions and drifted away from the
               bubble. -12px hangs it over the bubble's bottom edge, hugging the
               near corner: left for received, right for own, per ReactionPills.
               z-10 keeps the cut-out ring above the bubble. */
            <div
              className={`absolute -bottom-3 z-10 flex items-center gap-1 ${
                isOwn ? 'right-2.5' : 'left-2.5'
              }`}
            >
              <EmojiReactions
                reactions={reactions}
                onToggleReaction={onToggleReaction}
                pickerSide={isOwn ? 'left' : 'right'}
                /* The hover bar is the way in on a bubble; a dashed + beside
                   the pills was a second, uglier one. */
                showAddButton={false}
                onPillClick={() => setReactorsOpen(true)}
              />
            </div>
          )}

          {reactorsOpen && (
            <ReactorsModal
              reactions={reactions}
              members={members}
              currentUserId={currentUserId}
              onClose={() => setReactorsOpen(false)}
            />
          )}
        </div>

        {/* The action bar. Visible on hover on a pointer device, and forced open
            by long-press or right-click. Sits on the bubble's OUTER edge so it
            never covers the text, and `hidden` on touch where hover does not
            exist and the long-press menu takes over. */}
        {(onReply || onToggleReaction) && (
          <div
            /* Absolute, not a flex child. As a third child of a row whose
               message column is already max-w-[85%], it added its own width and
               pushed the row past the pane — on both sides, because the row
               reverses for your own messages. Pinned to the row's edge instead:
               it costs no layout width, and left-0/right-0 is the pane's inside
               edge by definition. */
            className={`absolute top-1 z-10 ${isOwn ? 'left-0' : 'right-0'} transition-opacity ${
              menuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'
            }`}
          >
            <div className="flex items-center gap-0.5 rounded-pill bg-surface border border-border-default shadow-card px-1 py-0.5">
              {onReply && (
                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); onReply() }}
                  aria-label="Reply to this message"
                  title="Reply"
                  className="p-1 rounded-pill text-muted hover:text-primary-600 hover:bg-snow transition-colors"
                >
                  <Icon name="arrow.uturn.left" size={14} weight="semibold" />
                </button>
              )}
              {onToggleReaction && reactions.length > 0 && (
                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); setReactorsOpen(true) }}
                  aria-label="See who reacted"
                  title="Who reacted"
                  className="px-1.5 py-1 rounded-pill t-detail text-muted hover:text-ink hover:bg-snow transition-colors"
                >
                  {reactions.reduce((n, r) => n + r.count, 0)}
                </button>
              )}
              {onToggleReaction && (
                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); setPickerOpen(o => !o) }}
                  aria-label="Add a reaction"
                  aria-expanded={pickerOpen}
                  title="React"
                  className="p-1 rounded-pill text-muted hover:bg-snow transition-colors text-sm leading-none"
                >
                  {'\u{1F642}'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
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
