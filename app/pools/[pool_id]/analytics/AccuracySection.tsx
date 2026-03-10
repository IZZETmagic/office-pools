'use client'

import { useMemo } from 'react'
import dynamic from 'next/dynamic'
import type { StageAccuracy, OverallAccuracy } from './analyticsHelpers'

// Dynamic imports for Recharts (avoid SSR issues)
const BarChart = dynamic(() => import('recharts').then(m => m.BarChart), { ssr: false })
const Bar = dynamic(() => import('recharts').then(m => m.Bar), { ssr: false })
const XAxis = dynamic(() => import('recharts').then(m => m.XAxis), { ssr: false })
const YAxis = dynamic(() => import('recharts').then(m => m.YAxis), { ssr: false })
const Tooltip = dynamic(() => import('recharts').then(m => m.Tooltip), { ssr: false })
const ResponsiveContainer = dynamic(() => import('recharts').then(m => m.ResponsiveContainer), { ssr: false })
const CartesianGrid = dynamic(() => import('recharts').then(m => m.CartesianGrid), { ssr: false })
const PieChart = dynamic(() => import('recharts').then(m => m.PieChart), { ssr: false })
const Pie = dynamic(() => import('recharts').then(m => m.Pie), { ssr: false })
const Cell = dynamic(() => import('recharts').then(m => m.Cell), { ssr: false })
const Legend = dynamic(() => import('recharts').then(m => m.Legend), { ssr: false })

// =============================================
// CONSTANTS
// =============================================

const TYPE_COLORS = {
  exact: '#10b981',    // success green
  winnerGd: '#3b82f6', // primary blue
  winner: '#f59e0b',   // warning amber
  miss: '#d1d5db',     // neutral gray
}

const TYPE_LABELS: Record<string, string> = {
  exact: 'Exact Score',
  winnerGd: 'Winner + GD',
  winner: 'Correct Result',
  miss: 'Miss',
}

const TOOLTIP_STYLE = {
  background: '#1f2937',
  border: 'none',
  borderRadius: '8px',
  fontSize: '12px',
  color: '#fff',
}

// =============================================
// COMPONENT
// =============================================

type AccuracySectionProps = {
  stageAccuracy: StageAccuracy[]
  overall: OverallAccuracy
}

export function AccuracySection({ stageAccuracy, overall }: AccuracySectionProps) {
  // Chart data for stacked bar chart
  const chartData = useMemo(() =>
    stageAccuracy.map(s => ({
      stage: s.stageLabel.replace(' Stage', '').replace(' Finals', '').replace('Quarter', 'QF').replace('Semi', 'SF'),
      Exact: s.exact,
      'W+GD': s.winnerGd,
      Winner: s.winner,
      Miss: s.miss,
      total: s.total,
      hitRate: s.hitRate,
    })),
    [stageAccuracy]
  )

  // Donut chart data
  const donutData = useMemo(() => [
    { name: 'Exact Score', value: overall.exact, fill: TYPE_COLORS.exact },
    { name: 'Winner + GD', value: overall.winnerGd, fill: TYPE_COLORS.winnerGd },
    { name: 'Correct Result', value: overall.winner, fill: TYPE_COLORS.winner },
    { name: 'Miss', value: overall.miss, fill: TYPE_COLORS.miss },
  ].filter(d => d.value > 0), [overall])

  return (
    <div className="space-y-4">
      {/* Section Header */}
      <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">
        Your Prediction Accuracy
      </h3>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Hit Rate"
          value={`${Math.round(overall.hitRate * 100)}%`}
          sub={`${overall.exact + overall.winnerGd + overall.winner} of ${overall.totalMatches} correct`}
        />
        <StatCard
          label="Exact Scores"
          value={overall.exact.toString()}
          sub={`${overall.totalMatches > 0 ? Math.round(overall.exactRate * 100) : 0}% exact rate`}
        />
        <StatCard
          label="Matches Scored"
          value={overall.totalMatches.toString()}
          sub="completed matches"
        />
        <StatCard
          label="Match Points"
          value={overall.totalPoints.toString()}
          sub="from predictions"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Stacked Bar Chart */}
        <div className="lg:col-span-2 bg-surface rounded-xl shadow dark:shadow-none dark:border dark:border-border-default overflow-hidden">
          <div className="px-4 sm:px-5 py-3 bg-neutral-100 dark:bg-neutral-200 border-b border-neutral-200 dark:border-neutral-700">
            <h4 className="text-sm font-semibold text-neutral-900 dark:text-white">Accuracy by Stage</h4>
          </div>
          <div className="p-4 sm:p-5">
            {chartData.length > 0 ? (
              <div className="h-[220px] sm:h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} barSize={28}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" opacity={0.5} />
                    <XAxis dataKey="stage" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#9ca3af' }} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Bar dataKey="Exact" stackId="a" fill={TYPE_COLORS.exact} radius={[0, 0, 0, 0]} />
                    <Bar dataKey="W+GD" stackId="a" fill={TYPE_COLORS.winnerGd} />
                    <Bar dataKey="Winner" stackId="a" fill={TYPE_COLORS.winner} />
                    <Bar dataKey="Miss" stackId="a" fill={TYPE_COLORS.miss} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
                No completed matches to analyze yet.
              </div>
            )}
            {/* Legend */}
            <div className="flex flex-wrap gap-4 mt-3 justify-center">
              {Object.entries(TYPE_LABELS).map(([key, label]) => (
                <div key={key} className="flex items-center gap-1.5">
                  <div
                    className="w-3 h-3 rounded-sm"
                    style={{ backgroundColor: TYPE_COLORS[key as keyof typeof TYPE_COLORS] }}
                  />
                  <span className="text-xs text-neutral-600 dark:text-neutral-400">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Donut Chart */}
        <div className="bg-surface rounded-xl shadow dark:shadow-none dark:border dark:border-border-default overflow-hidden">
          <div className="px-4 sm:px-5 py-3 bg-neutral-100 dark:bg-neutral-200 border-b border-neutral-200 dark:border-neutral-700">
            <h4 className="text-sm font-semibold text-neutral-900 dark:text-white">Prediction Breakdown</h4>
          </div>
          <div className="p-4 sm:p-5">
            {donutData.length > 0 ? (
              <div className="h-[220px] sm:h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={donutData}
                      cx="50%"
                      cy="50%"
                      innerRadius="40%"
                      outerRadius="70%"
                      paddingAngle={3}
                      dataKey="value"
                      label={({ name, value }) => `${value}`}
                    >
                      {donutData.map((entry, idx) => (
                        <Cell key={idx} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
                No data yet.
              </div>
            )}
            {/* Donut legend */}
            <div className="space-y-1.5 mt-2">
              {donutData.map(d => (
                <div key={d.name} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.fill }} />
                    <span className="text-neutral-600 dark:text-neutral-400">{d.name}</span>
                  </div>
                  <span className="font-medium text-neutral-900 dark:text-white">{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Stage Detail Table (mobile-friendly) */}
      <div className="bg-surface rounded-xl shadow dark:shadow-none dark:border dark:border-border-default overflow-hidden">
        <div className="px-4 sm:px-5 py-3 bg-neutral-100 dark:bg-neutral-200 border-b border-neutral-200 dark:border-neutral-700">
          <h4 className="text-sm font-semibold text-neutral-900 dark:text-white">Stage Details</h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 dark:border-neutral-700">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase">Stage</th>
                <th className="text-center px-2 py-2.5 text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase">Total</th>
                <th className="text-center px-2 py-2.5 text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase">Exact</th>
                <th className="text-center px-2 py-2.5 text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase">W+GD</th>
                <th className="text-center px-2 py-2.5 text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase">Winner</th>
                <th className="text-center px-2 py-2.5 text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase">Miss</th>
                <th className="text-center px-2 py-2.5 text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase">Hit%</th>
              </tr>
            </thead>
            <tbody>
              {stageAccuracy.map(s => (
                <tr key={s.stage} className="border-b border-neutral-100 dark:border-neutral-800 last:border-0">
                  <td className="px-4 py-2.5 font-medium text-neutral-900 dark:text-white whitespace-nowrap">{s.stageLabel}</td>
                  <td className="text-center px-2 py-2.5 text-neutral-600 dark:text-neutral-400">{s.total}</td>
                  <td className="text-center px-2 py-2.5">
                    <span className="text-success-600 dark:text-success-400 font-medium">{s.exact}</span>
                  </td>
                  <td className="text-center px-2 py-2.5">
                    <span className="text-primary-600 dark:text-primary-400 font-medium">{s.winnerGd}</span>
                  </td>
                  <td className="text-center px-2 py-2.5">
                    <span className="text-warning-600 dark:text-warning-400 font-medium">{s.winner}</span>
                  </td>
                  <td className="text-center px-2 py-2.5 text-neutral-500 dark:text-neutral-500">{s.miss}</td>
                  <td className="text-center px-2 py-2.5 font-semibold text-neutral-900 dark:text-white">
                    {Math.round(s.hitRate * 100)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// =============================================
// STAT CARD HELPER
// =============================================

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-surface rounded-xl shadow dark:shadow-none dark:border dark:border-border-default p-4">
      <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-1">
        {label}
      </p>
      <p className="text-2xl font-bold text-neutral-900 dark:text-white">{value}</p>
      <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{sub}</p>
    </div>
  )
}
