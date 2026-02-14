'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { PoolData, MemberData, PredictionData, MatchData } from './page'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { Input } from '@/components/ui/Input'

type MembersTabProps = {
  pool: PoolData
  members: MemberData[]
  setMembers: (members: MemberData[]) => void
  predictions: PredictionData[]
  matches: MatchData[]
  currentUserId: string
}

type ModalState =
  | { type: 'none' }
  | { type: 'view_predictions'; member: MemberData }
  | { type: 'adjust_points'; member: MemberData }
  | { type: 'promote'; member: MemberData }
  | { type: 'demote'; member: MemberData }
  | { type: 'remove'; member: MemberData }

export function MembersTab({
  pool,
  members,
  setMembers,
  predictions,
  matches,
  currentUserId,
}: MembersTabProps) {
  const supabase = createClient()

  const [modal, setModal] = useState<ModalState>({ type: 'none' })
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'rank' | 'points' | 'username' | 'joined'>('rank')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Adjust points state
  const [pointAdjustment, setPointAdjustment] = useState(0)
  const [adjustReason, setAdjustReason] = useState('')

  // Remove confirmation
  const [removeConfirmed, setRemoveConfirmed] = useState(false)

  // Pool code copy state
  const [copied, setCopied] = useState(false)

  const adminCount = members.filter((m) => m.role === 'admin').length

  // Sort and filter
  const filteredMembers = members
    .filter((m) => {
      if (!search) return true
      const q = search.toLowerCase()
      return (
        m.users.username.toLowerCase().includes(q) ||
        m.users.full_name.toLowerCase().includes(q)
      )
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'rank':
          return (a.current_rank ?? 999) - (b.current_rank ?? 999)
        case 'points':
          return (b.total_points ?? 0) - (a.total_points ?? 0)
        case 'username':
          return a.users.username.localeCompare(b.users.username)
        case 'joined':
          return (
            new Date(b.joined_at).getTime() - new Date(a.joined_at).getTime()
          )
        default:
          return 0
      }
    })

  async function refreshMembers() {
    const { data } = await supabase
      .from('pool_members')
      .select('*, users!inner(user_id, username, full_name, email)')
      .eq('pool_id', pool.pool_id)
      .order('current_rank', { ascending: true, nullsFirst: false })

    if (data) setMembers(data as MemberData[])
  }

  async function handlePromote(member: MemberData) {
    setLoading(true)
    const { error } = await supabase
      .from('pool_members')
      .update({ role: 'admin' })
      .eq('member_id', member.member_id)

    if (error) {
      setError(error.message)
    } else {
      setSuccess(`${member.users.username} promoted to admin.`)
      await refreshMembers()
    }
    setLoading(false)
    setModal({ type: 'none' })
  }

  async function handleDemote(member: MemberData) {
    if (adminCount <= 1) {
      setError('Cannot demote the only admin.')
      setModal({ type: 'none' })
      return
    }

    setLoading(true)
    const { error } = await supabase
      .from('pool_members')
      .update({ role: 'player' })
      .eq('member_id', member.member_id)

    if (error) {
      setError(error.message)
    } else {
      setSuccess(`${member.users.username} demoted to player.`)
      await refreshMembers()
    }
    setLoading(false)
    setModal({ type: 'none' })
  }

  async function handleRemove(member: MemberData) {
    setLoading(true)

    // Delete predictions first
    const { error: predError } = await supabase
      .from('predictions')
      .delete()
      .eq('member_id', member.member_id)

    if (predError) {
      setError('Failed to delete predictions: ' + predError.message)
      setLoading(false)
      return
    }

    // Delete member
    const { error: memError } = await supabase
      .from('pool_members')
      .delete()
      .eq('member_id', member.member_id)

    if (memError) {
      setError('Failed to remove member: ' + memError.message)
      setLoading(false)
      return
    }

    setSuccess(`${member.users.username} removed from pool.`)
    await refreshMembers()
    setLoading(false)
    setModal({ type: 'none' })
    setRemoveConfirmed(false)
  }

  async function handleAdjustPoints(member: MemberData) {
    if (!adjustReason.trim()) {
      setError('Please provide a reason for the adjustment.')
      return
    }

    setLoading(true)
    const newTotal = (member.total_points ?? 0) + pointAdjustment

    const { error } = await supabase
      .from('pool_members')
      .update({ total_points: newTotal })
      .eq('member_id', member.member_id)

    if (error) {
      setError(error.message)
    } else {
      setSuccess(
        `Points adjusted for ${member.users.username}: ${pointAdjustment > 0 ? '+' : ''}${pointAdjustment} (New total: ${newTotal})`
      )
      await refreshMembers()
    }
    setLoading(false)
    setModal({ type: 'none' })
    setPointAdjustment(0)
    setAdjustReason('')
  }

  function copyPoolCode() {
    navigator.clipboard.writeText(pool.pool_code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Pool Members</h2>

      {error && (
        <Alert variant="error" className="mb-4">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-2 text-red-800 font-bold"
          >
            x
          </button>
        </Alert>
      )}
      {success && (
        <Alert variant="success" className="mb-4">
          {success}
          <button
            onClick={() => setSuccess(null)}
            className="ml-2 text-green-800 font-bold"
          >
            x
          </button>
        </Alert>
      )}

      {/* Invite Section */}
      <Card className="mb-6">
        <h3 className="font-semibold text-gray-900 mb-3">Invite Members</h3>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Pool Code:</span>
            <span className="font-mono font-bold text-lg text-gray-900 bg-gray-100 px-3 py-1 rounded">
              {pool.pool_code}
            </span>
            <button
              onClick={copyPoolCode}
              className="text-xs px-3 py-1.5 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 font-medium transition"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
      </Card>

      {/* Search and Sort */}
      <div className="flex flex-wrap gap-3 mb-4">
        <Input
          type="text"
          placeholder="Search by username..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 bg-white"
        >
          <option value="rank">Sort by Rank</option>
          <option value="points">Sort by Points</option>
          <option value="username">Sort by Username</option>
          <option value="joined">Sort by Joined Date</option>
        </select>
      </div>

      {/* Members Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Rank
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Member
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Points
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                  Predictions
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                  Role
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Joined
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredMembers.map((member) => {
                const isCurrentUser = member.user_id === currentUserId

                return (
                  <tr
                    key={member.member_id}
                    className={isCurrentUser ? 'bg-blue-50' : 'hover:bg-gray-50'}
                  >
                    <td className="px-4 py-3">
                      <span className="text-sm font-bold text-gray-900">
                        #{member.current_rank || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {member.users.username}
                          {isCurrentUser && (
                            <span className="text-xs text-blue-500 ml-1">
                              (you)
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-gray-500">
                          {member.users.full_name}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-lg font-bold text-blue-600">
                        {member.total_points ?? 0}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {member.has_submitted_predictions ? (
                        <Badge variant="green">Submitted</Badge>
                      ) : (
                        <Badge variant="yellow">Pending</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge
                        variant={member.role === 'admin' ? 'blue' : 'gray'}
                      >
                        {member.role === 'admin' ? 'Admin' : 'Player'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {new Date(member.joined_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="relative inline-block">
                        <select
                          defaultValue=""
                          onChange={(e) => {
                            const action = e.target.value
                            e.target.value = ''
                            setError(null)
                            setSuccess(null)
                            switch (action) {
                              case 'view_predictions':
                                setModal({
                                  type: 'view_predictions',
                                  member,
                                })
                                break
                              case 'adjust_points':
                                setPointAdjustment(0)
                                setAdjustReason('')
                                setModal({ type: 'adjust_points', member })
                                break
                              case 'promote':
                                setModal({ type: 'promote', member })
                                break
                              case 'demote':
                                setModal({ type: 'demote', member })
                                break
                              case 'remove':
                                setRemoveConfirmed(false)
                                setModal({ type: 'remove', member })
                                break
                            }
                          }}
                          className="text-xs px-2 py-1.5 border border-gray-300 rounded bg-white text-gray-700 cursor-pointer"
                        >
                          <option value="" disabled>
                            Actions
                          </option>
                          <option value="view_predictions">
                            View Predictions
                          </option>
                          <option value="adjust_points">Adjust Points</option>
                          {member.role === 'player' && (
                            <option value="promote">Promote to Admin</option>
                          )}
                          {member.role === 'admin' && adminCount > 1 && (
                            <option value="demote">Demote to Player</option>
                          )}
                          {member.role === 'player' && (
                            <option value="remove">Remove from Pool</option>
                          )}
                        </select>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* View Predictions Modal */}
      {modal.type === 'view_predictions' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 p-6 max-h-[80vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-gray-900 mb-1">
              {modal.member.users.full_name || modal.member.users.username}
              &apos;s Predictions
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              Total points: {modal.member.total_points ?? 0}
            </p>

            {(() => {
              const memberPreds = predictions.filter(
                (p) => p.member_id === modal.member.member_id
              )
              if (memberPreds.length === 0) {
                return (
                  <p className="text-gray-500 text-sm py-4">
                    No predictions submitted.
                  </p>
                )
              }

              // Group by stage
              const byStage: Record<string, typeof memberPreds> = {}
              memberPreds.forEach((pred) => {
                const match = matches.find(
                  (m) => m.match_id === pred.match_id
                )
                const stage = match?.stage || 'unknown'
                if (!byStage[stage]) byStage[stage] = []
                byStage[stage].push(pred)
              })

              const stageNames: Record<string, string> = {
                group: 'Group Stage',
                round_32: 'Round of 32',
                round_16: 'Round of 16',
                quarter_final: 'Quarter Final',
                semi_final: 'Semi Final',
                third_place: 'Third Place',
                final: 'Final',
              }

              return Object.entries(byStage).map(([stage, preds]) => (
                <div key={stage} className="mb-4">
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">
                    {stageNames[stage] || stage}
                  </h4>
                  <div className="space-y-1">
                    {preds.map((pred) => {
                      const match = matches.find(
                        (m) => m.match_id === pred.match_id
                      )
                      if (!match) return null
                      const home =
                        match.home_team?.country_name ||
                        match.home_team_placeholder ||
                        'TBD'
                      const away =
                        match.away_team?.country_name ||
                        match.away_team_placeholder ||
                        'TBD'

                      return (
                        <div
                          key={pred.prediction_id}
                          className="flex items-center justify-between bg-gray-50 rounded px-3 py-1.5 text-sm"
                        >
                          <span className="text-gray-600">
                            #{match.match_number}: {home} vs {away}
                          </span>
                          <span className="font-mono font-bold text-gray-900">
                            {pred.predicted_home_score}-
                            {pred.predicted_away_score}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))
            })()}

            <div className="mt-4 flex justify-end">
              <Button variant="gray" onClick={() => setModal({ type: 'none' })}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Adjust Points Modal */}
      {modal.type === 'adjust_points' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              Adjust Points - {modal.member.users.username}
            </h3>

            {error && <Alert variant="error" className="mb-4">{error}</Alert>}

            <div className="mb-4">
              <p className="text-sm text-gray-600">
                Current points:{' '}
                <span className="font-bold">
                  {modal.member.total_points ?? 0}
                </span>
              </p>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Adjustment
              </label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPointAdjustment((p) => p - 1)}
                  className="w-10 h-10 rounded border border-gray-300 text-lg font-bold text-gray-700 hover:bg-gray-100"
                >
                  -
                </button>
                <input
                  type="number"
                  value={pointAdjustment}
                  onChange={(e) =>
                    setPointAdjustment(parseInt(e.target.value) || 0)
                  }
                  className="w-24 h-10 text-center border border-gray-300 rounded-lg font-bold text-lg text-gray-900"
                />
                <button
                  onClick={() => setPointAdjustment((p) => p + 1)}
                  className="w-10 h-10 rounded border border-gray-300 text-lg font-bold text-gray-700 hover:bg-gray-100"
                >
                  +
                </button>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reason (required)
              </label>
              <textarea
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                placeholder="Explain the reason for this adjustment..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <p className="text-sm text-gray-600 mb-4">
              New total:{' '}
              <span className="font-bold text-blue-600">
                {(modal.member.total_points ?? 0) + pointAdjustment}
              </span>
            </p>

            <div className="flex gap-3 justify-end">
              <Button
                variant="gray"
                onClick={() => {
                  setModal({ type: 'none' })
                  setError(null)
                }}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => handleAdjustPoints(modal.member)}
                loading={loading}
                loadingText="Saving..."
              >
                Confirm Adjustment
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Promote Modal */}
      {modal.type === 'promote' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-3">
              Promote to Admin
            </h3>
            <p className="text-sm text-gray-600 mb-2">
              Are you sure you want to make{' '}
              <span className="font-bold">{modal.member.users.username}</span>{' '}
              an admin?
            </p>
            <p className="text-sm text-gray-500 mb-4">
              Admins can edit pool settings, enter match results, and manage
              members.
            </p>
            <div className="flex gap-3 justify-end">
              <Button
                variant="gray"
                onClick={() => setModal({ type: 'none' })}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => handlePromote(modal.member)}
                loading={loading}
                loadingText="Promoting..."
              >
                Promote to Admin
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Demote Modal */}
      {modal.type === 'demote' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-3">
              Demote to Player
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Are you sure you want to demote{' '}
              <span className="font-bold">{modal.member.users.username}</span>{' '}
              to a regular player?
            </p>
            <div className="flex gap-3 justify-end">
              <Button
                variant="gray"
                onClick={() => setModal({ type: 'none' })}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => handleDemote(modal.member)}
                loading={loading}
                loadingText="Demoting..."
              >
                Demote to Player
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Remove Modal */}
      {modal.type === 'remove' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-bold text-red-600 mb-3">
              Remove Member
            </h3>
            <p className="text-sm text-gray-600 mb-2">
              Are you sure you want to remove{' '}
              <span className="font-bold">{modal.member.users.username}</span>{' '}
              from this pool?
            </p>
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-red-600">
                This will delete all their predictions. This action cannot be
                undone.
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700 mb-4 cursor-pointer">
              <input
                type="checkbox"
                checked={removeConfirmed}
                onChange={(e) => setRemoveConfirmed(e.target.checked)}
                className="rounded"
              />
              I understand this action cannot be undone
            </label>
            <div className="flex gap-3 justify-end">
              <Button
                variant="gray"
                onClick={() => {
                  setModal({ type: 'none' })
                  setRemoveConfirmed(false)
                }}
                disabled={loading}
              >
                Cancel
              </Button>
              <button
                onClick={() => handleRemove(modal.member)}
                disabled={!removeConfirmed || loading}
                className="px-4 py-2 text-sm rounded-lg font-semibold bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Removing...' : 'Remove Member'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
