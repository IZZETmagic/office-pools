'use client'

import { useState, useMemo } from 'react'
import { MatchCard, MatchTableRow, type ResultMatch } from './MatchCard'
import { Select } from '@/components/ui/Select'
import type { PoolSettings } from './points'
import { GroupStandingsComparison } from './GroupStandingsComparison'
import { GROUP_LETTERS } from '@/lib/tournament'
import { formatNumber } from '@/lib/format'
import type { MatchData, TeamData, EntryData, ExistingPrediction, BonusScoreData, MatchScoreData } from '../types'
import type { MatchConductData } from '@/lib/tournament'

// =============================================
// TYPES
// =============================================
type StageTab =
  | 'all'
  | 'group'
  | 'round_32'
  | 'round_16'
  | 'quarter_final'
  | 'semi_final'
  | 'finals'

type StatusFilter = 'all' | 'completed' | 'live' | 'upcoming'

// Spelled out: R32 and QF read as jargon in a list, where there is room for
// the real name.
const STAGE_TABS: { key: StageTab; label: string }[] = [
  { key: 'all', label: 'All Rounds' },
  { key: 'group', label: 'Group Stage' },
  { key: 'round_32', label: 'Round of 32' },
  { key: 'round_16', label: 'Round of 16' },
  { key: 'quarter_final', label: 'Quarter Finals' },
  { key: 'semi_final', label: 'Semi Finals' },
  { key: 'finals', label: 'Finals' },
]

// activeColor is gone with the pills — nothing reads it now.
const STATUS_OPTIONS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All Matches' },
  { key: 'completed', label: 'Completed' },
  { key: 'live', label: 'Live' },
  { key: 'upcoming', label: 'Upcoming' },
]

// =============================================
// COMPONENT
// =============================================
export function ResultsView({
  matches,
  poolSettings,
  predictionMode,
  // Group standings comparison props
  rawMatches,
  teams,
  conductData,
  userPredictions,
  bonusScores,
  currentEntryId,
  // Stored scoring data
  entryMatchScores,
  currentEntry,
  // Entry selector
  userEntries,
  selectedEntryId,
  onEntryChange,
}: {
  matches: ResultMatch[]
  poolSettings: PoolSettings
  predictionMode: 'full_tournament' | 'progressive' | 'bracket_picker'
  // Group standings comparison props
  rawMatches: MatchData[]
  teams: TeamData[]
  conductData: MatchConductData[]
  userPredictions: ExistingPrediction[]
  bonusScores: BonusScoreData[]
  currentEntryId: string
  // Stored scoring data
  entryMatchScores: MatchScoreData[]
  currentEntry?: EntryData
  // Entry selector
  userEntries?: EntryData[]
  selectedEntryId?: string
  onEntryChange?: (entryId: string) => void
}) {
  const [stageTab, setStageTab] = useState<StageTab>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [groupFilter, setGroupFilter] = useState<string>('all')

  // Derive which statuses actually exist in the data
  const statusCounts = useMemo(() => {
    const counts = { all: matches.length, completed: 0, live: 0, upcoming: 0 }
    for (const m of matches) {
      if (m.status === 'completed') counts.completed++
      else if (m.status === 'live') counts.live++
      else counts.upcoming++
    }
    return counts
  }, [matches])

  // Filter matches
  const filtered = useMemo(() => {
    let result = matches

    // Stage filter
    if (stageTab !== 'all') {
      if (stageTab === 'finals') {
        result = result.filter(
          (m) => m.stage === 'third_place' || m.stage === 'final'
        )
      } else {
        result = result.filter((m) => m.stage === stageTab)
      }
    }

    // Status filter
    if (statusFilter !== 'all') {
      if (statusFilter === 'upcoming') {
        result = result.filter(
          (m) => m.status !== 'completed' && m.status !== 'live'
        )
      } else {
        result = result.filter((m) => m.status === statusFilter)
      }
    }

    // Group filter (only applies when viewing group stage)
    if (stageTab === 'group' && groupFilter !== 'all') {
      result = result.filter((m) => m.group_letter === groupFilter)
    }

    return result
  }, [matches, stageTab, statusFilter, groupFilter])

  // Read stored match/bonus/total points from entry (single source of truth)
  const matchPoints = currentEntry?.match_points ?? entryMatchScores.reduce((sum, ms) => sum + ms.total_points, 0)
  const bonusPoints = currentEntry?.bonus_points ?? bonusScores.reduce((sum, bs) => sum + bs.points_earned, 0)
  const adjustment = currentEntry?.point_adjustment ?? 0
  const totalPoints = currentEntry?.scored_total_points ?? (matchPoints + bonusPoints + adjustment)

  // Build match_scores lookup by match_id for passing to MatchCard
  const matchScoreByMatchId = useMemo(() => {
    const map = new Map<string, MatchScoreData>()
    for (const ms of entryMatchScores) map.set(ms.match_id, ms)
    return map
  }, [entryMatchScores])

  // Check if any group matches have results (for showing comparison section)
  const hasGroupResults = useMemo(() => {
    return rawMatches.some(
      (m) => m.stage === 'group' && (m.is_completed || m.status === 'live') && m.home_score_ft !== null
    )
  }, [rawMatches])

  return (
    <div>
      {/* ── Header row ──
          One card holding both halves: points on the left, filters pushed
          right. Previously these were two stacked blocks — a points card, then
          a bare filter row — which is what made the top of the tab feel busy. */}
      <div className="mb-4">
        <div className="px-4 py-3 bg-surface rounded-card shadow-card dark:shadow-none dark:border dark:border-border-default flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-baseline gap-2 min-w-0">
            {/* The label is desktop-only. On a phone the total speaks for
                itself, and when there are multiple entries the name is already
                showing in the entry selector a few pixels away. */}
            <span className="hidden sm:inline t-card-title text-ink truncate">
              {userEntries && userEntries.length > 1
                ? userEntries.find(e => e.entry_id === selectedEntryId)?.entry_name || 'Entry'
                : 'Your Points'}
            </span>
            <span className="t-num t-num-extrabold text-lg text-primary-600 whitespace-nowrap">
              {formatNumber(totalPoints)}
              <span className="t-detail text-muted ml-1">pts</span>
            </span>
          </div>

          <div className="flex items-baseline gap-3 t-body text-muted whitespace-nowrap">
            <span><span className="t-num text-success-700">{statusCounts.completed}</span> completed</span>
            {statusCounts.live > 0 && (
              <span><span className="t-num text-danger-700">{statusCounts.live}</span> live</span>
            )}
            <span><span className="t-num text-ink">{statusCounts.upcoming}</span> upcoming</span>
          </div>

          {/* Filters, pushed right. ml-auto sits on the group, not on the last
              select, so the three stay together when the row wraps. */}
          <div className="flex flex-wrap items-center gap-2 ml-auto">
            <Select
              value={stageTab}
              onChange={(e) => {
                const next = e.target.value as StageTab
                setStageTab(next)
                if (next !== 'group') setGroupFilter('all')
              }}
              aria-label="Filter by round"
            >
              {STAGE_TABS.map((tab) => (
                <option key={tab.key} value={tab.key}>{tab.label}</option>
              ))}
            </Select>

            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              aria-label="Filter by match status"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {opt.key === 'all' ? opt.label : `${opt.label} (${statusCounts[opt.key]})`}
                </option>
              ))}
            </Select>

            {userEntries && userEntries.length > 1 && onEntryChange && (
              <Select
                value={selectedEntryId || ''}
                onChange={(e) => onEntryChange(e.target.value)}
                aria-label="Choose entry"
              >
                {userEntries.map((entry) => (
                  <option key={entry.entry_id} value={entry.entry_id}>
                    {entry.entry_name}
                  </option>
                ))}
              </Select>
            )}
          </div>
        </div>

        {/* Group letters qualify the round chosen above, so they stay beneath
            the row rather than joining it. */}
        {stageTab === 'group' && (
          <div className="flex gap-0.5 mt-3 overflow-x-auto">
            <button
              onClick={() => setGroupFilter('all')}
              className={`px-3 py-1 t-detail font-bold rounded-l-control rounded-r-chip transition-colors ${
                groupFilter === 'all'
                  ? 'bg-primary-600 text-white'
                  : 'bg-mist text-muted hover:bg-silver'
              }`}
            >
              All
            </button>
            {GROUP_LETTERS.map((g, i) => (
              <button
                key={g}
                onClick={() => setGroupFilter(g)}
                className={`w-8 h-7 t-num text-xs transition-colors ${
                  i === GROUP_LETTERS.length - 1 ? 'rounded-r-control rounded-l-chip' : 'rounded-chip'
                } ${
                  groupFilter === g
                    ? 'bg-primary-600 text-white'
                    : 'bg-mist text-muted hover:bg-silver'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Group Standings Comparison (only on Group Stage tab) ── */}
      {stageTab === 'group' && hasGroupResults && (
        <GroupStandingsComparison
          matches={rawMatches}
          teams={teams}
          conductData={conductData}
          userPredictions={userPredictions}
          poolSettings={poolSettings}
          bonusScores={bonusScores}
          groupFilter={groupFilter}
        />
      )}

      {/* ── Match cards grid ── */}
      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <p className="t-section-header text-muted">
            No matches found for this filter.
          </p>
        </div>
      ) : (
        <>
          {/* Mobile: the stacked list. Six columns do not fit on a phone, and
              the card carries the bracket-prediction line the table drops. */}
          <div className="sm:hidden bg-surface rounded-card shadow-card overflow-hidden divide-y divide-border-subtle dark:shadow-none dark:border dark:border-border-default">
            {filtered.map((match, i) => (
              <MatchCard
                key={match.match_id}
                match={match}
                poolSettings={poolSettings}
                predictionMode={predictionMode}
                index={i}
                storedScore={matchScoreByMatchId.get(match.match_id) ?? null}
              />
            ))}
          </div>

          {/* Desktop: a table. Same formatting as the members table — no header
              fill, a rule under the head, rows separated by border. */}
          <div className="hidden sm:block bg-surface rounded-card shadow-card overflow-hidden dark:shadow-none dark:border dark:border-border-default">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-border-default">
                  <tr>
                    <th className="px-4 py-3 text-left t-body font-semibold text-ink whitespace-nowrap">Match</th>
                    <th className="px-4 py-3 text-right t-body font-semibold text-ink">Home</th>
                    <th className="px-2 py-3 text-center t-body font-semibold text-ink whitespace-nowrap">Score / Pick</th>
                    <th className="px-4 py-3 text-left t-body font-semibold text-ink">Away</th>
                    <th className="px-4 py-3 text-center t-body font-semibold text-ink">Result</th>
                    <th className="px-4 py-3 text-right t-body font-semibold text-ink">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((match) => (
                    <MatchTableRow
                      key={match.match_id}
                      match={match}
                      predictionMode={predictionMode}
                      storedScore={matchScoreByMatchId.get(match.match_id) ?? null}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
