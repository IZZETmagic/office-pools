import type { MemberData } from '../types'
import type { MessageWithReactions, PredictionShareMetadata, MemberWithLevel, ReactionCount } from './types'
import { getInitials, formatMessageTime, getLevelPillClasses, getTierBorderClass } from './helpers'
import { EmojiReactions } from './EmojiReactions'

type PredictionShareCardProps = {
  message: MessageWithReactions
  members: MemberData[]
  memberLevels: Map<string, MemberWithLevel>
  currentUserId: string
  reactions: ReactionCount[]
  onToggleReaction: (emoji: string) => void
}

function OutcomeBadge({ outcome }: { outcome: 'exact' | 'correct' | 'miss' }) {
  switch (outcome) {
    case 'exact':
      return (
        <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-md bg-accent-100 dark:bg-accent-900/20 text-accent-700 dark:text-accent-400">
          ★ EXACT
        </span>
      )
    case 'correct':
      return (
        <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-md bg-success-100 dark:bg-success-900/20 text-success-700 dark:text-success-400">
          ✓ CORRECT
        </span>
      )
    case 'miss':
      return (
        <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-md bg-danger-100 dark:bg-danger-900/20 text-danger-700 dark:text-danger-400">
          ✗ MISS
        </span>
      )
  }
}

export function PredictionShareCard({
  message,
  members,
  memberLevels,
  currentUserId,
  reactions,
  onToggleReaction,
}: PredictionShareCardProps) {
  const meta = message.metadata as unknown as PredictionShareMetadata
  if (!meta?.match_id) return null

  const author = members.find(m => m.user_id === message.user_id)
  const authorLevel = memberLevels.get(message.user_id)
  const isExact = meta.outcome === 'exact'

  return (
    <div className="relative overflow-hidden rounded-xl border border-neutral-200 dark:border-border-default bg-surface">
      {/* Gold shimmer bar for exact scores */}
      {isExact && (
        <div className="h-0.5 w-full bg-gradient-to-r from-transparent via-accent-400 to-transparent animate-shimmer" style={{ backgroundSize: '200% auto' }} />
      )}

      <div className="px-3.5 py-3">
        {/* Header: avatar + name + level + outcome badge */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 ${
              authorLevel?.badges?.[0]?.tier ? getTierBorderClass(authorLevel.badges[0].tier) : ''
            }`}>
              {getInitials(author?.users.full_name, author?.users.username)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                  {author?.users.full_name || author?.users.username || 'Unknown'}
                </span>
                {authorLevel && (
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md leading-none ${getLevelPillClasses(authorLevel.level)}`}>
                    Lvl {authorLevel.level}
                  </span>
                )}
              </div>
              <span className="text-[10px] text-neutral-400" suppressHydrationWarning>
                {formatMessageTime(message.created_at)}
              </span>
            </div>
          </div>
          <OutcomeBadge outcome={meta.outcome} />
        </div>

        {/* Match label */}
        <p className="text-[10px] font-medium text-neutral-400 uppercase tracking-wider mb-2">
          Match {meta.match_number} · {meta.stage.replace('_', ' ')}
        </p>

        {/* Score comparison */}
        <div className="flex items-center gap-3 justify-center">
          {/* Home team */}
          <div className="flex items-center gap-2 flex-1 justify-end">
            <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate text-right">
              {meta.home_team_name}
            </span>
            {meta.home_flag_url && (
              <img src={meta.home_flag_url} alt="" className="w-6 h-4 rounded-sm object-cover shrink-0" />
            )}
          </div>

          {/* Scores */}
          <div className="flex flex-col items-center gap-0.5 shrink-0">
            {/* Predicted */}
            <div className="flex items-center gap-1">
              <span className="text-xs text-neutral-400 font-medium w-8 text-right">{meta.predicted_home}</span>
              <span className="text-[10px] text-neutral-300">-</span>
              <span className="text-xs text-neutral-400 font-medium w-8">{meta.predicted_away}</span>
            </div>
            {/* Actual */}
            <div className="flex items-center gap-1">
              <span className={`text-base font-bold w-8 text-right ${
                isExact ? 'text-accent-600 dark:text-accent-400' : 'text-neutral-900 dark:text-neutral-100'
              }`}>
                {meta.actual_home}
              </span>
              <span className="text-xs text-neutral-400 font-bold">-</span>
              <span className={`text-base font-bold w-8 ${
                isExact ? 'text-accent-600 dark:text-accent-400' : 'text-neutral-900 dark:text-neutral-100'
              }`}>
                {meta.actual_away}
              </span>
            </div>
          </div>

          {/* Away team */}
          <div className="flex items-center gap-2 flex-1">
            {meta.away_flag_url && (
              <img src={meta.away_flag_url} alt="" className="w-6 h-4 rounded-sm object-cover shrink-0" />
            )}
            <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">
              {meta.away_team_name}
            </span>
          </div>
        </div>

        {/* Labels */}
        <div className="flex items-center justify-center gap-4 mt-1.5">
          <span className="text-[9px] text-neutral-400 uppercase tracking-wider">Predicted</span>
          <span className="text-[9px] text-neutral-400 uppercase tracking-wider">Actual</span>
        </div>

        {/* Reactions */}
        <div className="mt-2.5 flex justify-start">
          <EmojiReactions reactions={reactions} onToggleReaction={onToggleReaction} />
        </div>
      </div>
    </div>
  )
}
