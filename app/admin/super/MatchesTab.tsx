'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { SuperMatchData, AuditLogData } from './page'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { useToast } from '@/components/ui/Toast'

type MatchesTabProps = {
  matches: SuperMatchData[]
  setMatches: (matches: SuperMatchData[]) => void
  auditLogs: AuditLogData[]
  setAuditLogs: (logs: AuditLogData[]) => void
}

type ModalState =
  | { type: 'none' }
  | { type: 'enter_result'; match: SuperMatchData }
  | { type: 'reset_match'; match: SuperMatchData }
  | { type: 'update_live_score'; match: SuperMatchData }
  | { type: 'set_status'; match: SuperMatchData; newStatus: 'live' | 'scheduled' }

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

function CardInput({
  label,
  value,
  onChange,
  color,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  color: 'yellow' | 'amber' | 'red' | 'rose'
}) {
  const colorMap = {
    yellow: 'bg-warning-400',
    amber: 'bg-warning-500',
    red: 'bg-danger-600',
    rose: 'bg-danger-700',
  }

  return (
    <div className="flex items-center gap-2">
      <span className={`w-3 h-4 rounded-sm ${colorMap[color]} flex-shrink-0`} />
      <label className="text-xs text-neutral-600 flex-1 min-w-0">{label}</label>
      <input
        type="number"
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-14 h-7 text-center text-sm font-medium border border-neutral-300 rounded focus:ring-1 focus:ring-danger-500 focus:border-transparent text-neutral-900"
      />
    </div>
  )
}

export function MatchesTab({
  matches,
  setMatches,
  auditLogs,
  setAuditLogs,
}: MatchesTabProps) {
  const supabase = createClient()
  const { showToast } = useToast()

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

  // Reset form
  const [resetConfirmText, setResetConfirmText] = useState('')
  const [resetReason, setResetReason] = useState('')
  const [resetting, setResetting] = useState(false)

  // Manual advancement
  const [advancing, setAdvancing] = useState(false)

  // Conduct / Fair Play card entry (group stage only)
  const [showConductFields, setShowConductFields] = useState(false)
  const [homeYellowCards, setHomeYellowCards] = useState('0')
  const [homeIndirectReds, setHomeIndirectReds] = useState('0')
  const [homeDirectReds, setHomeDirectReds] = useState('0')
  const [homeYellowDirectReds, setHomeYellowDirectReds] = useState('0')
  const [awayYellowCards, setAwayYellowCards] = useState('0')
  const [awayIndirectReds, setAwayIndirectReds] = useState('0')
  const [awayDirectReds, setAwayDirectReds] = useState('0')
  const [awayYellowDirectReds, setAwayYellowDirectReds] = useState('0')

  // Stats
  const completedCount = matches.filter((m) => m.is_completed).length
  const scheduledCount = matches.filter((m) => m.status === 'scheduled').length
  const liveCount = matches.filter((m) => m.status === 'live').length

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

  async function openResultModal(match: SuperMatchData) {
    setHomeScore(match.home_score_ft?.toString() ?? '')
    setAwayScore(match.away_score_ft?.toString() ?? '')
    setPsoHome(match.home_score_pso?.toString() ?? '')
    setPsoAway(match.away_score_pso?.toString() ?? '')
    setResultType(match.home_score_pso !== null ? 'pso' : 'ft')
    setError(null)

    // Reset conduct fields
    setHomeYellowCards('0')
    setHomeIndirectReds('0')
    setHomeDirectReds('0')
    setHomeYellowDirectReds('0')
    setAwayYellowCards('0')
    setAwayIndirectReds('0')
    setAwayDirectReds('0')
    setAwayYellowDirectReds('0')
    setShowConductFields(false)

    // Fetch existing conduct data for group stage matches
    if (match.stage === 'group' && match.home_team_id && match.away_team_id) {
      const { data: conductData } = await supabase
        .from('match_conduct')
        .select('*')
        .eq('match_id', match.match_id)

      if (conductData && conductData.length > 0) {
        setShowConductFields(true)
        for (const row of conductData) {
          if (row.team_id === match.home_team_id) {
            setHomeYellowCards(row.yellow_cards?.toString() ?? '0')
            setHomeIndirectReds(row.indirect_red_cards?.toString() ?? '0')
            setHomeDirectReds(row.direct_red_cards?.toString() ?? '0')
            setHomeYellowDirectReds(row.yellow_direct_red_cards?.toString() ?? '0')
          } else if (row.team_id === match.away_team_id) {
            setAwayYellowCards(row.yellow_cards?.toString() ?? '0')
            setAwayIndirectReds(row.indirect_red_cards?.toString() ?? '0')
            setAwayDirectReds(row.direct_red_cards?.toString() ?? '0')
            setAwayYellowDirectReds(row.yellow_direct_red_cards?.toString() ?? '0')
          }
        }
      }
    }

    setModal({ type: 'enter_result', match })
  }

  function openResetModal(match: SuperMatchData) {
    setResetConfirmText('')
    setResetReason('')
    setError(null)
    setModal({ type: 'reset_match', match })
  }

  function openSetStatusModal(match: SuperMatchData, newStatus: 'live' | 'scheduled') {
    setError(null)
    setModal({ type: 'set_status', match, newStatus })
  }

  async function handleConfirmSetStatus() {
    if (modal.type !== 'set_status') return
    const { match, newStatus } = modal
    const label = newStatus === 'live' ? 'In Progress' : 'Scheduled'

    setSaving(true)
    setError(null)

    // When setting to live, also initialize scores to 0-0
    const updatePayload = newStatus === 'live'
      ? { status: newStatus, home_score_ft: 0, away_score_ft: 0 }
      : { status: newStatus }

    const { error: updateError } = await supabase
      .from('matches')
      .update(updatePayload)
      .eq('match_id', match.match_id)

    if (updateError) {
      setError('Failed to update match status: ' + updateError.message)
      setSaving(false)
      return
    }

    // When setting to live, recalculate leaderboards for all pools
    if (newStatus === 'live') {
      const { data: pools } = await supabase
        .from('pools')
        .select('pool_id, prediction_mode')
        .eq('tournament_id', match.tournament_id)

      if (pools) {
        for (const pool of pools) {
          if (pool.prediction_mode === 'bracket_picker') {
            try {
              await fetch(`/api/pools/${pool.pool_id}/bracket-picks/calculate`, { method: 'POST' })
            } catch (e) {
              console.error('Failed to recalculate bracket picker points for pool', pool.pool_id, e)
            }
          } else {
            await supabase.rpc('recalculate_all_pool_points', {
              pool_id_param: pool.pool_id,
            })
            try {
              await fetch(`/api/pools/${pool.pool_id}/bonus/calculate`, { method: 'POST' })
            } catch (e) {
              console.error('Failed to recalculate bonus points for pool', pool.pool_id, e)
            }
          }
        }
      }

      await refreshMatches()
      setSaving(false)
      setModal({ type: 'none' })
      showToast(
        `Match #${match.match_number} is now live (0-0). Leaderboards recalculated for ${pools?.length ?? 0} pool(s).`,
        'success'
      )
    } else {
      await refreshMatches()
      setSaving(false)
      setModal({ type: 'none' })
      showToast(`Match #${match.match_number} set to "${label}".`, 'success')
    }
  }

  function openLiveScoreModal(match: SuperMatchData) {
    setHomeScore(match.home_score_ft?.toString() ?? '0')
    setAwayScore(match.away_score_ft?.toString() ?? '0')
    setError(null)
    setModal({ type: 'update_live_score', match })
  }

  async function handleUpdateLiveScore() {
    if (modal.type !== 'update_live_score') return
    const match = modal.match

    const hScore = parseInt(homeScore)
    const aScore = parseInt(awayScore)

    if (isNaN(hScore) || isNaN(aScore) || hScore < 0 || aScore < 0) {
      setError('Scores must be non-negative integers.')
      return
    }

    setSaving(true)
    setError(null)

    // Step 1: Update the live scores (match stays as 'live')
    const { error: updateError } = await supabase
      .from('matches')
      .update({
        home_score_ft: hScore,
        away_score_ft: aScore,
      })
      .eq('match_id', match.match_id)

    if (updateError) {
      setError(updateError.message)
      setSaving(false)
      return
    }

    // Step 2: Recalculate points for all pools (now supports live matches with scores)
    const { data: pools } = await supabase
      .from('pools')
      .select('pool_id, prediction_mode')
      .eq('tournament_id', match.tournament_id)

    if (pools) {
      for (const pool of pools) {
        if (pool.prediction_mode === 'bracket_picker') {
          // Bracket picker pools use the BP calculate endpoint
          try {
            await fetch(`/api/pools/${pool.pool_id}/bracket-picks/calculate`, { method: 'POST' })
          } catch (e) {
            console.error('Failed to recalculate bracket picker points for pool', pool.pool_id, e)
          }
        } else {
          await supabase.rpc('recalculate_all_pool_points', {
            pool_id_param: pool.pool_id,
          })
          // Also recalculate bonus points
          try {
            await fetch(`/api/pools/${pool.pool_id}/bonus/calculate`, { method: 'POST' })
          } catch (e) {
            console.error('Failed to recalculate bonus points for pool', pool.pool_id, e)
          }
        }
      }
    }

    await refreshMatches()

    setSaving(false)
    setModal({ type: 'none' })
    showToast(
      `Live score updated to ${hScore}-${aScore}. Leaderboards recalculated for ${pools?.length ?? 0} pool(s).`,
      'success'
    )
  }

  async function refreshMatches() {
    const { data } = await supabase
      .from('matches')
      .select(
        `*, home_team:teams!matches_home_team_id_fkey(country_name), away_team:teams!matches_away_team_id_fkey(country_name), tournaments(name)`
      )
      .order('match_number', { ascending: true })

    if (data) {
      setMatches(
        data.map((m: any) => ({
          ...m,
          home_team: Array.isArray(m.home_team) ? m.home_team[0] ?? null : m.home_team,
          away_team: Array.isArray(m.away_team) ? m.away_team[0] ?? null : m.away_team,
          tournaments: Array.isArray(m.tournaments) ? m.tournaments[0] ?? null : m.tournaments,
        }))
      )
    }
  }

  async function refreshAuditLogs() {
    const { data } = await supabase
      .from('match_reset_log')
      .select(
        `*, matches(match_number, home_team:teams!matches_home_team_id_fkey(country_name), away_team:teams!matches_away_team_id_fkey(country_name)), users(username, email)`
      )
      .order('reset_at', { ascending: false })
      .limit(100)

    if (data) {
      setAuditLogs(
        data.map((a: any) => {
          const matchData = Array.isArray(a.matches) ? a.matches[0] ?? null : a.matches
          return {
            ...a,
            matches: matchData
              ? {
                  ...matchData,
                  home_team: Array.isArray(matchData.home_team)
                    ? matchData.home_team[0] ?? null
                    : matchData.home_team,
                  away_team: Array.isArray(matchData.away_team)
                    ? matchData.away_team[0] ?? null
                    : matchData.away_team,
                }
              : null,
            users: Array.isArray(a.users) ? a.users[0] ?? null : a.users,
          }
        })
      )
    }
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

    let psoH: number | null = null
    let psoA: number | null = null

    if (resultType === 'pso') {
      psoH = parseInt(psoHome)
      psoA = parseInt(psoAway)
      if (isNaN(psoH) || isNaN(psoA) || psoH < 0 || psoA < 0) {
        setError('Penalty shootout scores must be non-negative integers.')
        return
      }
      if (psoH === psoA) {
        setError('Penalty shootout scores cannot be tied.')
        return
      }
    }

    setSaving(true)
    setError(null)

    // Use the enter_match_result RPC function for proper point calculation
    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      'enter_match_result',
      {
        p_match_id: match.match_id,
        p_home_score: hScore,
        p_away_score: aScore,
        p_home_pso: psoH,
        p_away_pso: psoA,
      }
    )

    if (rpcError) {
      setError(rpcError.message)
      setSaving(false)
      return
    }

    // Save conduct data for group stage matches
    if (match.stage === 'group' && match.home_team_id && match.away_team_id) {
      const conductRows = [
        {
          match_id: match.match_id,
          team_id: match.home_team_id,
          yellow_cards: parseInt(homeYellowCards) || 0,
          indirect_red_cards: parseInt(homeIndirectReds) || 0,
          direct_red_cards: parseInt(homeDirectReds) || 0,
          yellow_direct_red_cards: parseInt(homeYellowDirectReds) || 0,
        },
        {
          match_id: match.match_id,
          team_id: match.away_team_id,
          yellow_cards: parseInt(awayYellowCards) || 0,
          indirect_red_cards: parseInt(awayIndirectReds) || 0,
          direct_red_cards: parseInt(awayDirectReds) || 0,
          yellow_direct_red_cards: parseInt(awayYellowDirectReds) || 0,
        },
      ]

      const { error: conductError } = await supabase
        .from('match_conduct')
        .upsert(conductRows, { onConflict: 'match_id,team_id' })

      if (conductError) {
        console.error('Failed to save conduct data:', conductError)
      }
    }

    // Recalculate bonus/bracket points for all pools linked to this tournament
    const { data: pools } = await supabase
      .from('pools')
      .select('pool_id, prediction_mode')
      .eq('tournament_id', match.tournament_id)

    let bonusInfo = ''
    if (pools && pools.length > 0) {
      for (const pool of pools) {
        try {
          // Use the appropriate calculation endpoint based on pool type
          const endpoint = pool.prediction_mode === 'bracket_picker'
            ? `/api/pools/${pool.pool_id}/bracket-picks/calculate`
            : `/api/pools/${pool.pool_id}/bonus/calculate`
          const res = await fetch(endpoint, { method: 'POST' })
          if (res.ok) {
            const data = await res.json()
            bonusInfo = ` Bonus: ${data.totalBonusEntries} entries (${data.totalBonusPoints} pts).`
          }
        } catch (e) {
          console.error('Failed to recalculate points for pool', pool.pool_id, e)
        }
      }
    }

    await refreshMatches()

    // Trigger team advancement for knockout matches
    let advanceInfo = ''
    try {
      const advanceRes = await fetch('/api/admin/advance-teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trigger: match.stage === 'group' ? 'group_complete' : 'knockout_result',
          match_id: match.match_id,
        }),
      })
      if (advanceRes.ok) {
        const advanceData = await advanceRes.json()
        if (advanceData.advanced.length > 0) {
          advanceInfo = ` Teams advanced: ${advanceData.advanced.map(
            (a: any) => `#${a.match_number} ${a.side}: ${a.country_name}`
          ).join(', ')}.`
          await refreshMatches()
        }
      }
    } catch (e) {
      console.error('Failed to advance teams:', e)
    }

    const result = rpcResult as { predictions_processed?: number } | null
    const processed = result?.predictions_processed ?? 0
    setSaving(false)
    setModal({ type: 'none' })
    showToast(
      `Match result saved. Points calculated for ${processed} predictions across all pools.${bonusInfo}${advanceInfo}`,
      'success'
    )
  }

  async function handleResetMatch() {
    if (modal.type !== 'reset_match') return
    const match = modal.match

    if (resetConfirmText !== 'RESET') {
      setError('Type RESET to confirm.')
      return
    }

    setResetting(true)
    setError(null)

    const { error: rpcError } = await supabase.rpc('reset_match_scores', {
      match_id_param: match.match_id,
      reset_reason: resetReason || 'Manual reset by super admin',
    })

    if (rpcError) {
      setError(rpcError.message)
      setResetting(false)
      return
    }

    // Recalculate bonus/bracket points for all pools after reset
    const { data: resetPools } = await supabase
      .from('pools')
      .select('pool_id, prediction_mode')
      .eq('tournament_id', match.tournament_id)

    if (resetPools) {
      for (const pool of resetPools) {
        try {
          const endpoint = pool.prediction_mode === 'bracket_picker'
            ? `/api/pools/${pool.pool_id}/bracket-picks/calculate`
            : `/api/pools/${pool.pool_id}/bonus/calculate`
          await fetch(endpoint, { method: 'POST' })
        } catch (e) {
          console.error('Failed to recalculate points for pool', pool.pool_id, e)
        }
      }
    }

    await Promise.all([refreshMatches(), refreshAuditLogs()])

    // Clear advanced teams from downstream matches
    let clearInfo = ''
    try {
      const advanceRes = await fetch('/api/admin/advance-teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trigger: 'match_reset',
          match_id: match.match_id,
        }),
      })
      if (advanceRes.ok) {
        const advanceData = await advanceRes.json()
        if (advanceData.cleared.length > 0) {
          clearInfo = ` Cleared ${advanceData.cleared.length} team advancement(s).`
          await refreshMatches()
        }
      }
    } catch (e) {
      console.error('Failed to clear advanced teams:', e)
    }

    setResetting(false)
    setModal({ type: 'none' })
    showToast(`Match has been reset. All affected pool points recalculated.${clearInfo}`, 'success')
  }

  async function handleManualAdvance() {
    if (!confirm('Run team advancement for all completed matches?')) return
    setAdvancing(true)
    try {
      const res = await fetch('/api/admin/advance-teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trigger: 'manual' }),
      })
      if (res.ok) {
        const data = await res.json()
        showToast(data.message, 'success')
        if (data.advanced.length > 0) {
          await refreshMatches()
        }
      } else {
        const err = await res.json()
        showToast(`Error: ${err.error}`, 'error')
      }
    } catch (e) {
      showToast('Failed to advance teams.', 'error')
    }
    setAdvancing(false)
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-center sm:justify-between gap-3 mb-6">
        <h2 className="text-2xl font-bold text-neutral-900 dark:text-white">Match Results</h2>
        <div className="flex gap-3 items-center text-sm">
          <span className="px-3 py-1 bg-success-100 text-success-700 rounded-full font-medium">
            {completedCount} Completed
          </span>
          {liveCount > 0 && (
            <span className="px-3 py-1 bg-warning-100 text-warning-700 rounded-full font-medium">
              {liveCount} Live
            </span>
          )}
          <span className="px-3 py-1 bg-primary-100 text-primary-700 rounded-full font-medium">
            {scheduledCount} Scheduled
          </span>
          <Button size="sm" variant="primary" onClick={handleManualAdvance} loading={advancing} loadingText="Advancing...">
            Advance Teams
          </Button>
        </div>
      </div>


      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <select
          value={stageFilter}
          onChange={(e) => {
            setStageFilter(e.target.value)
            if (e.target.value !== 'group') setGroupFilter('all')
          }}
          className="px-3 py-2 border border-neutral-300 dark:border-neutral-500 rounded-lg text-sm text-neutral-700 dark:text-neutral-200 bg-white dark:bg-neutral-800"
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
          className="px-3 py-2 border border-neutral-300 dark:border-neutral-500 rounded-lg text-sm text-neutral-700 dark:text-neutral-200 bg-white dark:bg-neutral-800"
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
            className="px-3 py-2 border border-neutral-300 dark:border-neutral-500 rounded-lg text-sm text-neutral-700 dark:text-neutral-200 bg-white dark:bg-neutral-800"
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

      {/* Matches — mobile cards */}
      <div className="sm:hidden space-y-3">
        {filteredMatches.length === 0 ? (
          <div className="bg-surface rounded-lg shadow dark:shadow-none dark:border dark:border-border-default p-8 text-center text-neutral-600 dark:text-neutral-400">
            No matches found with current filters.
          </div>
        ) : (
          filteredMatches.map((match) => {
            const home = match.home_team?.country_name || match.home_team_placeholder || 'TBD'
            const away = match.away_team?.country_name || match.away_team_placeholder || 'TBD'
            const matchDate = new Date(match.match_date)
            return (
              <div key={match.match_id} className="bg-surface rounded-lg shadow dark:shadow-none dark:border dark:border-border-default p-4">
                {/* Top row: match #, stage, status */}
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-mono font-semibold text-neutral-700 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 rounded">
                    #{match.match_number}
                  </span>
                  <Badge variant="blue">
                    {getStageName(match.stage)}{match.group_letter ? ` ${match.group_letter}` : ''}
                  </Badge>
                  <Badge variant={getStatusBadgeVariant(match.status)}>
                    {match.status}
                  </Badge>
                  <span className="ml-auto text-xs text-neutral-500 dark:text-neutral-400">
                    {matchDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}{' '}
                    {matchDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </span>
                </div>
                {/* Teams + score */}
                <div className="flex items-center justify-between mb-3">
                  <div className="font-medium text-neutral-900 dark:text-white">
                    {home} <span className="text-neutral-400 mx-1">vs</span> {away}
                  </div>
                  <div className="text-right flex-shrink-0 ml-3">
                    {match.is_completed ? (
                      <span className="font-bold text-neutral-900 dark:text-white">
                        {match.home_score_ft} - {match.away_score_ft}
                        {match.home_score_pso !== null && (
                          <span className="text-xs text-neutral-500 block">PSO: {match.home_score_pso}-{match.away_score_pso}</span>
                        )}
                      </span>
                    ) : match.status === 'live' && match.home_score_ft !== null ? (
                      <span className="font-bold text-warning-700">
                        {match.home_score_ft} - {match.away_score_ft}
                        <span className="text-xs text-warning-500 block">provisional</span>
                      </span>
                    ) : (
                      <span className="text-neutral-400">—</span>
                    )}
                  </div>
                </div>
                {/* Actions */}
                <div className="flex flex-wrap gap-2">
                  {match.status === 'scheduled' && (
                    <Button size="sm" variant="warning" onClick={() => openSetStatusModal(match, 'live')}>Set Live</Button>
                  )}
                  {match.status === 'live' && (
                    <>
                      <Button size="sm" variant="warning" onClick={() => openLiveScoreModal(match)}>Update Score</Button>
                      <Button size="sm" variant="gray" onClick={() => openSetStatusModal(match, 'scheduled')}>Set Scheduled</Button>
                    </>
                  )}
                  {match.status !== 'cancelled' && (
                    <Button size="sm" variant="primary" onClick={() => openResultModal(match)}>
                      {match.is_completed ? 'Edit Result' : 'Enter Result'}
                    </Button>
                  )}
                  {match.is_completed && (
                    <Button size="sm" variant="primary" className="!bg-neutral-800 hover:!bg-neutral-900" onClick={() => openResetModal(match)}>Reset</Button>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Matches — desktop table */}
      <div className="hidden sm:block bg-surface rounded-lg shadow dark:shadow-none dark:border dark:border-border-default overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-neutral-50 dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-neutral-700 dark:text-neutral-300 uppercase">
                  #
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-neutral-700 dark:text-neutral-300 uppercase">
                  Stage
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-neutral-700 dark:text-neutral-300 uppercase">
                  Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-neutral-700 dark:text-neutral-300 uppercase">
                  Match
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-neutral-700 dark:text-neutral-300 uppercase">
                  Status
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-neutral-700 dark:text-neutral-300 uppercase">
                  Score
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-neutral-700 dark:text-neutral-300 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
              {filteredMatches.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-neutral-600">
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
                  const matchDate = new Date(match.match_date)

                  return (
                    <tr key={match.match_id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800">
                      <td className="px-4 py-3">
                        <span className="text-xs font-mono font-semibold text-neutral-700 bg-neutral-100 px-2 py-1 rounded">
                          #{match.match_number}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="blue">
                          {getStageName(match.stage)}
                          {match.group_letter ? ` ${match.group_letter}` : ''}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-sm text-neutral-600 whitespace-nowrap">
                        {matchDate.toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                        <br />
                        <span className="text-xs text-neutral-500">
                          {matchDate.toLocaleTimeString('en-US', {
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-neutral-900">
                          {home}
                        </span>
                        <span className="text-neutral-500 mx-2">vs</span>
                        <span className="font-medium text-neutral-900">
                          {away}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={getStatusBadgeVariant(match.status)}>
                          {match.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {match.is_completed ? (
                          <span className="font-bold text-neutral-900">
                            {match.home_score_ft} - {match.away_score_ft}
                            {match.home_score_pso !== null && (
                              <span className="text-xs text-neutral-500 block">
                                PSO: {match.home_score_pso}-
                                {match.away_score_pso}
                              </span>
                            )}
                          </span>
                        ) : match.status === 'live' && match.home_score_ft !== null ? (
                          <span className="font-bold text-warning-700">
                            {match.home_score_ft} - {match.away_score_ft}
                            <span className="text-xs text-warning-500 block">
                              provisional
                            </span>
                          </span>
                        ) : (
                          <span className="text-neutral-500">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex gap-2 justify-end">
                          {match.status === 'scheduled' && (
                            <Button size="sm" variant="warning" onClick={() => openSetStatusModal(match, 'live')}>
                              Set Live
                            </Button>
                          )}
                          {match.status === 'live' && (
                            <>
                              <Button size="sm" variant="warning" onClick={() => openLiveScoreModal(match)}>
                                Update Score
                              </Button>
                              <Button size="sm" variant="gray" onClick={() => openSetStatusModal(match, 'scheduled')}>
                                Set Scheduled
                              </Button>
                            </>
                          )}
                          {match.status !== 'cancelled' && (
                            <Button size="sm" variant="primary" onClick={() => openResultModal(match)}>
                              {match.is_completed
                                ? 'Edit Result'
                                : 'Enter Result'}
                            </Button>
                          )}
                          {match.is_completed && (
                            <Button size="sm" variant="primary" className="!bg-neutral-800 hover:!bg-neutral-900" onClick={() => openResetModal(match)}>
                              Reset
                            </Button>
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
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
          <div className="fixed inset-0 bg-black/50" />
          <div className="relative bg-surface rounded-t-xl sm:rounded-xl shadow-xl sm:max-w-lg w-full p-6 dark:shadow-none dark:border dark:border-border-default">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 bg-danger-500 rounded-full" />
              <h3 className="text-xl font-bold text-neutral-900">
                {modal.match.is_completed ? 'Edit' : 'Enter'} Match Result
              </h3>
            </div>
            <p className="text-sm text-neutral-600 mb-2">
              Match #{modal.match.match_number}:{' '}
              {modal.match.home_team?.country_name ||
                modal.match.home_team_placeholder ||
                'TBD'}{' '}
              vs{' '}
              {modal.match.away_team?.country_name ||
                modal.match.away_team_placeholder ||
                'TBD'}
            </p>
            <p className="text-xs text-neutral-500 mb-6">
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

            <div className="flex items-start gap-3 bg-warning-50 border border-warning-200 rounded-lg px-4 py-2 mb-4">
              <svg className="w-5 h-5 text-warning-700 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <p className="text-xs text-warning-700 leading-5">
                This will calculate/recalculate points for ALL pools linked to this tournament.
              </p>
            </div>

            {error && <Alert variant="error" className="mb-4">{error}</Alert>}

            {/* Score inputs */}
            <div className="flex items-center justify-center gap-4 mb-6">
              <div className="text-center">
                <p className="text-sm font-medium text-neutral-600 mb-2">
                  {modal.match.home_team?.country_name ||
                    modal.match.home_team_placeholder ||
                    'Home'}
                </p>
                <input
                  type="number"
                  min="0"
                  value={homeScore}
                  onChange={(e) => setHomeScore(e.target.value)}
                  className="w-20 h-14 text-center text-2xl font-bold border border-neutral-300 rounded-lg focus:ring-2 focus:ring-danger-500 focus:border-transparent text-neutral-900"
                />
              </div>
              <span className="text-2xl font-bold text-neutral-500 mt-6">-</span>
              <div className="text-center">
                <p className="text-sm font-medium text-neutral-600 mb-2">
                  {modal.match.away_team?.country_name ||
                    modal.match.away_team_placeholder ||
                    'Away'}
                </p>
                <input
                  type="number"
                  min="0"
                  value={awayScore}
                  onChange={(e) => setAwayScore(e.target.value)}
                  className="w-20 h-14 text-center text-2xl font-bold border border-neutral-300 rounded-lg focus:ring-2 focus:ring-danger-500 focus:border-transparent text-neutral-900"
                />
              </div>
            </div>

            {/* Match completion type (knockout only) */}
            {modal.match.stage !== 'group' && (
              <div className="mb-6">
                <p className="text-sm font-medium text-neutral-700 mb-2">
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
                      className="text-danger-600"
                    />
                    <span className="text-sm text-neutral-700">
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
                      className="text-danger-600"
                    />
                    <span className="text-sm text-neutral-700">
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
                      className="text-danger-600"
                    />
                    <span className="text-sm text-neutral-700">
                      Penalty Shootout
                    </span>
                  </label>
                </div>

                {/* PSO score inputs */}
                {resultType === 'pso' && (
                  <div className="flex items-center justify-center gap-4 mt-4 p-4 bg-neutral-50 dark:bg-neutral-800 rounded-lg">
                    <div className="text-center">
                      <p className="text-xs text-neutral-600 mb-1">PSO</p>
                      <input
                        type="number"
                        min="0"
                        value={psoHome}
                        onChange={(e) => setPsoHome(e.target.value)}
                        className="w-16 h-10 text-center text-lg font-bold border border-neutral-300 rounded-lg focus:ring-2 focus:ring-danger-500 focus:border-transparent text-neutral-900"
                      />
                    </div>
                    <span className="text-lg font-bold text-neutral-500 mt-4">
                      -
                    </span>
                    <div className="text-center">
                      <p className="text-xs text-neutral-600 mb-1">PSO</p>
                      <input
                        type="number"
                        min="0"
                        value={psoAway}
                        onChange={(e) => setPsoAway(e.target.value)}
                        className="w-16 h-10 text-center text-lg font-bold border border-neutral-300 rounded-lg focus:ring-2 focus:ring-danger-500 focus:border-transparent text-neutral-900"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Fair Play Cards (group stage only) */}
            {modal.match.stage === 'group' && (
              <div className="mb-6">
                <button
                  type="button"
                  onClick={() => setShowConductFields(!showConductFields)}
                  className="flex items-center gap-2 text-sm font-medium text-neutral-700 hover:text-neutral-900 transition"
                >
                  <svg
                    className={`w-4 h-4 transition-transform ${showConductFields ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                  Fair Play Cards (Optional)
                </button>

                {showConductFields && (
                  <div className="mt-3 bg-neutral-50 dark:bg-neutral-800 rounded-lg p-4">
                    <p className="text-xs text-neutral-500 mb-4">
                      Enter card counts per team. Each count represents distinct player incidents.
                      Used as FIFA tiebreaker in group standings.
                    </p>
                    <div className="grid grid-cols-2 gap-6">
                      {/* Home team cards */}
                      <div>
                        <p className="text-xs font-semibold text-neutral-700 mb-3">
                          {modal.match.home_team?.country_name || 'Home'}
                        </p>
                        <div className="space-y-2">
                          <CardInput label="Yellow cards" value={homeYellowCards} onChange={setHomeYellowCards} color="yellow" />
                          <CardInput label="2nd Yellow (indirect red)" value={homeIndirectReds} onChange={setHomeIndirectReds} color="amber" />
                          <CardInput label="Direct red cards" value={homeDirectReds} onChange={setHomeDirectReds} color="red" />
                          <CardInput label="Yellow + Direct red" value={homeYellowDirectReds} onChange={setHomeYellowDirectReds} color="rose" />
                        </div>
                      </div>
                      {/* Away team cards */}
                      <div>
                        <p className="text-xs font-semibold text-neutral-700 mb-3">
                          {modal.match.away_team?.country_name || 'Away'}
                        </p>
                        <div className="space-y-2">
                          <CardInput label="Yellow cards" value={awayYellowCards} onChange={setAwayYellowCards} color="yellow" />
                          <CardInput label="2nd Yellow (indirect red)" value={awayIndirectReds} onChange={setAwayIndirectReds} color="amber" />
                          <CardInput label="Direct red cards" value={awayDirectReds} onChange={setAwayDirectReds} color="red" />
                          <CardInput label="Yellow + Direct red" value={awayYellowDirectReds} onChange={setAwayYellowDirectReds} color="rose" />
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 text-[10px] text-neutral-400 space-y-0.5">
                      <p>Yellow = -1 | 2nd Yellow (indirect red) = -3 | Direct red = -4 | Yellow + Direct red = -5</p>
                      <p>Only one deduction per player per match (the highest). Higher score (closer to 0) is better.</p>
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
                loadingText="Saving & Calculating..."
              >
                Save &amp; Calculate Points
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Update Live Score Modal */}
      {modal.type === 'update_live_score' && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
          <div className="fixed inset-0 bg-black/50" />
          <div className="relative bg-surface rounded-t-xl sm:rounded-xl shadow-xl sm:max-w-lg w-full p-6 dark:shadow-none dark:border dark:border-border-default">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-3 h-3 bg-warning-500 rounded-full animate-pulse" />
              <h3 className="text-xl font-bold text-neutral-900">
                Update Live Score
              </h3>
            </div>
            <p className="text-sm text-neutral-600 mb-2">
              Match #{modal.match.match_number}:{' '}
              {modal.match.home_team?.country_name ||
                modal.match.home_team_placeholder ||
                'TBD'}{' '}
              vs{' '}
              {modal.match.away_team?.country_name ||
                modal.match.away_team_placeholder ||
                'TBD'}
            </p>
            <p className="text-xs text-neutral-500 mb-6">
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

            <div className="flex items-start gap-3 bg-warning-50 border border-warning-200 rounded-lg px-4 py-2 mb-4">
              <svg className="w-5 h-5 text-warning-700 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <p className="text-xs text-warning-700 leading-5">
                This updates the provisional score and recalculates leaderboards in real time.
                The match will remain &quot;Live&quot; until you finalize it with &quot;Enter Result&quot;.
              </p>
            </div>

            {error && <Alert variant="error" className="mb-4">{error}</Alert>}

            {/* Score inputs */}
            <div className="flex items-center justify-center gap-4 mb-6">
              <div className="text-center">
                <p className="text-sm font-medium text-neutral-600 mb-2">
                  {modal.match.home_team?.country_name ||
                    modal.match.home_team_placeholder ||
                    'Home'}
                </p>
                <input
                  type="number"
                  min="0"
                  value={homeScore}
                  onChange={(e) => setHomeScore(e.target.value)}
                  className="w-20 h-14 text-center text-2xl font-bold border border-warning-300 rounded-lg focus:ring-2 focus:ring-warning-500 focus:border-transparent text-neutral-900"
                />
              </div>
              <span className="text-2xl font-bold text-neutral-500 mt-6">-</span>
              <div className="text-center">
                <p className="text-sm font-medium text-neutral-600 mb-2">
                  {modal.match.away_team?.country_name ||
                    modal.match.away_team_placeholder ||
                    'Away'}
                </p>
                <input
                  type="number"
                  min="0"
                  value={awayScore}
                  onChange={(e) => setAwayScore(e.target.value)}
                  className="w-20 h-14 text-center text-2xl font-bold border border-warning-300 rounded-lg focus:ring-2 focus:ring-warning-500 focus:border-transparent text-neutral-900"
                />
              </div>
            </div>

            <div className="flex gap-3 justify-end">
              <Button
                variant="gray"
                onClick={() => setModal({ type: 'none' })}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                variant="warning"
                onClick={handleUpdateLiveScore}
                loading={saving}
                loadingText="Updating..."
              >
                Update Score &amp; Recalculate
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Match Modal */}
      {modal.type === 'reset_match' && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
          <div className="fixed inset-0 bg-black/50" />
          <div className="relative bg-surface rounded-t-xl sm:rounded-xl shadow-xl sm:max-w-lg w-full p-6 dark:shadow-none dark:border dark:border-border-default">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-3 h-3 bg-danger-600 rounded-full animate-pulse" />
              <h3 className="text-xl font-bold text-danger-700">
                Reset Match Result
              </h3>
            </div>

            <div className="bg-danger-50 border border-danger-200 rounded-lg p-4 mb-4">
              <p className="text-sm text-danger-700 font-medium mb-2">
                WARNING: This is a destructive action!
              </p>
              <p className="text-sm text-danger-600">
                Resetting Match #{modal.match.match_number} (
                {modal.match.home_team?.country_name || 'TBD'} vs{' '}
                {modal.match.away_team?.country_name || 'TBD'}) will:
              </p>
              <ul className="list-disc list-inside text-sm text-danger-600 mt-2 space-y-1">
                <li>Clear the match score ({modal.match.home_score_ft}-{modal.match.away_score_ft}
                  {modal.match.home_score_pso !== null && ` PSO: ${modal.match.home_score_pso}-${modal.match.away_score_pso}`})
                </li>
                <li>Reset match status to &quot;scheduled&quot;</li>
                <li>Recalculate points for ALL affected pools</li>
                <li>Log this action in the audit trail</li>
              </ul>
            </div>

            {error && <Alert variant="error" className="mb-4">{error}</Alert>}

            <div className="mb-4">
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Reason for reset
              </label>
              <input
                type="text"
                value={resetReason}
                onChange={(e) => setResetReason(e.target.value)}
                placeholder="e.g., Incorrect score entered"
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm text-neutral-900 focus:ring-2 focus:ring-danger-500 focus:border-transparent"
              />
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Type <span className="font-bold text-danger-600">RESET</span> to confirm
              </label>
              <input
                type="text"
                value={resetConfirmText}
                onChange={(e) => setResetConfirmText(e.target.value)}
                placeholder="RESET"
                className="w-full px-3 py-2 border border-danger-300 rounded-lg text-sm text-neutral-900 focus:ring-2 focus:ring-danger-500 focus:border-transparent"
              />
            </div>

            <div className="flex gap-3 justify-end">
              <Button
                variant="gray"
                onClick={() => setModal({ type: 'none' })}
                disabled={resetting}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={handleResetMatch}
                disabled={resetConfirmText !== 'RESET'}
                loading={resetting}
                loadingText="Resetting..."
              >
                Reset Match
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Set Match Status Modal */}
      {modal.type === 'set_status' && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => { if (!saving) setModal({ type: 'none' }) }} />
          <div className="relative bg-surface rounded-t-xl sm:rounded-xl shadow-xl sm:max-w-sm w-full p-6 dark:shadow-none dark:border dark:border-border-default">
            <h3 className="text-lg font-bold text-neutral-900 mb-2">
              {modal.newStatus === 'live' ? 'Set Match Live' : 'Set Match Scheduled'}
            </h3>
            <p className="text-sm text-neutral-600 mb-4">
              Set Match #{modal.match.match_number} ({modal.match.home_team?.country_name || modal.match.home_team_placeholder || 'TBD'} vs {modal.match.away_team?.country_name || modal.match.away_team_placeholder || 'TBD'}) to{' '}
              <strong>{modal.newStatus === 'live' ? 'In Progress' : 'Scheduled'}</strong>?
            </p>
            {error && <Alert variant="error" className="mb-4">{error}</Alert>}
            <div className="flex gap-3">
              <Button
                variant="gray"
                onClick={() => setModal({ type: 'none' })}
                disabled={saving}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                variant={modal.newStatus === 'live' ? 'warning' : 'primary'}
                onClick={handleConfirmSetStatus}
                disabled={saving}
                loading={saving}
                loadingText="Updating..."
                className="flex-1"
              >
                {modal.newStatus === 'live' ? 'Set Live' : 'Set Scheduled'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
