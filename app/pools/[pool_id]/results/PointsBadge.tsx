'use client'

import { type PointsResult } from './points'

const badgeStyles: Record<PointsResult['type'], string> = {
  exact: 'bg-accent-100 text-accent-700 border border-accent-500',
  winner_gd: 'bg-success-100 text-success-800 border border-success-500',
  winner: 'bg-primary-100 text-primary-800 border border-primary-500',
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
        <span>+{ftPoints}</span>
      </span>
      {showMultiplier && (
        <span className="text-[10px] text-neutral-500">
          {result.basePoints} x {result.multiplier}x
        </span>
      )}
      {result.pso && result.pso.psoPoints > 0 && (
        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-accent-500">
          +{result.pso.psoPoints} {psoTypeLabels[result.pso.psoType]}
        </span>
      )}
    </div>
  )
}
