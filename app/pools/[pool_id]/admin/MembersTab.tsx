'use client'

import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { PoolData, MemberData, PredictionData, MatchData, TeamData } from '../types'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { Input } from '@/components/ui/Input'
import {
  getKnockoutWinner,
  type GroupStanding,
  type PredictionMap,
  type Match,
  type Team,
} from '@/lib/tournament'
import { resolveFullBracket } from '@/lib/bracketResolver'

type MembersTabProps = {
  pool: PoolData
  members: MemberData[]
  setMembers: (members: MemberData[]) => void
  predictions: PredictionData[]
  matches: MatchData[]
  teams: TeamData[]
  currentUserId: string
}

type ModalState =
  | { type: 'none' }
  | { type: 'view_predictions'; member: MemberData }
  | { type: 'adjust_points'; member: MemberData }
  | { type: 'promote'; member: MemberData }
  | { type: 'demote'; member: MemberData }
  | { type: 'remove'; member: MemberData }
  | { type: 'unlock_predictions'; member: MemberData }

export function MembersTab({
  pool,
  members,
  setMembers,
  predictions,
  matches,
  teams,
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

    // Deleting the member cascades to predictions, scores, etc.
    const { error: memError } = await supabase
      .from('pool_members')
      .delete()
      .eq('member_id', member.member_id)

    if (memError) {
      setError('Failed to remove member: ' + memError.message)
      setLoading(false)
      return
    }

    // Recalculate leaderboard ranks to close any gaps
    await supabase.rpc('recalculate_pool_leaderboard', {
      p_pool_id: pool.pool_id,
    })

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

  async function handleUnlockPredictions(member: MemberData) {
    setLoading(true)
    try {
      const res = await fetch(`/api/pools/${pool.pool_id}/predictions/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId: member.member_id }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to unlock predictions')
      }

      setSuccess(`Predictions unlocked for ${member.users.username}. They can now edit and resubmit.`)
      await refreshMembers()
    } catch (err: any) {
      setError(err.message || 'Failed to unlock predictions')
    }
    setLoading(false)
    setModal({ type: 'none' })
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
            <span className="text-sm text-gray-600">Pool Code:</span>
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
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <Input
          type="text"
          placeholder="Search by username..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:max-w-xs"
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

      {/* Members - Mobile card view */}
      <div className="sm:hidden space-y-2">
        {filteredMembers.map((member) => {
          const isCurrentUser = member.user_id === currentUserId
          return (
            <div
              key={member.member_id}
              className={`rounded-lg border p-3 ${isCurrentUser ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-200'}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-gray-500">#{member.current_rank || '-'}</span>
                    <span className="text-sm font-medium text-gray-900 truncate">
                      {member.users.username}
                      {isCurrentUser && <span className="text-xs text-blue-500 ml-1">(you)</span>}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{member.users.full_name}</p>
                </div>
                <span className="text-lg font-bold text-blue-600 shrink-0">{member.total_points ?? 0}</span>
              </div>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                <div className="flex items-center gap-1.5">
                  <Badge variant={member.role === 'admin' ? 'blue' : 'gray'}>
                    {member.role === 'admin' ? 'Admin' : 'Player'}
                  </Badge>
                  {member.has_submitted_predictions ? (
                    <Badge variant="green">Submitted</Badge>
                  ) : (
                    <Badge variant="yellow">Pending</Badge>
                  )}
                </div>
                <select
                  defaultValue=""
                  onChange={(e) => {
                    const action = e.target.value
                    e.target.value = ''
                    setError(null)
                    setSuccess(null)
                    switch (action) {
                      case 'view_predictions':
                        setModal({ type: 'view_predictions', member })
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
                      case 'unlock_predictions':
                        setModal({ type: 'unlock_predictions', member })
                        break
                    }
                  }}
                  className="text-xs px-2 py-1.5 border border-gray-300 rounded bg-white text-gray-700 cursor-pointer"
                >
                  <option value="" disabled>Actions</option>
                  <option value="view_predictions">View Predictions</option>
                  <option value="adjust_points">Adjust Points</option>
                  {member.has_submitted_predictions && <option value="unlock_predictions">Unlock Predictions</option>}
                  {member.role === 'player' && <option value="promote">Promote</option>}
                  {member.role === 'admin' && adminCount > 1 && <option value="demote">Demote</option>}
                  {member.role === 'player' && <option value="remove">Remove</option>}
                </select>
              </div>
            </div>
          )
        })}
      </div>

      {/* Members - Desktop table view */}
      <div className="hidden sm:block bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                  Rank
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                  Member
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase">
                  Points
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase">
                  Predictions
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase">
                  Role
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                  Joined
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase">
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
                        <p className="text-xs text-gray-600">
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
                              case 'unlock_predictions':
                                setModal({ type: 'unlock_predictions', member })
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
                          {member.has_submitted_predictions && <option value="unlock_predictions">Unlock Predictions</option>}
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
        <ViewPredictionsModal
          member={modal.member}
          predictions={predictions}
          matches={matches}
          teams={teams}
          onClose={() => setModal({ type: 'none' })}
        />
      )}

      {/* Adjust Points Modal */}
      {modal.type === 'adjust_points' && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
          <div className="bg-white rounded-t-xl sm:rounded-xl shadow-xl sm:max-w-md w-full sm:mx-4 p-4 sm:p-6">
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
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
          <div className="bg-white rounded-t-xl sm:rounded-xl shadow-xl sm:max-w-md w-full sm:mx-4 p-4 sm:p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-3">
              Promote to Admin
            </h3>
            <p className="text-sm text-gray-600 mb-2">
              Are you sure you want to make{' '}
              <span className="font-bold">{modal.member.users.username}</span>{' '}
              an admin?
            </p>
            <p className="text-sm text-gray-600 mb-4">
              Admins can edit pool settings, manage scoring rules, and manage
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
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
          <div className="bg-white rounded-t-xl sm:rounded-xl shadow-xl sm:max-w-md w-full sm:mx-4 p-4 sm:p-6">
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

      {/* Unlock Predictions Modal */}
      {modal.type === 'unlock_predictions' && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
          <div className="bg-white rounded-t-xl sm:rounded-xl shadow-xl sm:max-w-md w-full sm:mx-4 p-4 sm:p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-3">
              Unlock Predictions
            </h3>
            <p className="text-sm text-gray-600 mb-2">
              Unlock predictions for{' '}
              <span className="font-bold">{modal.member.users.username}</span>?
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-amber-800">
                This will allow them to edit and resubmit their predictions. Only use this for special circumstances (e.g., technical issues).
              </p>
            </div>
            {modal.member.predictions_submitted_at && (
              <p className="text-xs text-gray-500 mb-4">
                Originally submitted: {new Date(modal.member.predictions_submitted_at).toLocaleString()}
              </p>
            )}
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
                onClick={() => handleUnlockPredictions(modal.member)}
                loading={loading}
                loadingText="Unlocking..."
              >
                Unlock Predictions
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Remove Modal */}
      {modal.type === 'remove' && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
          <div className="bg-white rounded-t-xl sm:rounded-xl shadow-xl sm:max-w-md w-full sm:mx-4 p-4 sm:p-6">
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

// =============================================
// VIEW PREDICTIONS MODAL
// =============================================

function ViewPredictionsModal({
  member,
  predictions,
  matches,
  teams,
  onClose,
}: {
  member: MemberData
  predictions: PredictionData[]
  matches: MatchData[]
  teams: TeamData[]
  onClose: () => void
}) {
  const memberPreds = predictions.filter(
    (p) => p.member_id === member.member_id
  )

  // Convert matches to tournament Match type for resolution functions
  const tournamentMatches: Match[] = matches.map((m) => ({
    match_id: m.match_id,
    match_number: m.match_number,
    stage: m.stage,
    group_letter: m.group_letter,
    match_date: m.match_date,
    venue: m.venue,
    status: m.status,
    home_team_id: m.home_team_id,
    away_team_id: m.away_team_id,
    home_team_placeholder: m.home_team_placeholder,
    away_team_placeholder: m.away_team_placeholder,
    home_team: m.home_team ? { country_name: m.home_team.country_name, flag_url: null } : null,
    away_team: m.away_team ? { country_name: m.away_team.country_name, flag_url: null } : null,
  }))

  // Convert teams to tournament Team type
  const tournamentTeams: Team[] = teams.map((t) => ({
    team_id: t.team_id,
    country_name: t.country_name,
    country_code: t.country_code,
    group_letter: t.group_letter,
    fifa_ranking_points: t.fifa_ranking_points,
    flag_url: t.flag_url,
  }))

  // Build this member's PredictionMap
  const predictionMap: PredictionMap = useMemo(() => {
    const map: PredictionMap = new Map()
    for (const pred of memberPreds) {
      map.set(pred.match_id, {
        home: pred.predicted_home_score,
        away: pred.predicted_away_score,
        homePso: pred.predicted_home_pso,
        awayPso: pred.predicted_away_pso,
        winnerTeamId: pred.predicted_winner_team_id,
      })
    }
    return map
  }, [memberPreds])

  // Resolve full bracket from this member's predictions
  const bracket = useMemo(() => {
    return resolveFullBracket({
      matches: tournamentMatches,
      predictionMap,
      teams: tournamentTeams,
    })
  }, [tournamentMatches, predictionMap, tournamentTeams])

  const allGroupStandings = bracket.allGroupStandings
  const knockoutTeamMap = bracket.knockoutTeamMap
  const champion = bracket.champion

  // Stage order for display
  const stageOrder = ['group', 'round_32', 'round_16', 'quarter_final', 'semi_final', 'third_place', 'final']
  const stageNames: Record<string, string> = {
    group: 'Group Stage',
    round_32: 'Round of 32',
    round_16: 'Round of 16',
    quarter_final: 'Quarter Finals',
    semi_final: 'Semi Finals',
    third_place: 'Third Place',
    final: 'Final',
  }

  // Group predictions by stage
  const predsByStage: Record<string, PredictionData[]> = {}
  memberPreds.forEach((pred) => {
    const match = matches.find((m) => m.match_id === pred.match_id)
    const stage = match?.stage || 'unknown'
    if (!predsByStage[stage]) predsByStage[stage] = []
    predsByStage[stage].push(pred)
  })

  // Export predictions as CSV
  function exportToCsv() {
    const headers = ['Match #', 'Stage', 'Home Team', 'Home Score', 'Away Score', 'Away Team', 'PSO Home', 'PSO Away']
    const rows: string[][] = []

    for (const stage of stageOrder) {
      const preds = predsByStage[stage]
      if (!preds || preds.length === 0) continue

      const sorted = [...preds].sort((a, b) => {
        const ma = matches.find((m) => m.match_id === a.match_id)
        const mb = matches.find((m) => m.match_id === b.match_id)
        return (ma?.match_number ?? 0) - (mb?.match_number ?? 0)
      })

      for (const pred of sorted) {
        const match = matches.find((m) => m.match_id === pred.match_id)
        if (!match) continue

        const homeName = getTeamName(match, 'home')
        const awayName = getTeamName(match, 'away')

        rows.push([
          String(match.match_number),
          stageNames[stage] || stage,
          homeName,
          String(pred.predicted_home_score),
          String(pred.predicted_away_score),
          awayName,
          pred.predicted_home_pso != null ? String(pred.predicted_home_pso) : '',
          pred.predicted_away_pso != null ? String(pred.predicted_away_pso) : '',
        ])
      }
    }

    // Add champion row
    if (champion) {
      rows.push([])
      rows.push(['Predicted Champion', champion.country_name])
    }

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')),
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const username = member.users.username
    link.href = url
    link.download = `${username}_predictions.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  // Resolve team name for a match
  function getTeamName(match: MatchData, side: 'home' | 'away'): string {
    // Group stage: use actual team names
    if (match.stage === 'group') {
      return side === 'home'
        ? match.home_team?.country_name || 'TBD'
        : match.away_team?.country_name || 'TBD'
    }
    // Knockout: resolve from member's predictions
    const resolved = knockoutTeamMap.get(match.match_number)
    if (resolved) {
      const team = side === 'home' ? resolved.home : resolved.away
      if (team) return team.country_name
    }
    return 'TBD'
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
      <div className="bg-white rounded-t-xl sm:rounded-xl shadow-xl sm:max-w-lg w-full sm:mx-4 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="p-4 sm:p-6 pb-3 border-b border-gray-100 shrink-0">
          <h3 className="text-xl font-bold text-gray-900">
            {member.users.full_name || member.users.username}&apos;s Predictions
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            Total points: {member.total_points ?? 0}
          </p>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1 p-4 sm:px-6">
          {memberPreds.length === 0 ? (
            <p className="text-gray-600 text-sm py-4">
              No predictions submitted.
            </p>
          ) : (
            <>
              {stageOrder.map((stage) => {
                const preds = predsByStage[stage]
                if (!preds || preds.length === 0) return null

                // Sort by match number
                const sorted = [...preds].sort((a, b) => {
                  const ma = matches.find((m) => m.match_id === a.match_id)
                  const mb = matches.find((m) => m.match_id === b.match_id)
                  return (ma?.match_number ?? 0) - (mb?.match_number ?? 0)
                })

                return (
                  <div key={stage} className="mb-5">
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                      {stageNames[stage] || stage}
                    </h4>
                    <div className="space-y-1">
                      {sorted.map((pred) => {
                        const match = matches.find(
                          (m) => m.match_id === pred.match_id
                        )
                        if (!match) return null

                        const homeName = getTeamName(match, 'home')
                        const awayName = getTeamName(match, 'away')
                        const isDraw = pred.predicted_home_score === pred.predicted_away_score
                        const isKnockout = match.stage !== 'group'

                        return (
                          <div
                            key={pred.prediction_id}
                            className="bg-gray-50 rounded-lg px-3 py-2"
                          >
                            <div className="flex items-center gap-2">
                              {/* Match number */}
                              <span className="text-xs font-mono text-gray-400 shrink-0 w-7 text-right">
                                #{match.match_number}
                              </span>

                              {/* Home team */}
                              <span className="flex-1 text-right text-sm font-medium text-gray-800 truncate">
                                {homeName}
                              </span>

                              {/* Score */}
                              <span className="font-mono font-bold text-gray-900 text-sm shrink-0 px-1">
                                {pred.predicted_home_score} - {pred.predicted_away_score}
                              </span>

                              {/* Away team */}
                              <span className="flex-1 text-left text-sm font-medium text-gray-800 truncate">
                                {awayName}
                              </span>
                            </div>

                            {/* PSO for knockout draws */}
                            {isKnockout && isDraw && pred.predicted_home_pso != null && pred.predicted_away_pso != null && (
                              <p className="text-xs text-blue-600 font-medium text-center mt-0.5">
                                PSO: {pred.predicted_home_pso} - {pred.predicted_away_pso}
                              </p>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}

              {/* Champion highlight */}
              {champion && (
                <div className="mt-2 text-center p-4 rounded-xl bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 border border-indigo-200">
                  <div className="text-3xl mb-1">&#127942;</div>
                  <p className="text-xs font-semibold text-indigo-500 uppercase tracking-wide mb-0.5">
                    Predicted Champion
                  </p>
                  <h4 className="text-xl font-bold text-gray-900">
                    {champion.country_name}
                  </h4>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 sm:px-6 pt-3 border-t border-gray-100 shrink-0">
          <div className="flex justify-between">
            {memberPreds.length > 0 ? (
              <button
                onClick={exportToCsv}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Export CSV
              </button>
            ) : (
              <div />
            )}
            <Button variant="gray" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
