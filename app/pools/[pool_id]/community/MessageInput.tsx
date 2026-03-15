import { useState, useRef, useMemo, useCallback } from 'react'
import type { MemberData } from '../types'
import type { MemberWithLevel, MessageWithReactions } from './types'
import { MentionDropdown } from './ChatMessage'
import { parseMentionUserIds } from './helpers'

type MessageInputProps = {
  poolId: string
  currentUserId: string
  members: MemberData[]
  memberLevels: Map<string, MemberWithLevel>
  replyingTo: MessageWithReactions | null
  onClearReply: () => void
  onSend: (content: string, mentions: string[], replyToId: string | null) => Promise<void>
  onTyping: () => void
}

export function MessageInput({
  poolId,
  currentUserId,
  members,
  memberLevels,
  replyingTo,
  onClearReply,
  onSend,
  onTyping,
}: MessageInputProps) {
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionCursorPos, setMentionCursorPos] = useState(0)
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0)

  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Filtered members for @mention autocomplete
  const filteredMembers = useMemo(() => {
    if (mentionQuery === null) return []
    return members
      .filter(m => {
        const username = m.users.username.toLowerCase()
        const fullName = m.users.full_name.toLowerCase()
        return username.includes(mentionQuery) || fullName.includes(mentionQuery)
      })
      .filter(m => m.user_id !== currentUserId)
      .slice(0, 8)
  }, [mentionQuery, members, currentUserId])

  // Send message
  const handleSend = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault()
    const trimmed = newMessage.trim()
    if (!trimmed || sending) return
    setSending(true)

    const mentionedUserIds = parseMentionUserIds(trimmed, members)
    await onSend(trimmed, mentionedUserIds, replyingTo?.message_id ?? null)

    setNewMessage('')
    setMentionQuery(null)
    onClearReply()
    setSending(false)
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
      inputRef.current.focus()
    }
  }, [newMessage, sending, members, onSend, replyingTo, onClearReply])

  // Handle input change with @mention detection + typing indicator
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setNewMessage(value)
    onTyping()

    // Auto-resize textarea
    const el = e.target
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`

    const cursorPos = e.target.selectionStart ?? value.length
    const textBeforeCursor = value.slice(0, cursorPos)
    const atMatch = textBeforeCursor.match(/(^|\s)@(\w*)$/)

    if (atMatch) {
      setMentionQuery(atMatch[2].toLowerCase())
      setMentionCursorPos(textBeforeCursor.lastIndexOf('@'))
      setSelectedMentionIndex(0)
    } else {
      setMentionQuery(null)
    }
  }, [onTyping])

  // Select a mention from dropdown
  const selectMention = useCallback((member: MemberData) => {
    const before = newMessage.slice(0, mentionCursorPos)
    const afterAtText = newMessage.slice(mentionCursorPos).replace(/@\w*/, '')
    const insertion = `@${member.users.username} `
    setNewMessage(before + insertion + afterAtText)
    setMentionQuery(null)
    inputRef.current?.focus()
  }, [newMessage, mentionCursorPos])

  // Keyboard navigation for mention dropdown
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionQuery !== null && filteredMembers.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedMentionIndex(prev => Math.min(prev + 1, filteredMembers.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedMentionIndex(prev => Math.max(prev - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        selectMention(filteredMembers[selectedMentionIndex])
        return
      } else if (e.key === 'Escape') {
        setMentionQuery(null)
        return
      }
    }

    if (e.key === 'Enter' && mentionQuery === null) {
      e.preventDefault()
      handleSend()
    }

    if (e.key === 'Escape' && replyingTo) {
      onClearReply()
    }
  }, [mentionQuery, filteredMembers, selectedMentionIndex, selectMention, handleSend, replyingTo, onClearReply])

  const replyAuthor = replyingTo
    ? members.find(m => m.user_id === replyingTo.user_id)
    : null

  return (
    <div className="relative border-t border-neutral-200 dark:border-border-default">
      {/* Reply-to bar */}
      {replyingTo && (
        <div className="flex items-center gap-2 px-3 sm:px-4 pt-2 pb-1">
          <div className="w-0.5 h-5 rounded-full bg-primary-400 shrink-0" />
          <p className="text-xs text-neutral-500 truncate flex-1">
            Replying to <span className="font-medium text-neutral-700 dark:text-neutral-300">{replyAuthor?.users.full_name || replyAuthor?.users.username || 'Unknown'}</span>
          </p>
          <button
            onClick={onClearReply}
            className="p-0.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
            aria-label="Cancel reply"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Mention dropdown */}
      <div className="relative px-3 sm:px-4 py-3">
        {mentionQuery !== null && filteredMembers.length > 0 && (
          <MentionDropdown
            members={filteredMembers}
            memberLevels={memberLevels}
            selectedIndex={selectedMentionIndex}
            onSelect={selectMention}
          />
        )}

        <form onSubmit={handleSend} className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={newMessage}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Message the pool..."
            maxLength={2000}
            rows={1}
            className="flex-1 text-sm bg-neutral-50 dark:bg-neutral-800/15 border border-neutral-200 dark:border-border-default rounded-xl px-3 py-2.5 text-neutral-900 dark:text-neutral-700 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-colors resize-none overflow-y-auto scrollbar-none"
          />
          <button
            type="submit"
            disabled={!newMessage.trim() || sending}
            className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl bg-primary-600 text-white hover:bg-primary-700 active:scale-95 disabled:opacity-40 disabled:pointer-events-none transition-all shadow-sm shadow-primary-600/25"
            aria-label="Send message"
          >
            {sending ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
              </svg>
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
