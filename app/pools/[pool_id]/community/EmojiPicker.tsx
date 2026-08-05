'use client'

import { useState, useRef, useEffect } from 'react'

type EmojiPickerProps = {
  onSelect: (emoji: string) => void
  onClose: () => void
  anchor?: 'above' | 'below'
  side?: 'left' | 'right'
}

const EMOJI_CATEGORIES = [
  {
    name: 'Smileys',
    emojis: ['😀', '😂', '🤣', '😊', '😍', '🥰', '😎', '🤩', '😏', '🤔', '😮', '😱', '🥳', '😤', '😭', '💀', '🤯', '😈', '🤡', '👻'],
  },
  {
    name: 'Gestures',
    emojis: ['👍', '👎', '👏', '🙌', '🤝', '✊', '🤞', '💪', '🫡', '🤷', '🙏', '👀', '🫣', '🫠', '🤌', '✌️', '🤙', '👋', '🖐️', '👊'],
  },
  {
    name: 'Hearts',
    emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💔', '❤️‍🔥', '💯', '✨', '⭐', '🌟', '💫', '🔥', '💥', '🎉', '🎊', '🏆'],
  },
  {
    name: 'Sports',
    emojis: ['⚽', '🏟️', '🥅', '🏆', '🥇', '🥈', '🥉', '🎯', '🏃', '⚡', '🔔', '📊', '📈', '🎪', '🎟️', '🏅', '🤺', '🦁', '🐐', '👑'],
  },
  {
    name: 'Objects',
    emojis: ['📌', '🔮', '🎰', '🎲', '🧊', '💎', '🛡️', '⚔️', '🚀', '💣', '🪄', '🎭', '🎬', '📢', '💡', '🔑', '🗝️', '⏰', '🧨', '🪙'],
  },
]

export function EmojiPicker({ onSelect, onClose, anchor = 'above', side = 'right' }: EmojiPickerProps) {
  const [activeCategory, setActiveCategory] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      ref={ref}
      className={`absolute ${anchor === 'above' ? 'bottom-full mb-2' : 'top-full mt-2'} ${side === 'left' ? 'right-0' : 'left-0'} z-30 w-72 bg-surface border border-border-default rounded-control shadow-lg overflow-hidden`}
    >
      {/* Category tabs */}
      <div className="flex items-center border-b border-border-subtle px-2 py-1.5 gap-1 overflow-x-auto scrollbar-hide">
        {EMOJI_CATEGORIES.map((cat, i) => (
          <button
            key={cat.name}
            onClick={() => setActiveCategory(i)}
            className={`text-[10px] font-medium px-2 py-1 rounded-md whitespace-nowrap transition-colors ${
              i === activeCategory
                ? 'bg-primary-100 dark:bg-primary-900/20 text-primary-800'
                : 'text-muted hover:bg-mist'
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Emoji grid */}
      <div className="p-2 max-h-48 overflow-y-auto">
        <div className="grid grid-cols-8 gap-0.5">
          {EMOJI_CATEGORIES[activeCategory].emojis.map((emoji) => (
            <button
              key={emoji}
              onClick={() => {
                onSelect(emoji)
                onClose()
              }}
              className="w-8 h-8 flex items-center justify-center text-lg rounded-md hover:bg-mist active:scale-90 transition-all"
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
