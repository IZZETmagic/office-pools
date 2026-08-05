import type { MemberData } from '../types'
import type { MessageWithReactions, ReplyPreview, MemberWithLevel, ReactionCount } from './types'
import { getInitials, formatMessageTime, renderMessageContent, getLevelPillClasses, getRankTitle } from './helpers'

// =====================
// LEVEL PILL
// =====================

function LevelPill({ level }: { level: number }) {
  return (
    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded leading-none whitespace-nowrap ${getLevelPillClasses(level)}`}>
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

function ReplyHeader({ reply, isOwn }: { reply: ReplyPreview; isOwn: boolean }) {
  return (
    <div className={`flex items-stretch gap-0 mb-0 ${isOwn ? 'justify-end' : ''}`}>
      <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-t-chip ${
        isOwn
          ? 'bg-primary-700/50'
          : 'bg-mist/80'
      }`}>
        <div className="w-0.5 h-4 rounded-pill bg-primary-400 shrink-0" />
        <p className={`text-[10px] truncate max-w-[200px] ${
          isOwn ? 'text-primary-200' : 'text-muted'
        }`}>
          <span className="font-medium">↩ {reply.author_name}:</span> {reply.content}
        </p>
      </div>
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
}: {
  message: MessageWithReactions
  members: MemberData[]
  memberLevels: Map<string, MemberWithLevel>
  currentUserId: string
  replyPreview?: ReplyPreview | null
  reactions?: ReactionCount[]
  onToggleReaction?: (emoji: string) => void
}) {
  const author = members.find(m => m.user_id === message.user_id)
  const authorLevel = memberLevels.get(message.user_id)
  const isOwn = message.user_id === currentUserId

  return (
    <div className="relative">
      <div className={`flex gap-2.5 items-end ${isOwn ? 'flex-row-reverse' : ''}`}>
        {/* Avatar — hidden for own messages */}
        {!isOwn && (
          <div className="shrink-0 w-[30px] h-[30px] rounded-pill flex items-center justify-center text-[10px] font-bold bg-primary-100 dark:bg-primary-600/15 text-primary-700 dark:text-primary-600">
            {getInitials(author?.users.full_name, author?.users.username)}
          </div>
        )}

        <div className={`max-w-[78%] flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
          {/* Name + level — hidden for own messages */}
          {!isOwn && (
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-xs font-semibold text-ink">
                {author?.users.full_name || author?.users.username || 'Unknown'}
              </span>
              {authorLevel && <LevelPill level={authorLevel.level} />}
            </div>
          )}

          {/* Reply preview — connects to bubble */}
          {replyPreview && (
            <ReplyHeader reply={replyPreview} isOwn={isOwn} />
          )}

          {/* Message bubble */}
          <div className={`px-3 py-2 text-sm leading-relaxed ${
            isOwn
              ? `bg-primary-600 text-white ${replyPreview ? 'rounded-b-card rounded-tl-card rounded-tr-sm' : 'rounded-card rounded-br-sm'}`
              : `bg-surface text-ink border border-border-default ${replyPreview ? 'rounded-b-card rounded-tr-card rounded-tl-sm' : 'rounded-card rounded-bl-sm'}`
          }`}>
            {renderMessageContent(message.content, members, isOwn)}
          </div>

          {/* Timestamp below bubble */}
          <span className={`text-[10px] text-muted mt-0.5 ${isOwn ? 'text-right' : ''}`} suppressHydrationWarning>
            {formatMessageTime(message.created_at)}
          </span>
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
