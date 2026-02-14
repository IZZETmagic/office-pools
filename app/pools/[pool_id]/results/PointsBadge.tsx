'use client'

import { type PointsResult } from './points'

const badgeStyles: Record<PointsResult['type'], string> = {
  exact: 'bg-yellow-100 text-yellow-800 border border-yellow-300',
  winner_gd: 'bg-green-100 text-green-800 border border-green-300',
  winner: 'bg-blue-100 text-blue-800 border border-blue-300',
  miss: 'bg-gray-50 text-gray-400 border border-gray-200',
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

export function PointsBadge({ result }: { result: PointsResult }) {
  const showMultiplier = result.multiplier > 1 && result.points > 0

  return (
    <div className="flex flex-col items-end gap-0.5">
      <span
        className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${badgeStyles[result.type]}`}
      >
        <span>{icons[result.type]}</span>
        <span>{typeLabels[result.type]}</span>
        <span>+{result.points}</span>
      </span>
      {showMultiplier && (
        <span className="text-[10px] text-gray-400">
          {result.basePoints} x {result.multiplier}x
        </span>
      )}
    </div>
  )
}
