'use client'

import { type PointsResult } from './points'
import { formatNumber } from '@/lib/format'

const badgeStyles: Record<PointsResult['type'], string> = {
  exact: 'bg-success-100 text-success-800 border border-success-500',
  winner_gd: 'bg-warning-100 text-warning-800 border border-warning-400',
  winner: 'bg-warning-100 text-warning-800 border border-warning-400',
  miss: 'bg-neutral-50 text-neutral-500 border border-neutral-200',
}

const icons: Record<PointsResult['type'], string> = {
  exact: '\u{1F3AF}',    // dart
  winner_gd: '\u2713',   // checkmark
  winner: '\u2713',      // checkmark
  miss: '\u2717',        // x
}

const typeLabels: Record<PointsResult['type'], string> = {
  exact: 'Exact!',
  winner_gd: 'Winner + GD',
  winner: 'Winner',
  miss: 'Miss',
}

const psoTypeLabels: Record<string, string> = {
  exact: 'PSO Exact',
  winner_gd: 'PSO Winner+GD',
  winner: 'PSO Winner',
  miss: 'PSO Miss',
}

export function PointsBadge({ result }: { result: PointsResult }) {
  const showMultiplier = result.multiplier > 1 && result.basePoints > 0
  const ftPoints = result.points - (result.pso?.psoPoints ?? 0)

  return (
    <div className="flex flex-col items-end gap-0.5">
      <span
        className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${badgeStyles[result.type]}`}
      >
        <span>{icons[result.type]}</span>
        <span>{typeLabels[result.type]}</span>
        <span>+{formatNumber(ftPoints)}</span>
      </span>
      {showMultiplier && (
        <span className="text-[10px] text-neutral-500">
          {formatNumber(result.basePoints)} x {result.multiplier}x
        </span>
      )}
      {result.pso && result.pso.psoPoints > 0 && (
        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-accent-500">
          +{formatNumber(result.pso.psoPoints)} {psoTypeLabels[result.pso.psoType]}
        </span>
      )}
    </div>
  )
}
