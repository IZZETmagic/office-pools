'use client'

import { useMemo } from 'react'
import { Badge } from '@/components/ui/Badge'
import type { MemberData, PlayerScoreData, BonusScoreData } from './types'

// =============================================
// TYPES & CONSTANTS
// =============================================

type PointsBreakdownModalProps = {
  member: MemberData
  playerScore: PlayerScoreData | null
  bonusScores: BonusScoreData[]
  onClose: () => void
}

const CATEGORY_ORDER = ['group_standings', 'qualification', 'bracket', 'tournament'] as const

const CATEGORY_CONFIG: Record<string, { label: string; bgClass: string; textClass: string }> = {
  group_standings: { label: 'Group Standings', bgClass: 'bg-primary-100', textClass: 'text-primary-700' },
  qualification: { label: 'Overall Qualification', bgClass: 'bg-accent-100', textClass: 'text-accent-700' },
  bracket: { label: 'Bracket & Match Winners', bgClass: 'bg-warning-100', textClass: 'text-warning-700' },
  tournament: { label: 'Tournament Podium', bgClass: 'bg-accent-100', textClass: 'text-accent-700' },
}

// =============================================
// COMPONENT
// =============================================

export function PointsBreakdownModal({
  member,
  playerScore,
  bonusScores,
  onClose,
}: PointsBreakdownModalProps) {
  const matchPoints = playerScore?.match_points ?? member.total_points ?? 0
  const bonusPoints = playerScore?.bonus_points ?? 0
  const totalPoints = playerScore?.total_points ?? member.total_points ?? 0

  // Group bonus scores by category
  const groupedBonuses = useMemo(() => {
    const grouped = new Map<string, BonusScoreData[]>()
    for (const bs of bonusScores) {
      const existing = grouped.get(bs.bonus_category) || []
      existing.push(bs)
      grouped.set(bs.bonus_category, existing)
    }
    return grouped
  }, [bonusScores])

  // Calculate subtotals per category
  const categorySubtotals = useMemo(() => {
    const subtotals = new Map<string, number>()
    for (const [category, entries] of groupedBonuses) {
      subtotals.set(category, entries.reduce((sum, e) => sum + e.points_earned, 0))
    }
    return subtotals
  }, [groupedBonuses])

  const rank = member.current_rank
  const playerName = member.users?.full_name || member.users?.username || 'Unknown Player'
  const username = member.users?.username

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="bg-white rounded-t-xl sm:rounded-xl shadow-xl sm:max-w-lg w-full sm:mx-4 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 pt-4 sm:pt-5 pb-3 border-b border-neutral-100 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {rank && (
              <span className="text-2xl font-bold text-primary-600 flex-shrink-0 bg-primary-50 rounded-lg px-2.5 py-1">#{rank}</span>
            )}
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-neutral-900 truncate">{playerName}</h2>
              {username && member.users?.full_name && (
                <span className="text-sm text-neutral-500">@{username}</span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 p-1.5 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto px-4 sm:px-6 py-4 sm:py-5 space-y-5">
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <div className="bg-primary-50 rounded-lg p-3 text-center">
              <div className="text-[11px] sm:text-xs font-medium text-primary-600 uppercase tracking-wide">Match</div>
              <div className="text-xl sm:text-2xl font-bold text-primary-700 mt-1">{matchPoints}</div>
            </div>
            <div className="bg-success-50 rounded-lg p-3 text-center">
              <div className="text-[11px] sm:text-xs font-medium text-success-600 uppercase tracking-wide">Bonus</div>
              <div className="text-xl sm:text-2xl font-bold text-success-700 mt-1">{bonusPoints}</div>
            </div>
            <div className="bg-neutral-50 rounded-lg p-3 text-center border-2 border-neutral-200">
              <div className="text-[11px] sm:text-xs font-medium text-neutral-600 uppercase tracking-wide">Total</div>
              <div className="text-xl sm:text-2xl font-bold text-neutral-900 mt-1">{totalPoints}</div>
            </div>
          </div>

          {/* Formula display */}
          <div className="text-center text-sm text-neutral-500">
            <span className="text-primary-600 font-medium">{matchPoints}</span>
            {' '}match pts
            {' + '}
            <span className="text-success-600 font-medium">{bonusPoints}</span>
            {' '}bonus pts
            {' = '}
            <span className="text-neutral-900 font-bold">{totalPoints}</span>
            {' '}total
          </div>

          {/* Bonus Points Breakdown */}
          <div>
            <h3 className="text-sm font-semibold text-neutral-900 uppercase tracking-wider mb-3">
              Bonus Points Breakdown
            </h3>

            {bonusScores.length === 0 ? (
              <div className="text-center py-6 bg-neutral-50 rounded-lg">
                <div className="text-neutral-400 text-sm">No bonus points earned yet</div>
                <div className="text-neutral-400 text-xs mt-1">
                  Bonus points are calculated as tournament stages complete
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {CATEGORY_ORDER.map((category) => {
                  const entries = groupedBonuses.get(category)
                  if (!entries || entries.length === 0) return null
                  const subtotal = categorySubtotals.get(category) ?? 0
                  const config = CATEGORY_CONFIG[category] ?? {
                    label: category,
                    bgClass: 'bg-neutral-100',
                    textClass: 'text-neutral-700',
                  }

                  return (
                    <div key={category} className="border border-neutral-200 rounded-lg overflow-hidden">
                      {/* Category header */}
                      <div className={`flex items-center justify-between px-3 py-2 ${config.bgClass}`}>
                        <span className={`text-sm font-semibold ${config.textClass}`}>
                          {config.label}
                        </span>
                        <span className={`text-sm font-bold ${config.textClass}`}>
                          {subtotal} pts
                        </span>
                      </div>

                      {/* Individual entries */}
                      <div className="divide-y divide-neutral-100">
                        {entries.map((entry, i) => (
                          <div
                            key={`${entry.bonus_type}-${entry.related_group_letter}-${entry.related_match_id}-${i}`}
                            className="flex items-start justify-between px-3 py-2.5 text-sm"
                          >
                            <span className="text-neutral-700 pr-3 leading-snug">
                              {entry.description}
                            </span>
                            <span className="text-neutral-900 font-semibold flex-shrink-0">
                              +{entry.points_earned}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
