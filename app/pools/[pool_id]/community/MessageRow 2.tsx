'use client'

import { useEffect, useRef, useState } from 'react'

import { EmojiPicker } from './EmojiPicker'
import { EmojiReactions } from './EmojiReactions'
import { ReactorsModal } from './ReactorsModal'
import { Icon } from '@/components/ui/Icon'
import type { MemberData } from '../types'
import type { MemberWithLevel, ReactionCount } from './types'
import { getInitials, getLevelPillClasses, getRankTitle } from './helpers'
import { avatarGradient } from '@/lib/design/avatarGradient'

function LevelPill({ level }: { level: number }) {
  return (
    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-chip leading-none whitespace-nowrap ${getLevelPillClasses(level)}`}>
      Lvl {level} · {getRankTitle(level)}
    </span>
  )
}

/** The quick row the action menu offers before falling through to the full picker. */
const QUICK_EMOJI = ['\u{1F44D}', '\u{1F602}', '\u{1F525}', '\u{1F62E}', '\u{1F622}', '\u{1F44F}']

/**
 * The chassis every message sits in, whatever its body.
 *
 * Pulled out of ChatMessage so a shared card is a message too. Before this the
 * cards built their own row and ran the full pane width, missing the avatar
 * position, the 85% cap, clustering, the reply/react menu and the reaction
 * overlap — all of which live here.
 *
 * Owns: avatar slot and its gradient, sender name and level pill, the width cap,
 * cluster spacing, long-press / right-click menu, the anchored emoji picker,
 * the overlapping reaction pills, and the who-reacted sheet.
 */
export function MessageRow({
  userId,
  members,
  memberLevels,
  currentUserId,
  reactions = [],
  onToggleReaction,
  onReply,
  isFirstInCluster = true,
  isLastInCluster = true,
  wide = false,
  children,
}: {
  userId: string
  createdAt?: string
  members: MemberData[]
  memberLevels: Map<string, MemberWithLevel>
  currentUserId: string
  reactions?: ReactionCount[]
  onToggleReaction?: (emoji: string) => void
  onReply?: () => void
  isFirstInCluster?: boolean
  isLastInCluster?: boolean
  /**
   * Rich cards run wider than speech. max-w-md is a comfortable measure for a
   * sentence, but a five-row standings table has a rank, a full name and a
   * score to fit on one line, and at 448px the names were pushed against the
   * points. Cards get lg; bubbles stay at md.
   */
  wide?: boolean
  children: React.ReactNode
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [reactorsOpen, setReactorsOpen] = useState(false)
  const pressTimer = useRef<number | null>(null)
  const rowRef = useRef<HTMLDivElement>(null)

  // 350ms matches delayLongPress in the RN sheet, so the two feel the same.
  const startPress = () => {
    // RN dismisses the keyboard first: with it up, the measured bubble can sit
    // behind it and the menu ends up anchored over empty space.
    pressTimer.current = window.setTimeout(() => {
      ;(document.activeElement as HTMLElement | null)?.blur()
      setMenuOpen(true)
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

  const author = members.find(m => m.user_id === userId)
  const authorLevel = memberLevels.get(userId)
  const isOwn = userId === currentUserId
  const name = author?.users.full_name || author?.users.username || 'Unknown'

  return (
    <div ref={rowRef} className={`relative ${isFirstInCluster ? 'mt-5' : '-mt-2.5'}`}>
      <div className={`flex gap-1 items-end ${isOwn ? 'flex-row-reverse' : ''}`}>
        {!isOwn && (
          <div className="shrink-0 w-9 h-9" aria-hidden={!isLastInCluster}>
            {isLastInCluster && (
              <div
                className="w-9 h-9 rounded-pill flex items-center justify-center text-[13px] font-bold text-white"
                style={{ backgroundImage: avatarGradient(userId) }}
              >
                {getInitials(author?.users.full_name, author?.users.username)}
              </div>
            )}
          </div>
        )}

        <div className={`relative min-w-0 max-w-[85%] ${wide ? 'sm:max-w-lg' : 'sm:max-w-md'} flex flex-col ${isOwn ? 'items-end' : 'items-start'} ${
          onToggleReaction && reactions.length > 0 ? 'mb-8' : ''
        }`}>
          {!isOwn && isFirstInCluster && (
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-[11px] font-semibold tracking-[0.3px] text-muted">{name}</span>
              {authorLevel && <LevelPill level={authorLevel.level} />}
            </div>
          )}

          <div
            onContextMenu={e => { if (onReply || onToggleReaction) { e.preventDefault(); setMenuOpen(true) } }}
            onTouchStart={startPress}
            onTouchEnd={cancelPress}
            onTouchMove={cancelPress}
            onTouchCancel={cancelPress}
            /* max-w-full, not w-full: a bubble has to hug its text — forcing
               full width would stretch "ok" across the whole column — while a
               card fills it by carrying w-full itself. */
            className="max-w-full"
          >
            {children}
          </div>

          {menuOpen && (onReply || onToggleReaction) && (
            <div
              role="menu"
              className={`absolute bottom-full mb-1 z-30 rounded-control bg-surface border border-border-default shadow-card-elevated overflow-hidden ${
                isOwn ? 'right-0' : 'left-0'
              }`}
            >
              {onToggleReaction && (
                <div className="flex items-center gap-0.5 px-1.5 py-1.5 border-b border-border-subtle">
                  {QUICK_EMOJI.map(emoji => (
                    <button
                      key={emoji}
                      type="button"
                      role="menuitem"
                      onClick={() => { onToggleReaction(emoji); setMenuOpen(false) }}
                      className="w-8 h-8 rounded-pill text-lg leading-none hover:bg-snow transition-colors"
                      aria-label={`React with ${emoji}`}
                    >
                      {emoji}
                    </button>
                  ))}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { setMenuOpen(false); setPickerOpen(true) }}
                    className="w-8 h-8 rounded-pill t-detail text-muted hover:bg-snow transition-colors"
                    aria-label="More reactions"
                  >
                    +
                  </button>
                </div>
              )}
              {onReply && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => { setMenuOpen(false); onReply() }}
                  className="w-full flex items-center gap-2 px-3 py-2 t-body text-ink hover:bg-snow transition-colors whitespace-nowrap"
                >
                  <Icon name="arrow.uturn.left" size={14} weight="semibold" />
                  Reply
                </button>
              )}
            </div>
          )}

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

          {onToggleReaction && reactions.length > 0 && (
            <div className={`absolute -bottom-5 z-10 flex items-center gap-1 ${isOwn ? 'right-2.5' : 'left-2.5'}`}>
              <EmojiReactions
                reactions={reactions}
                onToggleReaction={onToggleReaction}
                pickerSide={isOwn ? 'left' : 'right'}
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
      </div>
    </div>
  )
}
