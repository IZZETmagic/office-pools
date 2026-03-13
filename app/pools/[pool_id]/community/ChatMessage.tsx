import type { MemberData } from '../types'
import type { MessageWithReactions, ReplyPreview, MemberWithLevel, ReactionCount } from './types'
import { getInitials, formatMessageTime, renderMessageContent, getLevelPillClasses } from './helpers'
import { EmojiReactions } from './EmojiReactions'

// =====================
// LEVEL PILL
// =====================

function LevelPill({ level }: { level: number }) {
  return (
    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md leading-none ${getLevelPillClasses(level)}`}>
      Lvl {level}
    </span>
  )
}

// =====================
// DAY HEADER
// =====================

export function DayHeader({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3 my-4">
      <div className="flex-1 border-t border-neutral-200 dark:border-border-default" />
      <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 shrink-0">
        {text}
      </span>
      <div className="flex-1 border-t border-neutral-200 dark:border-border-default" />
    </div>
  )
}

// =====================
// REPLY PREVIEW HEADER
// =====================

function ReplyHeader({ reply, isOwn }: { reply: ReplyPreview; isOwn: boolean }) {
  return (
    <div className={`flex items-center gap-1.5 mb-1 ${isOwn ? 'flex-row-reverse' : ''}`}>
      <div className={`w-0.5 h-4 rounded-full bg-primary-400 shrink-0`} />
      <p className="text-[10px] text-neutral-400 truncate max-w-[200px]">
        <span className="font-medium">↩ {reply.author_name}:</span> {reply.content}
      </p>
    </div>
  )
}

// =====================
// CHAT MESSAGE
// =====================

export function ChatMessage({
  message,
  members,
  memberLevels,
  currentUserId,
  replyPreview,
  reactions,
  onToggleReaction,
}: {
  message: MessageWithReactions
  members: MemberData[]
  memberLevels: Map<string, MemberWithLevel>
  currentUserId: string
  replyPreview?: ReplyPreview | null
  reactions: ReactionCount[]
  onToggleReaction: (emoji: string) => void
}) {
  const author = members.find(m => m.user_id === message.user_id)
  const authorLevel = memberLevels.get(message.user_id)
  const isOwn = message.user_id === currentUserId

  return (
    <div className="relative">
      <div className={`flex gap-2.5 items-end ${isOwn ? 'flex-row-reverse' : ''}`}>
        {/* Avatar — hidden for own messages */}
        {!isOwn && (
          <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300`}>
            {getInitials(author?.users.full_name, author?.users.username)}
          </div>
        )}

        <div className={`max-w-[75%] ${isOwn ? 'items-end' : ''}`}>
          {/* Name + level + time — hidden for own messages */}
          {!isOwn && (
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                {author?.users.full_name || author?.users.username || 'Unknown'}
              </span>
              {authorLevel && <LevelPill level={authorLevel.level} />}
              <span className="text-[10px] text-neutral-400" suppressHydrationWarning>
                {formatMessageTime(message.created_at)}
              </span>
            </div>
          )}

          {/* Own message: just timestamp */}
          {isOwn && (
            <div className="flex justify-end mb-0.5">
              <span className="text-[10px] text-neutral-400" suppressHydrationWarning>
                {formatMessageTime(message.created_at)}
              </span>
            </div>
          )}

          {/* Reply preview */}
          {replyPreview && (
            <ReplyHeader reply={replyPreview} isOwn={isOwn} />
          )}

          {/* Message bubble */}
          <div className={`px-3 py-2 text-sm leading-relaxed ${
            isOwn
              ? 'bg-primary-600 text-white rounded-2xl rounded-br-md'
              : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 rounded-2xl rounded-bl-md'
          }`}>
            {renderMessageContent(message.content, members)}
          </div>
        </div>

        {/* Emoji reactions — beside the message */}
        <div className="shrink-0 self-end mb-0.5">
          <EmojiReactions
            reactions={reactions}
            onToggleReaction={onToggleReaction}
            pickerSide={isOwn ? 'left' : 'right'}
          />
        </div>
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
    <div className="absolute bottom-full left-0 right-0 mb-1 bg-surface border border-neutral-200 dark:border-border-default rounded-xl shadow-lg max-h-48 overflow-y-auto z-10">
      {members.map((member, i) => {
        const level = memberLevels.get(member.user_id)
        return (
          <button
            key={member.user_id}
            onClick={() => onSelect(member)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors ${
              i === selectedIndex ? 'bg-neutral-50 dark:bg-neutral-800' : ''
            } ${i === 0 ? 'rounded-t-xl' : ''} ${i === members.length - 1 ? 'rounded-b-xl' : ''}`}
          >
            <div className="shrink-0 w-6 h-6 rounded-full bg-neutral-100 dark:bg-neutral-700 flex items-center justify-center text-[9px] font-bold text-neutral-600 dark:text-neutral-300">
              {getInitials(member.users.full_name, member.users.username)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">{member.users.full_name}</p>
                {level && <LevelPill level={level.level} />}
              </div>
              <p className="text-[10px] text-neutral-400 truncate">@{member.users.username}</p>
            </div>
          </button>
        )
      })}
    </div>
  )
}
