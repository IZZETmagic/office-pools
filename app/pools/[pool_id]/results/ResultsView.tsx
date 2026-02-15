'use client'

import { useState, useMemo } from 'react'
import { MatchCard, type ResultMatch } from './MatchCard'
import { calculatePoints, type PoolSettings } from './points'
import { GROUP_LETTERS } from '@/lib/tournament'

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
  { key: 'all', label: 'All Matches' },
  { key: 'group', label: 'Group Stage' },
  { key: 'round_32', label: 'Round of 32' },
  { key: 'round_16', label: 'Round of 16' },
  { key: 'quarter_final', label: 'Quarter Finals' },
  { key: 'semi_final', label: 'Semi Finals' },
  { key: 'finals', label: 'Finals' },
]

const STATUS_OPTIONS: { key: StatusFilter; label: string; color: string }[] = [
  { key: 'all', label: 'All', color: 'bg-gray-100 text-gray-700' },
  { key: 'completed', label: 'Completed', color: 'bg-green-100 text-green-700' },
  { key: 'live', label: 'Live', color: 'bg-red-100 text-red-700' },
  { key: 'upcoming', label: 'Upcoming', color: 'bg-gray-100 text-gray-600' },
]

// =============================================
// COMPONENT
// =============================================
export function ResultsView({
  matches,
  poolSettings,
}: {
  matches: ResultMatch[]
  poolSettings: PoolSettings
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

  // Points summary
  const totalPoints = useMemo(() => {
    let sum = 0
    for (const m of matches) {
      if (
        (m.status === 'completed' || m.status === 'live') &&
        m.home_score_ft !== null &&
        m.away_score_ft !== null &&
        m.prediction
      ) {
        const hasPso = m.home_score_pso !== null && m.away_score_pso !== null
        const res = calculatePoints(
          m.prediction.predicted_home_score,
          m.prediction.predicted_away_score,
          m.home_score_ft,
          m.away_score_ft,
          m.stage,
          poolSettings,
          hasPso
            ? {
                actualHomePso: m.home_score_pso!,
                actualAwayPso: m.away_score_pso!,
                predictedHomePso: m.prediction.predicted_home_pso,
                predictedAwayPso: m.prediction.predicted_away_pso,
              }
            : undefined
        )
        sum += res.points
      }
    }
    return sum
  }, [matches, poolSettings])

  return (
    <div>
      {/* ── Points summary ── */}
      <div className="mb-6 p-4 bg-white rounded-lg shadow border border-gray-200 flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600">Your Total Points</p>
          <p className="text-3xl font-extrabold text-blue-600">{totalPoints}</p>
        </div>
        <div className="text-right text-xs text-gray-500">
          <p>{statusCounts.completed} completed</p>
          {statusCounts.live > 0 && <p>{statusCounts.live} live</p>}
          <p>
            {statusCounts.upcoming} upcoming
          </p>
        </div>
      </div>

      {/* ── Stage tabs ── */}
      <div className="flex gap-1 mb-4 border-b border-gray-200 pb-3 overflow-x-auto">
        {STAGE_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => {
              setStageTab(tab.key)
              if (tab.key !== 'group') setGroupFilter('all')
            }}
            className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
              stageTab === tab.key
                ? 'bg-blue-600 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Status filter + Group filter row ── */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {/* Status buttons */}
        <div className="flex gap-1">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setStatusFilter(opt.key)}
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                statusFilter === opt.key
                  ? opt.key === 'all'
                    ? 'bg-gray-800 text-white'
                    : opt.key === 'completed'
                      ? 'bg-green-600 text-white'
                      : opt.key === 'live'
                        ? 'bg-red-600 text-white'
                        : 'bg-gray-600 text-white'
                  : opt.color + ' hover:opacity-80'
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

        {/* Group filter dropdown (only on Group Stage tab) */}
        {stageTab === 'group' && (
          <select
            value={groupFilter}
            onChange={(e) => setGroupFilter(e.target.value)}
            className="px-3 py-1 text-sm border border-gray-300 rounded-md bg-white text-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">All Groups</option>
            {GROUP_LETTERS.map((g) => (
              <option key={g} value={g}>
                Group {g}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* ── Match cards grid ── */}
      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 text-lg">
            No matches found for this filter.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
          {filtered.map((match) => (
            <MatchCard
              key={match.match_id}
              match={match}
              poolSettings={poolSettings}
            />
          ))}
        </div>
      )}
    </div>
  )
}
