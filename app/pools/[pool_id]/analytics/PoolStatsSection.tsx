'use client'

import dynamic from 'next/dynamic'
import type { PoolWideStats } from './analyticsHelpers'

// Dynamic imports for Recharts
const BarChart = dynamic(() => import('recharts').then(m => m.BarChart), { ssr: false })
const Bar = dynamic(() => import('recharts').then(m => m.Bar), { ssr: false })
const XAxis = dynamic(() => import('recharts').then(m => m.XAxis), { ssr: false })
const YAxis = dynamic(() => import('recharts').then(m => m.YAxis), { ssr: false })
const Tooltip = dynamic(() => import('recharts').then(m => m.Tooltip), { ssr: false })
const ResponsiveContainer = dynamic(() => import('recharts').then(m => m.ResponsiveContainer), { ssr: false })
const CartesianGrid = dynamic(() => import('recharts').then(m => m.CartesianGrid), { ssr: false })
const Cell = dynamic(() => import('recharts').then(m => m.Cell), { ssr: false })

// =============================================
// CONSTANTS
// =============================================

const TOOLTIP_STYLE = {
  background: '#1f2937',
  border: 'none',
  borderRadius: '8px',
  fontSize: '12px',
  color: '#fff',
}

const STAGE_LABELS: Record<string, string> = {
  group: 'Group',
  round_32: 'R32',
  round_16: 'R16',
  quarter_final: 'QF',
  semi_final: 'SF',
  third_place: '3rd',
  final: 'Final',
}

// =============================================
// COMPONENT
// =============================================

type PoolStatsSectionProps = {
  poolStats: PoolWideStats
}

export function PoolStatsSection({ poolStats }: PoolStatsSectionProps) {
  const { mostPredictable, leastPredictable, avgPoolAccuracy, totalCompletedMatches, totalEntries } = poolStats

  if (totalCompletedMatches === 0) return null

  // Chart data for top 10 (most predictable + least predictable merged & sorted)
  const allMatches = [...mostPredictable, ...leastPredictable]
  // Deduplicate by matchId
  const seen = new Set<string>()
  const unique = allMatches.filter(m => {
    if (seen.has(m.matchId)) return false
    seen.add(m.matchId)
    return true
  })
  const chartData = unique
    .sort((a, b) => b.hitRate - a.hitRate)
    .map(m => ({
      name: `#${m.matchNumber}`,
      fullName: `${m.homeTeamName} vs ${m.awayTeamName}`,
      hitRate: Math.round(m.hitRate * 100),
      score: m.actualScore,
    }))

  return (
    <div className="space-y-4">
      {/* Section Header */}
      <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">
        Pool-Wide Stats
      </h3>

      {/* Summary Row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-surface rounded-xl shadow dark:shadow-none dark:border dark:border-border-default p-4 text-center">
          <p className="text-3xl font-bold text-neutral-900 dark:text-white">
            {Math.round(avgPoolAccuracy * 100)}%
          </p>
          <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase mt-1">
            Avg Pool Accuracy
          </p>
        </div>
        <div className="bg-surface rounded-xl shadow dark:shadow-none dark:border dark:border-border-default p-4 text-center">
          <p className="text-3xl font-bold text-neutral-900 dark:text-white">
            {totalCompletedMatches}
          </p>
          <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase mt-1">
            Completed Matches
          </p>
        </div>
        <div className="bg-surface rounded-xl shadow dark:shadow-none dark:border dark:border-border-default p-4 text-center">
          <p className="text-3xl font-bold text-neutral-900 dark:text-white">
            {totalEntries}
          </p>
          <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase mt-1">
            Submitted Entries
          </p>
        </div>
      </div>

      {/* Predictability Chart */}
      {chartData.length > 0 && (
        <div className="bg-surface rounded-xl shadow dark:shadow-none dark:border dark:border-border-default overflow-hidden">
          <div className="px-4 sm:px-5 py-3 bg-neutral-100 dark:bg-neutral-200 border-b border-neutral-200 dark:border-neutral-700">
            <h4 className="text-sm font-semibold text-neutral-900 dark:text-white">Match Predictability</h4>
          </div>
          <div className="p-4 sm:p-5">
            <div className="h-[240px] sm:h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" barSize={16}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" opacity={0.5} />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: '#9ca3af' }} unit="%" />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#9ca3af' }} width={40} />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(value: any, _name: any, props: any) => [
                      `${value}% correct result — ${props.payload.fullName} (${props.payload.score})`,
                      'Accuracy',
                    ]}
                  />
                  <Bar dataKey="hitRate" name="% Correct">
                    {chartData.map((entry, idx) => (
                      <Cell
                        key={idx}
                        fill={entry.hitRate >= 70 ? '#10b981' : entry.hitRate >= 40 ? '#f59e0b' : '#ef4444'}
                        radius={[0, 4, 4, 0] as any}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Two-Column: Most Predictable + Biggest Upsets */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Most Predictable */}
        <div className="bg-surface rounded-xl shadow dark:shadow-none dark:border dark:border-border-default overflow-hidden">
          <div className="px-4 sm:px-5 py-3 bg-neutral-100 dark:bg-neutral-200 border-b border-neutral-200 dark:border-neutral-700">
            <h4 className="text-sm font-semibold text-neutral-900 dark:text-white">Most Predictable</h4>
          </div>
          <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {mostPredictable.map((m, idx) => (
              <div key={m.matchId} className="px-4 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-bold text-success-600 dark:text-success-400 w-5">
                    {idx + 1}.
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-neutral-900 dark:text-white truncate">
                      {m.homeTeamName} vs {m.awayTeamName}
                    </p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      {STAGE_LABELS[m.stage] ?? m.stage} &middot; {m.actualScore}
                    </p>
                  </div>
                </div>
                <div className="text-right ml-2">
                  <p className="text-sm font-bold text-success-600 dark:text-success-400">
                    {Math.round(m.hitRate * 100)}%
                  </p>
                  <p className="text-[10px] text-neutral-500 dark:text-neutral-400">
                    {m.correctCount}/{m.totalPredictions}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Biggest Upsets */}
        <div className="bg-surface rounded-xl shadow dark:shadow-none dark:border dark:border-border-default overflow-hidden">
          <div className="px-4 sm:px-5 py-3 bg-neutral-100 dark:bg-neutral-200 border-b border-neutral-200 dark:border-neutral-700">
            <h4 className="text-sm font-semibold text-neutral-900 dark:text-white">Biggest Upsets</h4>
          </div>
          <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {leastPredictable.map((m, idx) => (
              <div key={m.matchId} className="px-4 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-bold text-danger-600 dark:text-danger-400 w-5">
                    {idx + 1}.
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-neutral-900 dark:text-white truncate">
                      {m.homeTeamName} vs {m.awayTeamName}
                    </p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      {STAGE_LABELS[m.stage] ?? m.stage} &middot; {m.actualScore}
                    </p>
                  </div>
                </div>
                <div className="text-right ml-2">
                  <p className="text-sm font-bold text-danger-600 dark:text-danger-400">
                    {Math.round(m.hitRate * 100)}%
                  </p>
                  <p className="text-[10px] text-neutral-500 dark:text-neutral-400">
                    {m.correctCount}/{m.totalPredictions}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
