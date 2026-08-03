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

export function PointsBadge({ result }: { result: PointsResult }) {
  const showMultiplier = result.multiplier > 1 && result.basePoints > 0
  const ftPoints = result.points - (result.pso?.psoPoints ?? 0)

  return (
    <div className="flex items-center gap-1.5">
      {/* Fixed width: the four labels run 41-67px, so a chip sized to its text
          left the points after it landing at four different x positions down the
          Result column. 4.5rem clears the widest ("RESULT ✓") with headroom. */}
      <span
        className={`inline-flex items-center justify-center gap-1 min-w-[4.5rem] text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-pill ${tierChipClass(result.type)}`}
      >
        {typeLabels[result.type]}
      </span>
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
    </div>
  )
}
