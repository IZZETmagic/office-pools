'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { PoolData, MatchData, MemberData, PredictionData } from './page'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'

type MatchesTabProps = {
  pool: PoolData
  matches: MatchData[]
  setMatches: (matches: MatchData[]) => void
  members: MemberData[]
  predictions: PredictionData[]
  setPredictions: (predictions: PredictionData[]) => void
  setMembers: (members: MemberData[]) => void
}

type ModalState =
  | { type: 'none' }
  | { type: 'enter_result'; match: MatchData }
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
}: MatchesTabProps) {
  const supabase = createClient()

  // Filters
  const [stageFilter, setStageFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [groupFilter, setGroupFilter] = useState('all')

  // Modal
  const [modal, setModal] = useState<ModalState>({ type: 'none' })

  // Result entry form
  const [homeScore, setHomeScore] = useState('')
  const [awayScore, setAwayScore] = useState('')
  const [resultType, setResultType] = useState<'ft' | 'et' | 'pso'>('ft')
  const [psoHome, setPsoHome] = useState('')
  const [psoAway, setPsoAway] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

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

  function openResultModal(match: MatchData) {
    setHomeScore(match.home_score_ft?.toString() ?? '')
    setAwayScore(match.away_score_ft?.toString() ?? '')
    setPsoHome(match.home_score_pso?.toString() ?? '')
    setPsoAway(match.away_score_pso?.toString() ?? '')
    setResultType(
      match.home_score_pso !== null ? 'pso' : 'ft'
    )
    setError(null)
    setSuccess(null)
    setModal({ type: 'enter_result', match })
  }

  async function handleSaveResult() {
    if (modal.type !== 'enter_result') return
    const match = modal.match

    const hScore = parseInt(homeScore)
    const aScore = parseInt(awayScore)

    if (isNaN(hScore) || isNaN(aScore) || hScore < 0 || aScore < 0) {
      setError('Scores must be non-negative integers.')
      return
    }

    if (resultType === 'pso') {
      const pH = parseInt(psoHome)
      const pA = parseInt(psoAway)
      if (isNaN(pH) || isNaN(pA) || pH < 0 || pA < 0) {
        setError('Penalty shootout scores must be non-negative integers.')
        return
      }
      if (pH === pA) {
        setError('Penalty shootout scores cannot be tied.')
        return
      }
    }

    setSaving(true)
    setError(null)

    const updateData: Record<string, unknown> = {
      home_score_ft: hScore,
      away_score_ft: aScore,
      status: 'completed',
      is_completed: true,
      completed_at: new Date().toISOString(),
    }

    if (resultType === 'pso') {
      updateData.home_score_pso = parseInt(psoHome)
      updateData.away_score_pso = parseInt(psoAway)
    } else {
      updateData.home_score_pso = null
      updateData.away_score_pso = null
    }

    const { error: updateError } = await supabase
      .from('matches')
      .update(updateData)
      .eq('match_id', match.match_id)

    if (updateError) {
      setError(updateError.message)
      setSaving(false)
      return
    }

    // Refresh matches data
    const { data: refreshedMatches } = await supabase
      .from('matches')
      .select(
        `*, home_team:teams!matches_home_team_id_fkey(country_name), away_team:teams!matches_away_team_id_fkey(country_name)`
      )
      .eq('tournament_id', pool.tournament_id)
      .order('match_number', { ascending: true })

    if (refreshedMatches) {
      setMatches(
        refreshedMatches.map((m: any) => ({
          ...m,
          home_team: Array.isArray(m.home_team) ? m.home_team[0] ?? null : m.home_team,
          away_team: Array.isArray(m.away_team) ? m.away_team[0] ?? null : m.away_team,
        }))
      )
    }

    // Refresh members to get updated points/ranks
    const { data: refreshedMembers } = await supabase
      .from('pool_members')
      .select('*, users!inner(user_id, username, full_name, email)')
      .eq('pool_id', pool.pool_id)
      .order('current_rank', { ascending: true, nullsFirst: false })

    if (refreshedMembers) {
      setMembers(refreshedMembers as MemberData[])
    }

    const matchPredictions = predictions.filter(
      (p) => p.match_id === match.match_id
    )
    setSuccess(
      `Match result saved. Points calculated for ${matchPredictions.length} predictions.`
    )
    setSaving(false)

    // Close modal after short delay
    setTimeout(() => {
      setModal({ type: 'none' })
      setSuccess(null)
    }, 2000)
  }

  async function handleCancelMatch(match: MatchData) {
    if (!confirm('Are you sure you want to mark this match as cancelled?')) return

    const { error } = await supabase
      .from('matches')
      .update({ status: 'cancelled' })
      .eq('match_id', match.match_id)

    if (error) {
      alert('Failed to cancel match: ' + error.message)
      return
    }

    setMatches(
      matches.map((m) =>
        m.match_id === match.match_id ? { ...m, status: 'cancelled' } : m
      )
    )
  }

  function openPredictionsModal(match: MatchData) {
    setModal({ type: 'view_predictions', match })
  }

  // Calculate points for a single prediction against actual scores
  function calcPoints(
    predH: number,
    predA: number,
    actH: number,
    actA: number
  ): { points: number; label: string; icon: string } {
    if (predH === actH && predA === actA) {
      return { points: 5, label: 'Exact', icon: '🎯' }
    }
    const predDiff = predH - predA
    const actDiff = actH - actA
    const predWinner = predH > predA ? 'H' : predH < predA ? 'A' : 'D'
    const actWinner = actH > actA ? 'H' : actH < actA ? 'A' : 'D'
    if (predWinner === actWinner && predDiff === actDiff) {
      return { points: 3, label: 'Winner+GD', icon: '✓' }
    }
    if (predWinner === actWinner) {
      return { points: 1, label: 'Winner', icon: '✓' }
    }
    return { points: 0, label: 'Wrong', icon: '✗' }
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Match Results</h2>

      {success && <Alert variant="success" className="mb-4">{success}</Alert>}

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

      {/* Matches table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  #
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Stage
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Match
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                  Score
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                  Predictions
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredMatches.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
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
                        <span className="text-xs text-gray-400">
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
                        <span className="text-gray-400 mx-2">vs</span>
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
                              <span className="text-xs text-gray-400 block">
                                PSO: {match.home_score_pso}-{match.away_score_pso}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-sm text-gray-600">
                        {matchPredCount}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex gap-2 justify-end">
                          {match.status !== 'cancelled' && (
                            <button
                              onClick={() => openResultModal(match)}
                              className="text-xs px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 font-medium transition"
                            >
                              {match.is_completed
                                ? 'Edit Result'
                                : 'Enter Result'}
                            </button>
                          )}
                          <button
                            onClick={() => openPredictionsModal(match)}
                            className="text-xs px-3 py-1.5 rounded bg-gray-100 text-gray-700 hover:bg-gray-200 font-medium transition"
                          >
                            View
                          </button>
                          {match.status !== 'completed' &&
                            match.status !== 'cancelled' && (
                              <button
                                onClick={() => handleCancelMatch(match)}
                                className="text-xs px-3 py-1.5 rounded bg-red-50 text-red-600 hover:bg-red-100 font-medium transition"
                              >
                                Cancel
                              </button>
                            )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Enter/Edit Result Modal */}
      {modal.type === 'enter_result' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-1">
              {modal.match.is_completed ? 'Edit' : 'Enter'} Match Result
            </h3>
            <p className="text-sm text-gray-500 mb-6">
              Match #{modal.match.match_number}:{' '}
              {modal.match.home_team?.country_name ||
                modal.match.home_team_placeholder ||
                'TBD'}{' '}
              vs{' '}
              {modal.match.away_team?.country_name ||
                modal.match.away_team_placeholder ||
                'TBD'}
              <br />
              {getStageName(modal.match.stage)}
              {modal.match.group_letter
                ? ` ${modal.match.group_letter}`
                : ''}{' '}
              -{' '}
              {new Date(modal.match.match_date).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </p>

            {error && <Alert variant="error" className="mb-4">{error}</Alert>}
            {success && <Alert variant="success" className="mb-4">{success}</Alert>}

            {/* Score inputs */}
            <div className="flex items-center justify-center gap-4 mb-6">
              <div className="text-center">
                <p className="text-sm font-medium text-gray-600 mb-2">
                  {modal.match.home_team?.country_name ||
                    modal.match.home_team_placeholder ||
                    'Home'}
                </p>
                <input
                  type="number"
                  min="0"
                  value={homeScore}
                  onChange={(e) => setHomeScore(e.target.value)}
                  className="w-20 h-14 text-center text-2xl font-bold border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                />
              </div>
              <span className="text-2xl font-bold text-gray-400 mt-6">-</span>
              <div className="text-center">
                <p className="text-sm font-medium text-gray-600 mb-2">
                  {modal.match.away_team?.country_name ||
                    modal.match.away_team_placeholder ||
                    'Away'}
                </p>
                <input
                  type="number"
                  min="0"
                  value={awayScore}
                  onChange={(e) => setAwayScore(e.target.value)}
                  className="w-20 h-14 text-center text-2xl font-bold border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                />
              </div>
            </div>

            {/* Match completion type */}
            {modal.match.stage !== 'group' && (
              <div className="mb-6">
                <p className="text-sm font-medium text-gray-700 mb-2">
                  Match completed after:
                </p>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="resultType"
                      value="ft"
                      checked={resultType === 'ft'}
                      onChange={() => setResultType('ft')}
                      className="text-blue-600"
                    />
                    <span className="text-sm text-gray-700">
                      Full Time (90 minutes)
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="resultType"
                      value="et"
                      checked={resultType === 'et'}
                      onChange={() => setResultType('et')}
                      className="text-blue-600"
                    />
                    <span className="text-sm text-gray-700">
                      Extra Time (120 minutes)
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="resultType"
                      value="pso"
                      checked={resultType === 'pso'}
                      onChange={() => setResultType('pso')}
                      className="text-blue-600"
                    />
                    <span className="text-sm text-gray-700">
                      Penalty Shootout
                    </span>
                  </label>
                </div>

                {/* PSO score inputs */}
                {resultType === 'pso' && (
                  <div className="flex items-center justify-center gap-4 mt-4 p-4 bg-gray-50 rounded-lg">
                    <div className="text-center">
                      <p className="text-xs text-gray-500 mb-1">PSO</p>
                      <input
                        type="number"
                        min="0"
                        value={psoHome}
                        onChange={(e) => setPsoHome(e.target.value)}
                        className="w-16 h-10 text-center text-lg font-bold border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                      />
                    </div>
                    <span className="text-lg font-bold text-gray-400 mt-4">
                      -
                    </span>
                    <div className="text-center">
                      <p className="text-xs text-gray-500 mb-1">PSO</p>
                      <input
                        type="number"
                        min="0"
                        value={psoAway}
                        onChange={(e) => setPsoAway(e.target.value)}
                        className="w-16 h-10 text-center text-lg font-bold border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3 justify-end">
              <Button
                variant="gray"
                onClick={() => setModal({ type: 'none' })}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                variant="green"
                onClick={handleSaveResult}
                loading={saving}
                loadingText="Saving..."
              >
                Save &amp; Calculate Points
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* View Predictions Modal */}
      {modal.type === 'view_predictions' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 p-6 max-h-[80vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-gray-900 mb-1">
              Predictions for Match #{modal.match.match_number}
            </h3>
            <p className="text-sm text-gray-500 mb-4">
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
                  <p className="text-gray-500 text-sm py-4">
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
                        pointsInfo = calcPoints(
                          pred.predicted_home_score,
                          pred.predicted_away_score,
                          modal.match.home_score_ft,
                          modal.match.away_score_ft
                        )
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
                            <span className="font-mono font-bold text-gray-900">
                              {pred.predicted_home_score}-
                              {pred.predicted_away_score}
                            </span>
                            {pointsInfo && (
                              <span
                                className={`text-xs font-medium px-2 py-0.5 rounded ${
                                  pointsInfo.points === 5
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
