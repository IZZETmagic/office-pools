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
  isFirstInCluster?: boolean
  isLastInCluster?: boolean
}) {
  const author = members.find(m => m.user_id === message.user_id)
  const authorLevel = memberLevels.get(message.user_id)
  const isOwn = message.user_id === currentUserId
  const name = author?.users.full_name || author?.users.username || 'Unknown'

  return (
    /* The feed's space-y-3 is the baseline for every other item type; messages
       override it in both directions. A new speaker gets room to breathe, a
       continuation sits almost flush against the bubble above. */
    <div className={`relative ${isFirstInCluster ? 'mt-5' : '-mt-2.5'}`}>
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

        <div className={`min-w-0 max-w-[85%] sm:max-w-md flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
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

          <div className={`relative px-3.5 py-2 text-base leading-[22px] font-medium break-words rounded-chip ${
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
