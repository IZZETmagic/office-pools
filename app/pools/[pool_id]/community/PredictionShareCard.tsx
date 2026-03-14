import type { MemberData } from '../types'
import type { MessageWithReactions, PredictionShareMetadata, MemberWithLevel, ReactionCount } from './types'
import { SharedCardWrapper } from './SharedCardWrapper'

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

function getOutcomeColor(outcome: 'exact' | 'correct' | 'miss') {
  switch (outcome) {
    case 'exact': return 'text-accent-600 dark:text-accent-400'
    case 'correct': return 'text-success-600 dark:text-success-400'
    case 'miss': return 'text-danger-600 dark:text-danger-400'
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

  const isExact = meta.outcome === 'exact'
  const matchName = `${meta.home_team_name} vs ${meta.away_team_name}`

  return (
    <SharedCardWrapper
      userId={message.user_id}
      createdAt={message.created_at}
      members={members}
      memberLevels={memberLevels}
      reactions={reactions}
      onToggleReaction={onToggleReaction}
    >
      {/* Gold shimmer bar for exact scores */}
      {isExact && (
        <div className="h-0.5 w-full bg-gradient-to-r from-transparent via-accent-400 to-transparent animate-shimmer" style={{ backgroundSize: '200% auto' }} />
      )}

      {/* Header row */}
      <div className="flex items-center justify-between px-3.5 pt-3 pb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm">⚽</span>
          <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 truncate">
            {matchName}
          </span>
        </div>
        <OutcomeBadge outcome={meta.outcome} />
      </div>

      {/* Divider */}
      <div className="border-t border-neutral-100 dark:border-border-default/50" />

      {/* Two-column scores */}
      <div className="flex items-stretch">
        {/* My Pick */}
        <div className="flex-1 flex flex-col items-center py-3 px-2">
          <span className="text-[10px] font-medium text-neutral-400 uppercase tracking-wider mb-1.5">
            My Pick
          </span>
          <span className="text-2xl font-bold tabular-nums text-neutral-900 dark:text-neutral-100">
            {meta.predicted_home} - {meta.predicted_away}
          </span>
        </div>

        {/* Vertical divider */}
        <div className="w-px bg-neutral-100 dark:bg-border-default/50 my-2.5" />

        {/* Result */}
        <div className="flex-1 flex flex-col items-center py-3 px-2">
          <span className="text-[10px] font-medium text-neutral-400 uppercase tracking-wider mb-1.5">
            Result
          </span>
          <span className={`text-2xl font-bold tabular-nums ${getOutcomeColor(meta.outcome)}`}>
            {meta.actual_home} - {meta.actual_away}
          </span>
        </div>
      </div>

      {/* Exact match bragging footer */}
      {isExact && (
        <div className="bg-accent-50 dark:bg-accent-900/10 border-t border-accent-100 dark:border-accent-900/20 px-3.5 py-2">
          <p className="text-xs text-accent-700 dark:text-accent-400 text-center">
            🎯 Nailed the exact score!
          </p>
        </div>
      )}
    </SharedCardWrapper>
  )
}
