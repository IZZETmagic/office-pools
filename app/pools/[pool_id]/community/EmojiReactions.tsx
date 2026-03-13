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
          className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border transition-colors ${
            r.reacted_by_me
              ? 'bg-primary-50 dark:bg-primary-900/15 border-primary-300 dark:border-primary-700 text-primary-700 dark:text-primary-400'
              : 'bg-neutral-50 dark:bg-neutral-800/50 border-neutral-200 dark:border-border-default text-neutral-600 dark:text-neutral-400 hover:border-neutral-300'
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
          className="inline-flex items-center justify-center w-7 h-7 rounded-full border border-dashed border-neutral-200 dark:border-neutral-700 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 hover:border-neutral-300 transition-colors text-xs"
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
