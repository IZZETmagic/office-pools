'use client'

import { useState, useCallback } from 'react'
import type { ReactionCount } from './types'
import { EmojiPicker } from './EmojiPicker'

type EmojiReactionsProps = {
  reactions: ReactionCount[]
  onToggleReaction: (emoji: string) => void
  /** Chat bubbles add reactions from the hover bar, so the inline + is noise there. */
  showAddButton?: boolean
  pickerSide?: 'left' | 'right'
}

const QUICK_EMOJIS = ['🔥', '😱', '🎯', '😂', '💀']

export function EmojiReactions({ reactions, onToggleReaction, pickerSide = 'right', showAddButton = true }: EmojiReactionsProps) {
  const [showPicker, setShowPicker] = useState(false)

  const handleSelect = useCallback((emoji: string) => {
    onToggleReaction(emoji)
    setShowPicker(false)
  }, [onToggleReaction])

  // Show quick emojis on hover if no reactions yet, otherwise show existing reactions
  const hasReactions = reactions.length > 0

  return (
    <div className="flex items-center gap-1 flex-wrap relative">
      {/* Existing reactions */}
      {reactions.map((r) => (
        <button
          key={r.emoji}
          onClick={() => onToggleReaction(r.emoji)}
          /* RN's pill: px 8 / py 3, a mist fill, and a 2px ring the colour of
             the chat background so it reads as cut out and pops off the bubble
             it overlaps. The ring is the load-bearing part — without it an
             overlapping pill just muddies the bubble's bottom edge. */
          className={`inline-flex items-center gap-1 text-xs px-2 py-[3px] rounded-pill border-2 border-snow transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600/40 ${
            r.reacted_by_me
              ? 'bg-primary-600/[0.14] text-primary-800'
              : 'bg-mist text-muted'
          }`}
        >
          <span>{r.emoji}</span>
          <span className="font-medium tabular-nums">{r.count}</span>
        </button>
      ))}

      {/* Add reaction button */}
      {showAddButton && <div className="relative">
        <button
          onClick={() => setShowPicker(!showPicker)}
          className="inline-flex items-center justify-center w-7 h-7 rounded-pill border border-dashed border-border-default text-muted hover:text-ink hover:border-border-default transition-colors text-xs"
          title="Add reaction"
        >
          +
        </button>
        {showPicker && (
          <EmojiPicker
            onSelect={handleSelect}
            onClose={() => setShowPicker(false)}
            anchor="above"
            side={pickerSide}
          />
        )}
      </div>}
    </div>
  )
}
