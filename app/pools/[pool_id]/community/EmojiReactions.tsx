'use client'

import { useState, useCallback } from 'react'
import type { ReactionCount } from './types'
import { EmojiPicker } from './EmojiPicker'

type EmojiReactionsProps = {
  reactions: ReactionCount[]
  onToggleReaction: (emoji: string) => void
  pickerSide?: 'left' | 'right'
}

const QUICK_EMOJIS = ['🔥', '😱', '🎯', '😂', '💀']

export function EmojiReactions({ reactions, onToggleReaction, pickerSide = 'right' }: EmojiReactionsProps) {
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
          className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-pill border transition-colors ${
            r.reacted_by_me
              ? 'bg-primary-50 dark:bg-primary-900/15 border-primary-300 dark:border-primary-700 text-primary-800'
              : 'bg-snow border-border-default text-muted hover:border-border-default'
          }`}
        >
          <span>{r.emoji}</span>
          <span className="font-medium tabular-nums">{r.count}</span>
        </button>
      ))}

      {/* Add reaction button */}
      <div className="relative">
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
      </div>
    </div>
  )
}
