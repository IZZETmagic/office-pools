'use client'

import { type PointsResult } from './points'
import { formatNumber } from '@/lib/format'

const badgeStyles: Record<PointsResult['type'], string> = {
  exact: 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400',
  winner_gd: 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400',
  winner: 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400',
  miss: 'bg-danger-100 text-danger-700 dark:bg-danger-900/30 dark:text-danger-400',
}

const typeLabels: Record<PointsResult['type'], string> = {
  exact: 'EXACT',
  winner_gd: 'GD ✓',
  winner: 'RESULT ✓',
  miss: 'MISS',
}

const psoTypeLabels: Record<string, string> = {
  exact: 'PSO Exact',
  winner_gd: 'PSO GD',
  winner: 'PSO Result',
  miss: '',
}

export function PointsBadge({ result }: { result: PointsResult }) {
  const showMultiplier = result.multiplier > 1 && result.basePoints > 0
  const ftPoints = result.points - (result.pso?.psoPoints ?? 0)

  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md ${badgeStyles[result.type]}`}
      >
        {typeLabels[result.type]}
      </span>
      <span
        className={`text-xs font-bold tabular-nums ${
          ftPoints > 0
            ? 'text-success-600 dark:text-success-400'
            : 'text-neutral-400 dark:text-neutral-500'
        }`}
      >
        +{formatNumber(ftPoints)}
      </span>
      {showMultiplier && (
        <span className="text-[10px] text-neutral-400 dark:text-neutral-500">
          ({formatNumber(result.basePoints)}×{result.multiplier})
        </span>
      )}
      {result.pso && result.pso.psoPoints > 0 && (
        <span className="text-[10px] font-medium text-accent-500">
          +{formatNumber(result.pso.psoPoints)} {psoTypeLabels[result.pso.psoType]}
        </span>
      )}
    </div>
  )
}
