import type { MemberData } from '../types'
import type { MessageWithReactions, StandingsDropMetadata, MemberWithLevel, ReactionCount } from './types'
import { Icon } from '@/components/ui/Icon'
import { SharedCardWrapper } from './SharedCardWrapper'

type StandingsDropCardProps = {
  message: MessageWithReactions
  members: MemberData[]
  memberLevels: Map<string, MemberWithLevel>
  currentUserId: string
  reactions: ReactionCount[]
  onToggleReaction: (emoji: string) => void
  /** Passed straight to the message chassis. */
  onReply?: () => void
}

const RANK_MEDALS: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }

export function StandingsDropCard({
  message,
  members,
  memberLevels,
  currentUserId,
  reactions,
  onToggleReaction,
  onReply,
}: StandingsDropCardProps) {
  const meta = message.metadata as unknown as StandingsDropMetadata
  if (!meta?.entries) return null

  return (
    <SharedCardWrapper
      userId={message.user_id}
      createdAt={message.created_at}
      members={members}
      memberLevels={memberLevels}
      reactions={reactions}
      onToggleReaction={onToggleReaction}
      currentUserId={currentUserId}
      onReply={onReply}
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 px-3.5 pt-3 pb-2">
        <Icon name="chart.bar.fill" size={14} weight="semibold" />
        <span className="text-sm font-semibold text-ink">Current Standings</span>
      </div>

      {/* Divider */}
      <div className="border-t border-border-subtle/50" />

      {/* Leaderboard rows */}
      <div className="px-2.5 py-2 space-y-1">
        {meta.entries.map((entry, idx) => {
          const isSender = entry.user_id === message.user_id
          const isViewer = entry.user_id === currentUserId
          const isFirst = entry.rank === 1
          return (
            <div key={`${entry.user_id}-${idx}`}>
              <div
                /* RN tints the sender's row at accent@12% with a hairline border,
                   and leaves every other row bare — the card is that person
                   announcing where they sit, so theirs is the row to find. */
                className={`flex items-center gap-2.5 rounded-chip ${
                  isSender
                    ? 'px-3 py-1.5 bg-accent-400/[0.12] border border-accent-400/40'
                    : 'px-3 py-1'
                }`}
              >
                {/* Rank */}
                <span className="w-6 text-center text-sm shrink-0">
                  {RANK_MEDALS[entry.rank] ?? (
                    <span className="text-xs text-muted font-medium">{entry.rank}</span>
                  )}
                </span>

                {/* Name */}
                <span className={`text-sm flex-1 truncate ${
                  isFirst || isSender ? 'font-bold' : 'font-semibold'
                } ${isSender ? 'text-accent-600' : 'text-ink'}`}>
                  {entry.full_name}
                  {isSender && isViewer && <span className="text-muted font-medium">{'  •  you'}</span>}
                </span>

                {/* Accent for the leader and the sender, muted for everyone else —
                    RN's rule. Ours painted all five primary blue, so nothing in
                    the column carried any meaning. */}
                <span className={`t-num text-[13px] font-bold shrink-0 ${
                  isFirst || isSender ? 'text-accent-600' : 'text-muted'
                }`}>
                  {entry.points.toLocaleString()} pts
                </span>
              </div>

            </div>
          )
        })}
      </div>
    </SharedCardWrapper>
  )
}
