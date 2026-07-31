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
  background: 'var(--neutral-800)',
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

/** PoolStatColumn from the app: a black numeral over a muted label. */
function PoolStatColumn({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 flex flex-col items-center gap-0.5">
      <span className="t-num font-black text-2xl leading-7 text-ink">{value}</span>
      <span className="text-[11px] font-medium text-muted text-center">{label}</span>
    </div>
  )
}

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
      {/* PoolStatsSection in the app: one card with the header inside and three
          columns beneath it, rather than three separate cards. Three cards read as
          three unrelated facts; one card reads as a summary of this pool. */}
      <div className="bg-surface rounded-card shadow-card dark:shadow-none dark:border dark:border-border-default overflow-hidden">
        <div className="px-4 pt-4 pb-3">
          <h3 className="t-section-header text-ink">Pool-Wide Stats</h3>
        </div>
        <div className="flex px-4 pb-4">
          <PoolStatColumn label="Avg Pool Accuracy" value={`${Math.round(avgPoolAccuracy * 100)}%`} />
          <PoolStatColumn label="Competitors" value={`${totalEntries}`} />
          <PoolStatColumn label="Matches Scored" value={`${totalCompletedMatches}`} />
        </div>
      </div>

      {/* Predictability Chart */}
      {chartData.length > 0 && (
        <div className="bg-surface rounded-card shadow-card dark:shadow-none dark:border dark:border-border-default overflow-hidden">
          <div className="px-4 sm:px-5 pt-3 pb-2">
            <h4 className="t-card-title text-ink">Match Predictability</h4>
          </div>
          <div className="p-4 sm:p-5">
            <div className="h-[240px] sm:h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" barSize={16}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--neutral-200)" opacity={0.5} />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: 'var(--neutral-400)' }} unit="%" />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: 'var(--neutral-400)' }} width={40} />
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
                        fill={entry.hitRate >= 70 ? 'var(--success-600)' : entry.hitRate >= 40 ? 'var(--warning-500)' : 'var(--danger-600)'}
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
        <div className="bg-surface rounded-card shadow-card dark:shadow-none dark:border dark:border-border-default overflow-hidden">
          <div className="px-4 sm:px-5 pt-3 pb-2">
            <h4 className="t-card-title text-ink">Most Predictable</h4>
          </div>
          <div className="divide-y divide-border-subtle">
            {mostPredictable.map((m, idx) => (
              <div key={m.matchId} className="px-4 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-bold text-success-600 dark:text-success-400 w-5">
                    {idx + 1}.
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink truncate">
                      {m.homeTeamName} vs {m.awayTeamName}
                    </p>
                    <p className="text-xs text-muted">
                      {STAGE_LABELS[m.stage] ?? m.stage} &middot; {m.actualScore}
                    </p>
                  </div>
                </div>
                <div className="text-right ml-2">
                  <p className="text-sm font-bold text-success-600 dark:text-success-400">
                    {Math.round(m.hitRate * 100)}%
                  </p>
                  <p className="text-[10px] text-muted">
                    {m.correctCount}/{m.totalPredictions}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Biggest Upsets */}
        <div className="bg-surface rounded-card shadow-card dark:shadow-none dark:border dark:border-border-default overflow-hidden">
          <div className="px-4 sm:px-5 pt-3 pb-2">
            <h4 className="t-card-title text-ink">Biggest Upsets</h4>
          </div>
          <div className="divide-y divide-border-subtle">
            {leastPredictable.map((m, idx) => (
              <div key={m.matchId} className="px-4 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-bold text-danger-600 dark:text-danger-400 w-5">
                    {idx + 1}.
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink truncate">
                      {m.homeTeamName} vs {m.awayTeamName}
                    </p>
                    <p className="text-xs text-muted">
                      {STAGE_LABELS[m.stage] ?? m.stage} &middot; {m.actualScore}
                    </p>
                  </div>
                </div>
                <div className="text-right ml-2">
                  <p className="text-sm font-bold text-danger-600 dark:text-danger-400">
                    {Math.round(m.hitRate * 100)}%
                  </p>
                  <p className="text-[10px] text-muted">
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
