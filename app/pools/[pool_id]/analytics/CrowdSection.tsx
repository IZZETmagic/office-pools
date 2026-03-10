'use client'

import { useState, useMemo } from 'react'
import { Badge } from '@/components/ui/Badge'
import type { CrowdMatch } from './analyticsHelpers'

// =============================================
// CONSTANTS
// =============================================

const STAGE_LABELS: Record<string, string> = {
  group: 'Group',
  round_32: 'R32',
  round_16: 'R16',
  quarter_final: 'QF',
  semi_final: 'SF',
  third_place: '3rd',
  final: 'Final',
}

type FilterMode = 'all' | 'contrarian' | 'consensus'

// =============================================
// COMPONENT
// =============================================

type CrowdSectionProps = {
  crowdData: CrowdMatch[]
}

export function CrowdSection({ crowdData }: CrowdSectionProps) {
  const [filter, setFilter] = useState<FilterMode>('all')
  const [expanded, setExpanded] = useState(false)

  if (crowdData.length === 0) return null

  // Stats
  const matchesWithPrediction = crowdData.filter(m => m.userPredictedResult !== null)
  const contrarianCount = matchesWithPrediction.filter(m => m.userIsContrarian).length
  const consensusCount = matchesWithPrediction.length - contrarianCount
  const contrarianCorrect = matchesWithPrediction.filter(m => m.userIsContrarian && m.userWasCorrect).length

  // Filter
  const filtered = useMemo(() => {
    let list = crowdData
    if (filter === 'contrarian') list = list.filter(m => m.userIsContrarian)
    else if (filter === 'consensus') list = list.filter(m => !m.userIsContrarian && m.userPredictedResult !== null)
    return list
  }, [crowdData, filter])

  const displayList = expanded ? filtered : filtered.slice(0, 10)

  return (
    <div className="space-y-4">
      {/* Section Header */}
      <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">
        Crowd Comparison
      </h3>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard
          label="Consensus Picks"
          value={consensusCount}
          sub={`of ${matchesWithPrediction.length} matches`}
        />
        <SummaryCard
          label="Contrarian Picks"
          value={contrarianCount}
          sub={`${matchesWithPrediction.length > 0 ? Math.round((contrarianCount / matchesWithPrediction.length) * 100) : 0}% of picks`}
        />
        <SummaryCard
          label="Contrarian Wins"
          value={contrarianCorrect}
          sub={contrarianCount > 0 ? `${Math.round((contrarianCorrect / contrarianCount) * 100)}% success` : 'no contrarian picks'}
        />
        <SummaryCard
          label="Pool Size"
          value={crowdData[0]?.totalPredictions ?? 0}
          sub="entries compared"
        />
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2">
        {(['all', 'contrarian', 'consensus'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              filter === f
                ? 'bg-primary-500 text-white'
                : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700'
            }`}
          >
            {f === 'all' ? 'All Matches' : f === 'contrarian' ? 'Contrarian' : 'Consensus'}
            {f === 'contrarian' && ` (${contrarianCount})`}
            {f === 'consensus' && ` (${consensusCount})`}
          </button>
        ))}
      </div>

      {/* Match List */}
      <div className="bg-surface rounded-xl shadow dark:shadow-none dark:border dark:border-border-default overflow-hidden">
        <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {displayList.length > 0 ? (
            displayList.map(match => (
              <CrowdMatchCard key={match.matchId} match={match} />
            ))
          ) : (
            <div className="py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
              No matches match the selected filter.
            </div>
          )}
        </div>

        {/* Show more / less */}
        {filtered.length > 10 && (
          <div className="px-4 py-3 border-t border-neutral-100 dark:border-neutral-800 text-center">
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
            >
              {expanded ? 'Show less' : `Show all ${filtered.length} matches`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// =============================================
// MATCH CARD
// =============================================

function CrowdMatchCard({ match }: { match: CrowdMatch }) {
  return (
    <div className="px-4 py-3 sm:px-5 sm:py-4">
      {/* Header row: match info + badges */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            #{match.matchNumber}
          </span>
          <span className="text-xs text-neutral-400 dark:text-neutral-500">
            {STAGE_LABELS[match.stage] ?? match.stage}
            {match.groupLetter ? ` ${match.groupLetter}` : ''}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {match.userPredictedResult !== null && (
            <>
              <Badge variant={match.userIsContrarian ? 'blue' : 'gray'}>
                {match.userIsContrarian ? 'Contrarian' : 'Consensus'}
              </Badge>
              <Badge variant={match.userWasCorrect ? 'green' : 'yellow'}>
                {match.userWasCorrect ? 'Correct' : 'Miss'}
              </Badge>
            </>
          )}
        </div>
      </div>

      {/* Teams + Score */}
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-sm font-medium text-neutral-900 dark:text-white truncate mr-2">
          {match.homeTeamName} vs {match.awayTeamName}
        </span>
        <span className="text-sm font-bold text-neutral-900 dark:text-white whitespace-nowrap">
          {match.actualHomeScore} - {match.actualAwayScore}
        </span>
      </div>

      {/* Prediction Distribution Bar */}
      <div className="space-y-1.5">
        <div className="flex h-5 rounded-full overflow-hidden bg-neutral-100 dark:bg-neutral-800">
          {match.homeWinPct > 0 && (
            <div
              className="bg-success-500 flex items-center justify-center text-[9px] font-bold text-white transition-all"
              style={{ width: `${Math.max(match.homeWinPct * 100, 8)}%` }}
            >
              {Math.round(match.homeWinPct * 100)}%
            </div>
          )}
          {match.drawPct > 0 && (
            <div
              className="bg-neutral-400 flex items-center justify-center text-[9px] font-bold text-white transition-all"
              style={{ width: `${Math.max(match.drawPct * 100, 8)}%` }}
            >
              {Math.round(match.drawPct * 100)}%
            </div>
          )}
          {match.awayWinPct > 0 && (
            <div
              className="bg-primary-500 flex items-center justify-center text-[9px] font-bold text-white transition-all"
              style={{ width: `${Math.max(match.awayWinPct * 100, 8)}%` }}
            >
              {Math.round(match.awayWinPct * 100)}%
            </div>
          )}
        </div>
        <div className="flex justify-between text-[10px] text-neutral-500 dark:text-neutral-400">
          <span>{match.homeTeamName} win</span>
          <span>Draw</span>
          <span>{match.awayTeamName} win</span>
        </div>
      </div>

      {/* Most popular score */}
      <div className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
        Most popular prediction: <span className="font-medium text-neutral-700 dark:text-neutral-300">{match.mostPopularScore.home}-{match.mostPopularScore.away}</span>
        {' '}({Math.round(match.mostPopularScore.pct * 100)}% of pool)
      </div>
    </div>
  )
}

// =============================================
// SUMMARY CARD
// =============================================

function SummaryCard({ label, value, sub }: { label: string; value: number; sub: string }) {
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
