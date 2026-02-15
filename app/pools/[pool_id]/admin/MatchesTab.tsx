'use client'

import { useState } from 'react'
import type { PoolData, MatchData, MemberData, PredictionData, SettingsData } from '../types'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { calculatePoints, DEFAULT_POOL_SETTINGS } from '../results/points'
import type { PoolSettings } from '../results/points'

type MatchesTabProps = {
  pool: PoolData
  matches: MatchData[]
  setMatches: (matches: MatchData[]) => void
  members: MemberData[]
  predictions: PredictionData[]
  setPredictions: (predictions: PredictionData[]) => void
  setMembers: (members: MemberData[]) => void
  settings: SettingsData | null
}

type ModalState =
  | { type: 'none' }
  | { type: 'view_predictions'; match: MatchData }

function getStatusBadgeVariant(
  status: string
): 'blue' | 'green' | 'yellow' | 'gray' {
  switch (status) {
    case 'completed':
      return 'green'
    case 'live':
      return 'yellow'
    case 'cancelled':
      return 'gray'
    default:
      return 'blue'
  }
}

function getStageName(stage: string): string {
  const names: Record<string, string> = {
    group: 'Group',
    round_32: 'R32',
    round_16: 'R16',
    quarter_final: 'QF',
    semi_final: 'SF',
    third_place: '3rd',
    final: 'Final',
  }
  return names[stage] || stage
}

export function MatchesTab({
  pool,
  matches,
  setMatches,
  members,
  predictions,
  setPredictions,
  setMembers,
  settings,
}: MatchesTabProps) {
  // Filters
  const [stageFilter, setStageFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [groupFilter, setGroupFilter] = useState('all')

  // Modal
  const [modal, setModal] = useState<ModalState>({ type: 'none' })

  // Get unique stages and groups
  const stages = [...new Set(matches.map((m) => m.stage))]
  const groups = [
    ...new Set(matches.filter((m) => m.group_letter).map((m) => m.group_letter!)),
  ].sort()

  // Apply filters
  const filteredMatches = matches.filter((m) => {
    if (stageFilter !== 'all' && m.stage !== stageFilter) return false
    if (statusFilter !== 'all' && m.status !== statusFilter) return false
    if (
      groupFilter !== 'all' &&
      stageFilter === 'group' &&
      m.group_letter !== groupFilter
    )
      return false
    return true
  })

  function openPredictionsModal(match: MatchData) {
    setModal({ type: 'view_predictions', match })
  }

  // Build pool settings for the calculatePoints function
  const poolSettings: PoolSettings = settings
    ? {
        ...DEFAULT_POOL_SETTINGS,
        ...settings,
        pso_exact_score: settings.pso_exact_score ?? 0,
        pso_correct_difference: settings.pso_correct_difference ?? 0,
        pso_correct_result: settings.pso_correct_result ?? 0,
      }
    : DEFAULT_POOL_SETTINGS

  // Stats
  const completedCount = matches.filter((m) => m.is_completed).length

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-4">Match Results</h2>

      {/* Info banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-6">
        <p className="text-sm text-blue-700">
          Match results are managed by Super Admins and apply globally across all pools.
          You can view match details and member predictions below.
        </p>
      </div>

      {/* Stats */}
      <div className="flex gap-3 mb-6 text-sm">
        <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full font-medium">
          {completedCount} Completed
        </span>
        <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full font-medium">
          {matches.length - completedCount} Remaining
        </span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <select
          value={stageFilter}
          onChange={(e) => {
            setStageFilter(e.target.value)
            if (e.target.value !== 'group') setGroupFilter('all')
          }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 bg-white"
        >
          <option value="all">All Stages</option>
          {stages.map((s) => (
            <option key={s} value={s}>
              {getStageName(s)}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 bg-white"
        >
          <option value="all">All Status</option>
          <option value="scheduled">Scheduled</option>
          <option value="live">Live</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>

        {stageFilter === 'group' && (
          <select
            value={groupFilter}
            onChange={(e) => setGroupFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 bg-white"
          >
            <option value="all">All Groups</option>
            {groups.map((g) => (
              <option key={g} value={g}>
                Group {g}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Matches - Mobile card view */}
      <div className="sm:hidden space-y-2">
        {filteredMatches.length === 0 ? (
          <p className="text-center text-gray-600 py-8">No matches found with current filters.</p>
        ) : (
          filteredMatches.map((match) => {
            const home = match.home_team?.country_name || match.home_team_placeholder || 'TBD'
            const away = match.away_team?.country_name || match.away_team_placeholder || 'TBD'
            const matchPredCount = predictions.filter((p) => p.match_id === match.match_id).length
            const matchDate = new Date(match.match_date)
            return (
              <div key={match.match_id} className="bg-white border border-gray-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded">#{match.match_number}</span>
                    <Badge variant="blue">{getStageName(match.stage)}{match.group_letter ? ` ${match.group_letter}` : ''}</Badge>
                  </div>
                  <Badge variant={getStatusBadgeVariant(match.status)}>{match.status}</Badge>
                </div>
                <div className="flex items-center justify-between mb-2">
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-gray-900">{home}</span>
                    <span className="text-gray-400 mx-1.5 text-xs">vs</span>
                    <span className="text-sm font-medium text-gray-900">{away}</span>
                  </div>
                  {match.is_completed && (
                    <span className="font-bold text-gray-900 text-sm shrink-0 ml-2">
                      {match.home_score_ft}-{match.away_score_ft}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>{matchDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                  <div className="flex items-center gap-2">
                    <span>{matchPredCount} predictions</span>
                    <button
                      onClick={() => openPredictionsModal(match)}
                      className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700 hover:bg-gray-200 font-medium"
                    >
                      View
                    </button>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Matches table - Desktop */}
      <div className="hidden sm:block bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                  #
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                  Stage
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                  Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                  Match
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase">
                  Status
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase">
                  Score
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase">
                  Predictions
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredMatches.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-600">
                    No matches found with current filters.
                  </td>
                </tr>
              ) : (
                filteredMatches.map((match) => {
                  const home =
                    match.home_team?.country_name ||
                    match.home_team_placeholder ||
                    'TBD'
                  const away =
                    match.away_team?.country_name ||
                    match.away_team_placeholder ||
                    'TBD'
                  const matchPredCount = predictions.filter(
                    (p) => p.match_id === match.match_id
                  ).length
                  const matchDate = new Date(match.match_date)

                  return (
                    <tr key={match.match_id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <span className="text-xs font-mono bg-gray-100 px-2 py-1 rounded">
                          #{match.match_number}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="blue">
                          {getStageName(match.stage)}
                          {match.group_letter ? ` ${match.group_letter}` : ''}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                        {matchDate.toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                        <br />
                        <span className="text-xs text-gray-500">
                          {matchDate.toLocaleTimeString('en-US', {
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-gray-900">
                          {home}
                        </span>
                        <span className="text-gray-500 mx-2">vs</span>
                        <span className="font-medium text-gray-900">
                          {away}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={getStatusBadgeVariant(match.status)}>
                          {match.status}
                          {match.status === 'completed' && ' ✓'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {match.is_completed ? (
                          <span className="font-bold text-gray-900">
                            {match.home_score_ft} - {match.away_score_ft}
                            {match.home_score_pso !== null && (
                              <span className="text-xs text-gray-500 block">
                                PSO: {match.home_score_pso}-{match.away_score_pso}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-gray-500">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-sm text-gray-600">
                        {matchPredCount}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => openPredictionsModal(match)}
                          className="text-xs px-3 py-1.5 rounded bg-gray-100 text-gray-700 hover:bg-gray-200 font-medium transition"
                        >
                          View Predictions
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* View Predictions Modal */}
      {modal.type === 'view_predictions' && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
          <div className="bg-white rounded-t-xl sm:rounded-xl shadow-xl sm:max-w-lg w-full sm:mx-4 p-4 sm:p-6 max-h-[85vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-gray-900 mb-1">
              Predictions for Match #{modal.match.match_number}
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              {modal.match.home_team?.country_name ||
                modal.match.home_team_placeholder ||
                'TBD'}{' '}
              vs{' '}
              {modal.match.away_team?.country_name ||
                modal.match.away_team_placeholder ||
                'TBD'}
            </p>

            {modal.match.is_completed && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 mb-4">
                <p className="text-sm font-medium text-blue-700">
                  Actual Result: {modal.match.home_score_ft} -{' '}
                  {modal.match.away_score_ft}
                  {modal.match.home_score_pso !== null &&
                    ` (PSO: ${modal.match.home_score_pso}-${modal.match.away_score_pso})`}
                </p>
              </div>
            )}

            {(() => {
              const matchPreds = predictions.filter(
                (p) => p.match_id === modal.match.match_id
              )
              if (matchPreds.length === 0) {
                return (
                  <p className="text-gray-600 text-sm py-4">
                    No predictions for this match.
                  </p>
                )
              }

              let exactCount = 0
              let winnerCount = 0
              let wrongCount = 0

              return (
                <>
                  <div className="space-y-2 mb-4">
                    {matchPreds.map((pred) => {
                      const member = members.find(
                        (m) => m.member_id === pred.member_id
                      )
                      const name =
                        member?.users.full_name ||
                        member?.users.username ||
                        'Unknown'

                      let pointsInfo = null
                      if (
                        modal.match.is_completed &&
                        modal.match.home_score_ft !== null &&
                        modal.match.away_score_ft !== null
                      ) {
                        const hasPso =
                          modal.match.home_score_pso !== null &&
                          modal.match.away_score_pso !== null
                        const result = calculatePoints(
                          pred.predicted_home_score,
                          pred.predicted_away_score,
                          modal.match.home_score_ft,
                          modal.match.away_score_ft,
                          modal.match.stage,
                          poolSettings,
                          hasPso
                            ? {
                                actualHomePso: modal.match.home_score_pso!,
                                actualAwayPso: modal.match.away_score_pso!,
                                predictedHomePso: pred.predicted_home_pso,
                                predictedAwayPso: pred.predicted_away_pso,
                              }
                            : undefined
                        )
                        pointsInfo = {
                          points: result.points,
                          label: result.type === 'exact' ? 'Exact' : result.type === 'winner_gd' ? 'Winner+GD' : result.type === 'winner' ? 'Winner' : 'Wrong',
                          icon: result.type === 'exact' ? '🎯' : result.type === 'miss' ? '✗' : '✓',
                        }
                        if (pointsInfo.label === 'Exact') exactCount++
                        else if (pointsInfo.points > 0) winnerCount++
                        else wrongCount++
                      }

                      return (
                        <div
                          key={pred.prediction_id}
                          className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2"
                        >
                          <span className="text-sm text-gray-700">{name}</span>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <span className="font-mono font-bold text-gray-900">
                                {pred.predicted_home_score}-
                                {pred.predicted_away_score}
                              </span>
                              {modal.match.home_score_pso !== null &&
                                pred.predicted_home_pso != null &&
                                pred.predicted_away_pso != null && (
                                  <span className="text-xs text-purple-600 font-mono ml-1">
                                    (PSO: {pred.predicted_home_pso}-{pred.predicted_away_pso})
                                  </span>
                                )}
                            </div>
                            {pointsInfo && (
                              <span
                                className={`text-xs font-medium px-2 py-0.5 rounded ${
                                  pointsInfo.label === 'Exact'
                                    ? 'bg-green-100 text-green-700'
                                    : pointsInfo.points > 0
                                      ? 'bg-yellow-100 text-yellow-700'
                                      : 'bg-red-100 text-red-600'
                                }`}
                              >
                                {pointsInfo.icon} +{pointsInfo.points}
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {modal.match.is_completed && (
                    <div className="flex gap-4 text-sm border-t pt-3">
                      <span className="text-green-600">
                        🎯 Exact: {exactCount}
                      </span>
                      <span className="text-yellow-600">
                        ✓ Winner: {winnerCount}
                      </span>
                      <span className="text-red-500">
                        ✗ Wrong: {wrongCount}
                      </span>
                    </div>
                  )}
                </>
              )
            })()}

            <div className="mt-4 flex justify-end">
              <Button variant="gray" onClick={() => setModal({ type: 'none' })}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
