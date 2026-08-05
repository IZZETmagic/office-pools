import { useState, useRef, useMemo, useCallback } from 'react'
import { Icon } from '@/components/ui/Icon'
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
    <div className="relative border-t border-border-default">
      {/* Reply-to bar */}
      {replyingTo && (
        <div className="flex items-center gap-2 px-3 sm:px-4 pt-2 pb-1">
          <div className="w-0.5 h-5 rounded-pill bg-primary-400 shrink-0" />
          <p className="text-xs text-muted truncate flex-1">
            Replying to <span className="font-medium text-ink">{replyAuthor?.users.full_name || replyAuthor?.users.username || 'Unknown'}</span>
          </p>
          <button
            onClick={onClearReply}
            className="p-0.5 text-muted hover:text-ink transition-colors"
            aria-label="Cancel reply"
          >
            <Icon name="xmark" size={14} />
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
            className="flex-1 text-sm bg-snow/15 border border-border-default rounded-control px-3 py-2.5 text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-colors resize-none overflow-y-auto scrollbar-none"
          />
          <button
            type="submit"
            disabled={!newMessage.trim() || sending}
            className="shrink-0 w-9 h-9 flex items-center justify-center rounded-control bg-primary-600 text-white hover:bg-primary-700 active:scale-95 disabled:opacity-40 disabled:pointer-events-none transition-all shadow-sm shadow-primary-600/25"
            aria-label="Send message"
          >
            {sending ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-pill animate-spin" />
            ) : (
              <Icon name="paperplane.fill" size={16} />
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
