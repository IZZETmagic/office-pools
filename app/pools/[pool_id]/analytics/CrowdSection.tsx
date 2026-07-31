'use client'

import { useState, useMemo } from 'react'
import { Badge } from '@/components/ui/Badge'
import type { CrowdMatch } from './analyticsHelpers'
import { Icon } from '@/components/ui/Icon'

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

/**
 * BattleBar from the app: a label, the two values, and a single bar split between
 * them — yours in primary, the other side in `silver`.
 */
function BattleBar({
  label,
  you,
  crowd,
  crowdLabel = 'crowd',
}: {
  label: string
  you: number
  crowd: number
  crowdLabel?: string
}) {
  const total = you + crowd
  const youPct = total > 0 ? (you / total) * 100 : 50
  const crowdPct = total > 0 ? (crowd / total) * 100 : 50
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[13px] text-muted">{label}</span>
        <span className="t-num text-[11px] font-semibold text-muted">
          {you} vs {crowd} {crowdLabel}
        </span>
      </div>
      <div className="flex gap-0.5 h-2">
        <span
          className="rounded-pill bg-primary-600"
          style={{ flex: youPct, minWidth: 2 }}
        />
        <span
          className="rounded-pill bg-silver"
          style={{ flex: crowdPct, minWidth: 2 }}
        />
      </div>
    </div>
  )
}

/** PerformanceCallout from the app: tinted panel, icon, verdict, optional detail. */
function PerformanceCallout({
  isOutperforming,
  accuracyDiff,
  contrarianRate,
  showContrarian,
}: {
  isOutperforming: boolean
  accuracyDiff: number
  contrarianRate: number
  showContrarian: boolean
}) {
  const accent = isOutperforming ? 'var(--success-600)' : 'var(--primary-600)'
  return (
    <div
      className="flex items-start gap-2 p-3 rounded-chip"
      style={{
        backgroundColor: `color-mix(in srgb, ${accent} 8%, transparent)`,
        border: `1px solid color-mix(in srgb, ${accent} 13%, transparent)`,
      }}
    >
      <Icon
        name={isOutperforming ? 'chart.line.uptrend.xyaxis' : 'target'}
        size={18}
        weight="semibold"
        tint={accent}
      />
      <div className="flex-1 flex flex-col gap-0.5">
        <span className="text-sm font-bold" style={{ color: accent }}>
          {isOutperforming
            ? `Outperforming the crowd by ${accuracyDiff}%`
            : `The crowd leads by ${Math.abs(accuracyDiff)}%`}
        </span>
        {showContrarian && (
          <span className="text-xs text-muted">
            You won {contrarianRate}% of your contrarian picks
          </span>
        )}
      </div>
    </div>
  )
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

  // The faceoff needs both sides' hit rate. Yours comes straight off userWasCorrect;
  // the crowd's is how often the majority pick matched the actual result, derived
  // from crowdMajorityResult against the final score. Both are real measurements —
  // there is no per-player crowd average in this payload, so nothing here is a
  // stand-in for one.
  const userCorrect = matchesWithPrediction.filter(m => m.userWasCorrect).length
  const crowdCorrect = crowdData.filter(m => {
    const actual =
      m.actualHomeScore > m.actualAwayScore ? 'home'
        : m.actualHomeScore < m.actualAwayScore ? 'away'
          : 'draw'
    return m.crowdMajorityResult === actual
  }).length

  const userAccuracy = matchesWithPrediction.length > 0
    ? Math.round((userCorrect / matchesWithPrediction.length) * 100)
    : 0
  const crowdAccuracy = crowdData.length > 0
    ? Math.round((crowdCorrect / crowdData.length) * 100)
    : 0
  const accuracyDiff = userAccuracy - crowdAccuracy

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
      {/* CrowdSection in the app: a VS faceoff, three battle bars, and a callout —
          all inside one card. The four separate summary cards this replaced stated
          the numbers without ever putting you against the crowd, which is the whole
          point of the section. */}
      <div className="bg-surface rounded-card shadow-card dark:shadow-none dark:border dark:border-border-default overflow-hidden">
        <div className="px-4 pt-4 flex flex-col gap-3">
          <h3 className="t-section-header text-ink">You vs The Crowd</h3>

          <div className="flex items-center justify-around pb-2">
            <div className="flex flex-col items-center gap-1">
              <span className="text-[10px] font-bold tracking-[0.5px] text-primary-600">YOU</span>
              <span className="t-num font-black text-[32px] leading-9 text-primary-600">
                {userAccuracy}%
              </span>
            </div>
            <span className="w-9 h-9 rounded-pill bg-mist border-[0.5px] border-silver flex items-center justify-center text-[11px] font-black text-muted">
              VS
            </span>
            <div className="flex flex-col items-center gap-1">
              <span className="text-[10px] font-bold tracking-[0.5px] text-muted">POOL AVG</span>
              <span className="t-num font-black text-[32px] leading-9 text-muted">
                {crowdAccuracy}%
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 px-4 pb-4">
          <BattleBar label="Correct Picks" you={userCorrect} crowd={crowdCorrect} />
          <BattleBar label="Consensus Picks" you={consensusCount} crowd={contrarianCount} crowdLabel="contrarian" />
          <BattleBar label="Contrarian Wins" you={contrarianCorrect} crowd={contrarianCount - contrarianCorrect} crowdLabel="lost" />
        </div>

        {accuracyDiff !== 0 && (
          <div className="px-4 pb-4">
            <PerformanceCallout
              isOutperforming={accuracyDiff > 0}
              accuracyDiff={accuracyDiff}
              contrarianRate={contrarianCount > 0 ? Math.round((contrarianCorrect / contrarianCount) * 100) : 0}
              showContrarian={contrarianCount > 0}
            />
          </div>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2">
        {(['all', 'contrarian', 'consensus'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-xs font-medium rounded-pill transition-colors ${
              filter === f
                ? 'bg-primary-600/12 text-primary-700'
                : 'bg-mist text-muted hover:text-ink'
            }`}
          >
            {f === 'all' ? 'All Matches' : f === 'contrarian' ? 'Contrarian' : 'Consensus'}
            {f === 'contrarian' && ` (${contrarianCount})`}
            {f === 'consensus' && ` (${consensusCount})`}
          </button>
        ))}
      </div>

      {/* Match List */}
      <div className="bg-surface rounded-card shadow-card dark:shadow-none dark:border dark:border-border-default overflow-hidden">
        <div className="divide-y divide-border-subtle">
          {displayList.length > 0 ? (
            displayList.map(match => (
              <CrowdMatchCard key={match.matchId} match={match} />
            ))
          ) : (
            <div className="py-8 text-center text-sm text-muted">
              No matches match the selected filter.
            </div>
          )}
        </div>

        {/* Show more / less */}
        {filtered.length > 10 && (
          <div className="px-4 py-3 border-t border-border-subtle text-center">
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
          <span className="text-xs text-muted">
            #{match.matchNumber}
          </span>
          <span className="text-xs text-muted">
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
        <span className="text-sm font-medium text-ink truncate mr-2">
          {match.homeTeamName} vs {match.awayTeamName}
        </span>
        <span className="text-sm font-bold text-ink whitespace-nowrap">
          {match.actualHomeScore} - {match.actualAwayScore}
        </span>
      </div>

      {/* Prediction Distribution Bar */}
      <div className="space-y-1.5">
        <div className="flex h-5 rounded-full overflow-hidden bg-mist">
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
        <div className="flex justify-between text-[10px] text-muted">
          <span>{match.homeTeamName} win</span>
          <span>Draw</span>
          <span>{match.awayTeamName} win</span>
        </div>
      </div>

      {/* Most popular score */}
      <div className="mt-2 text-xs text-muted">
        Most popular prediction: <span className="font-medium text-neutral-700 dark:text-neutral-300">{match.mostPopularScore.home}-{match.mostPopularScore.away}</span>
        {' '}({Math.round(match.mostPopularScore.pct * 100)}% of pool)
      </div>
    </div>
  )
}

// =============================================
// SUMMARY CARD
// =============================================

