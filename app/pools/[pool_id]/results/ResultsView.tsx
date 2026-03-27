'use client'

import { useState, useMemo } from 'react'
import { MatchCard, type ResultMatch } from './MatchCard'
import type { PoolSettings } from './points'
import { GroupStandingsComparison } from './GroupStandingsComparison'
import { GROUP_LETTERS } from '@/lib/tournament'
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

const STAGE_TABS: { key: StageTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'group', label: 'Group' },
  { key: 'round_32', label: 'R32' },
  { key: 'round_16', label: 'R16' },
  { key: 'quarter_final', label: 'QF' },
  { key: 'semi_final', label: 'SF' },
  { key: 'finals', label: 'Finals' },
]

const STATUS_OPTIONS: { key: StatusFilter; label: string; activeColor: string }[] = [
  { key: 'all', label: 'All', activeColor: 'bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-900' },
  { key: 'completed', label: 'Completed', activeColor: 'bg-success-600 text-white' },
  { key: 'live', label: 'Live', activeColor: 'bg-danger-600 text-white' },
  { key: 'upcoming', label: 'Upcoming', activeColor: 'bg-neutral-600 text-white dark:bg-neutral-300 dark:text-neutral-900' },
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
      {/* ── Points summary strip ── */}
      <div className="mb-4 px-4 h-[60px] bg-surface rounded-xl shadow-sm border border-neutral-200 flex items-center gap-3 text-sm">
        <span className="font-semibold text-neutral-700 dark:text-neutral-600">
          {userEntries && userEntries.length > 1
            ? userEntries.find(e => e.entry_id === selectedEntryId)?.entry_name || 'Entry'
            : 'Your Points'}
        </span>
        <span className="text-lg font-extrabold text-primary-600">{totalPoints.toLocaleString()}<span className="text-xs font-medium text-neutral-500 ml-0.5">pts</span></span>
        <span className="text-neutral-300 dark:text-neutral-600">·</span>
        <div className="flex items-center gap-2 text-xs text-neutral-500 ml-auto">
          <span><span className="text-success-600 font-medium">{statusCounts.completed}</span> ✓</span>
          {statusCounts.live > 0 && (
            <span><span className="text-danger-600 font-medium">{statusCounts.live}</span> live</span>
          )}
          <span><span className="font-medium">{statusCounts.upcoming}</span> upcoming</span>
        </div>
      </div>

      {/* ── Stage tabs ── */}
      <div className="mb-4 border-b border-neutral-200 pb-3">
        <div className="flex gap-1 overflow-x-auto">
          {STAGE_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => {
                setStageTab(tab.key)
                if (tab.key !== 'group') setGroupFilter('all')
              }}
              className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                stageTab === tab.key
                  ? 'bg-primary-600 text-white'
                  : 'text-neutral-600 hover:bg-neutral-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Group letter filter pills (only on Group Stage tab) ── */}
        {stageTab === 'group' && (
          <div className="flex gap-0.5 mt-2 overflow-x-auto">
            <button
              onClick={() => setGroupFilter('all')}
              className={`px-3 py-1 text-xs font-medium rounded-l-lg rounded-r-md transition-colors ${
                groupFilter === 'all'
                  ? 'bg-primary-600 text-white'
                  : 'bg-neutral-200 text-neutral-600 hover:bg-neutral-300 dark:bg-neutral-200 dark:text-neutral-600 dark:hover:bg-neutral-400'
              }`}
            >
              All
            </button>
            {GROUP_LETTERS.map((g, i) => (
              <button
                key={g}
                onClick={() => setGroupFilter(g)}
                className={`w-8 h-7 text-xs font-medium transition-colors ${
                  i === GROUP_LETTERS.length - 1 ? 'rounded-r-lg rounded-l-md' : 'rounded-md'
                } ${
                  groupFilter === g
                    ? 'bg-primary-600 text-white'
                    : 'bg-neutral-200 text-neutral-600 hover:bg-neutral-300 dark:bg-neutral-200 dark:text-neutral-600 dark:hover:bg-neutral-400'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Status filter + Entry selector row ── */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {/* Status pills (desktop) */}
        <div className="hidden sm:flex gap-1">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setStatusFilter(opt.key)}
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                statusFilter === opt.key
                  ? opt.activeColor
                  : 'bg-neutral-200 text-neutral-600 hover:bg-neutral-300 dark:bg-neutral-200 dark:text-neutral-600 dark:hover:bg-neutral-400'
              }`}
            >
              {opt.label}
              {opt.key !== 'all' && (
                <span className="ml-1 opacity-70">
                  {statusCounts[opt.key]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Status pills (mobile) */}
        <div className="sm:hidden flex gap-1">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setStatusFilter(opt.key)}
              className={`px-2.5 py-1 text-xs font-medium rounded-full transition-colors ${
                statusFilter === opt.key
                  ? opt.activeColor
                  : 'bg-neutral-200 text-neutral-600 hover:bg-neutral-300 dark:bg-neutral-200 dark:text-neutral-600 dark:hover:bg-neutral-400'
              }`}
            >
              {opt.label}
              {opt.key !== 'all' && (
                <span className="ml-0.5 opacity-70">
                  {statusCounts[opt.key]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Entry selector (right-aligned, only for multi-entry users) */}
        {userEntries && userEntries.length > 1 && onEntryChange && (
          <div className="ml-auto">
            <select
              value={selectedEntryId || ''}
              onChange={(e) => onEntryChange(e.target.value)}
              className="px-1.5 py-1.5 text-[10px] sm:px-3 sm:py-1 sm:text-sm font-medium border border-neutral-300 rounded-md sm:rounded-lg bg-surface text-neutral-700 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              {userEntries.map((entry) => (
                <option key={entry.entry_id} value={entry.entry_id}>
                  {entry.entry_name}
                </option>
              ))}
            </select>
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
          <p className="text-neutral-500 text-lg">
            No matches found for this filter.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
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
      )}
    </div>
  )
}
