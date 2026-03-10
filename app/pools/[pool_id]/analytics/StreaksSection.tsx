'use client'

import type { StreakData } from './analyticsHelpers'

// =============================================
// CONSTANTS
// =============================================

const DOT_COLORS: Record<string, string> = {
  exact: 'bg-success-500',
  winner_gd: 'bg-primary-500',
  winner: 'bg-warning-500',
  miss: 'bg-neutral-300 dark:bg-neutral-600',
}

const DOT_LABELS: Record<string, string> = {
  exact: 'Exact',
  winner_gd: 'W+GD',
  winner: 'Winner',
  miss: 'Miss',
}

// =============================================
// COMPONENT
// =============================================

type StreaksSectionProps = {
  streaks: StreakData
}

export function StreaksSection({ streaks }: StreaksSectionProps) {
  const { currentStreak, longestHotStreak, longestColdStreak, timeline } = streaks

  if (timeline.length === 0) {
    return null
  }

  return (
    <div className="space-y-4">
      {/* Section Header */}
      <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">
        Hot & Cold Streaks
      </h3>

      {/* Streak Stats */}
      <div className="grid grid-cols-3 gap-3">
        {/* Current Streak */}
        <div className="bg-surface rounded-xl shadow dark:shadow-none dark:border dark:border-border-default p-4 text-center">
          <div className="text-2xl mb-1">
            {currentStreak.type === 'hot' ? (
              <span className="text-3xl font-bold text-success-600 dark:text-success-400">
                {currentStreak.length}
              </span>
            ) : currentStreak.type === 'cold' ? (
              <span className="text-3xl font-bold text-danger-600 dark:text-danger-400">
                {currentStreak.length}
              </span>
            ) : (
              <span className="text-3xl font-bold text-neutral-400">-</span>
            )}
          </div>
          <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase">
            {currentStreak.type === 'hot'
              ? 'Current Hot Streak'
              : currentStreak.type === 'cold'
                ? 'Current Cold Streak'
                : 'No Streak'}
          </p>
        </div>

        {/* Best Hot Streak */}
        <div className="bg-surface rounded-xl shadow dark:shadow-none dark:border dark:border-border-default p-4 text-center">
          <p className="text-3xl font-bold text-success-600 dark:text-success-400 mb-1">
            {longestHotStreak}
          </p>
          <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase">
            Best Hot Streak
          </p>
        </div>

        {/* Worst Cold Streak */}
        <div className="bg-surface rounded-xl shadow dark:shadow-none dark:border dark:border-border-default p-4 text-center">
          <p className="text-3xl font-bold text-danger-600 dark:text-danger-400 mb-1">
            {longestColdStreak}
          </p>
          <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase">
            Worst Cold Streak
          </p>
        </div>
      </div>

      {/* Timeline */}
      <div className="bg-surface rounded-xl shadow dark:shadow-none dark:border dark:border-border-default overflow-hidden">
        <div className="px-4 sm:px-5 py-3 bg-neutral-100 dark:bg-neutral-200 border-b border-neutral-200 dark:border-neutral-700">
          <h4 className="text-sm font-semibold text-neutral-900 dark:text-white">Match Timeline</h4>
        </div>
        <div className="p-4 sm:p-5">
          <div className="overflow-x-auto pb-2">
            <div className="flex items-center gap-1 min-w-max">
              {timeline.map((entry, idx) => (
                <div
                  key={idx}
                  className="group relative flex flex-col items-center"
                >
                  {/* Tooltip on hover */}
                  <div className="absolute bottom-full mb-1 hidden group-hover:block z-10">
                    <div className="bg-neutral-800 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap">
                      #{entry.matchNumber} - {DOT_LABELS[entry.type]}
                    </div>
                  </div>
                  <div
                    className={`w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full ${DOT_COLORS[entry.type]} transition-transform hover:scale-125 cursor-default`}
                    title={`Match #${entry.matchNumber}: ${DOT_LABELS[entry.type]}`}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Timeline Legend */}
          <div className="flex flex-wrap gap-4 mt-3 pt-3 border-t border-neutral-100 dark:border-neutral-800">
            {Object.entries(DOT_LABELS).map(([key, label]) => (
              <div key={key} className="flex items-center gap-1.5">
                <div className={`w-2.5 h-2.5 rounded-full ${DOT_COLORS[key]}`} />
                <span className="text-xs text-neutral-600 dark:text-neutral-400">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
