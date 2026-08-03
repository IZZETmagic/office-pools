'use client'

import { type PointsResult } from './points'
import { formatNumber } from '@/lib/format'
import { tierChipClass } from '@/lib/design/formDots'

// The tier colours used to be a private copy here, and it had drifted the same
// way the other nine had: `exact` on green and `winner_gd` on blue, both a step
// off. The Results tab therefore coloured a result differently from the
// leaderboard and the points breakdown showing the same match.

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

/**
 * The tier pill on its own.
 *
 * Split out from PointsBadge so the results table can put it in its own column:
 * cross-row alignment cannot be done from inside a single cell without pinning
 * the chip to a magic width, which the next longer label would outgrow. Given
 * its own <td>, the browser sizes the column to the widest chip and both the
 * chips and the points that follow line up for free.
 */
export function PointsChip({ result }: { result: PointsResult }) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-pill ${tierChipClass(result.type)}`}
    >
      {typeLabels[result.type]}
    </span>
  )
}

/** The points earned, plus the multiplier and PSO detail when they apply. */
export function PointsValue({ result }: { result: PointsResult }) {
  const showMultiplier = result.multiplier > 1 && result.basePoints > 0
  const ftPoints = result.points - (result.pso?.psoPoints ?? 0)

  return (
    <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
      <span
        className={`t-num t-num-extrabold text-xs ${
          ftPoints > 0 ? 'text-success-600' : 'text-muted'
        }`}
      >
        +{formatNumber(ftPoints)}
      </span>
      {showMultiplier && (
        <span className="t-num text-[10px] text-muted">
          ({formatNumber(result.basePoints)}×{result.multiplier})
        </span>
      )}
      {result.pso && result.pso.psoPoints > 0 && (
        <span className="text-[10px] font-medium text-gold">
          +{formatNumber(result.pso.psoPoints)} {psoTypeLabels[result.pso.psoType]}
        </span>
      )}
    </span>
  )
}

/** Chip and points together, for the mobile card where there is one column. */
export function PointsBadge({ result }: { result: PointsResult }) {
  return (
    <div className="flex items-center gap-1.5">
      <PointsChip result={result} />
      <PointsValue result={result} />
    </div>
  )
}
