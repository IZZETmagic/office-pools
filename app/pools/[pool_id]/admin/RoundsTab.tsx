'use client'

import { useState, useEffect, useCallback } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { useToast } from '@/components/ui/Toast'
import { ROUND_LABELS, ROUND_KEYS, type RoundKey } from '@/lib/tournament'
import type { PoolRoundState, RoundStateValue } from '../types'

type RoundRow = PoolRoundState & {
  match_count: number
  completed_match_count: number
  admin_stats?: {
    total_entries: number
    submitted_entries: number
  } | null
}

type RoundsTabProps = {
  poolId: string
  roundStates: PoolRoundState[]
}

function getStateBadge(state: RoundStateValue) {
  switch (state) {
    case 'locked':
      return <Badge variant="gray">Locked</Badge>
    case 'open':
      return <Badge variant="blue">Open</Badge>
    case 'in_progress':
      return <Badge variant="yellow">In Progress</Badge>
    case 'completed':
      return <Badge variant="green">Completed</Badge>
  }
}

function formatDeadline(deadline: string | null) {
  if (!deadline) return '—'
  const d = new Date(deadline)
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

export function RoundsTab({ poolId, roundStates: initialRoundStates }: RoundsTabProps) {
  const { showToast } = useToast()
  const [rounds, setRounds] = useState<RoundRow[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // Modal state for open / extend deadline
  const [modal, setModal] = useState<{
    type: 'open' | 'extend_deadline'
    roundKey: string
    roundName: string
  } | null>(null)
  const [deadlineDate, setDeadlineDate] = useState('')
  const [deadlineTime, setDeadlineTime] = useState('14:00')

  const fetchRounds = useCallback(async () => {
    try {
      const res = await fetch(`/api/pools/${poolId}/rounds`)
      if (!res.ok) throw new Error('Failed to fetch rounds')
      const data = await res.json()
      // Sort by canonical round order (group first)
      const orderMap = new Map(ROUND_KEYS.map((k, i) => [k, i]))
      const sorted = [...(data.rounds ?? [])].sort(
        (a: RoundRow, b: RoundRow) => (orderMap.get(a.round_key) ?? 99) - (orderMap.get(b.round_key) ?? 99)
      )
      setRounds(sorted)
    } catch {
      showToast('Failed to load rounds data', 'error')
    } finally {
      setLoading(false)
    }
  }, [poolId, showToast])

  useEffect(() => {
    fetchRounds()
  }, [fetchRounds])

  const handleAction = async (roundKey: string, action: string, deadline?: string) => {
    setActionLoading(`${roundKey}-${action}`)
    try {
      const body: Record<string, any> = { action }
      if (deadline) body.deadline = deadline

      const res = await fetch(`/api/pools/${poolId}/rounds/${roundKey}/state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to update round')
      }

      showToast(`Round updated successfully`, 'success')
      await fetchRounds()
    } catch (err: any) {
      showToast(err.message || 'Failed to update round', 'error')
    } finally {
      setActionLoading(null)
      setModal(null)
    }
  }

  const openModal = (type: 'open' | 'extend_deadline', roundKey: string) => {
    const roundName = ROUND_LABELS[roundKey as RoundKey] ?? roundKey
    // Default deadline: tomorrow at 2pm
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    setDeadlineDate(tomorrow.toISOString().split('T')[0])
    setDeadlineTime('14:00')
    setModal({ type, roundKey, roundName })
  }

  const handleModalSubmit = () => {
    if (!modal || !deadlineDate || !deadlineTime) return
    const deadline = new Date(`${deadlineDate}T${deadlineTime}:00`).toISOString()
    handleAction(modal.roundKey, modal.type, deadline)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-neutral-900">Round Management</h2>
        <p className="text-sm text-neutral-500 mt-1">
          Control when each prediction round opens and closes. Notifications are sent when rounds open.
        </p>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden space-y-3">
        {rounds.map((round) => {
          const roundName = ROUND_LABELS[round.round_key as RoundKey] ?? round.round_key
          const isPastDeadline = round.deadline ? new Date(round.deadline) < new Date() : false

          return (
            <Card key={round.round_key}>
              <div className="flex items-center justify-between mb-3">
                <span className="font-medium text-neutral-900 dark:text-white">{roundName}</span>
                {getStateBadge(round.state)}
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-neutral-500 dark:text-neutral-600">Deadline</span>
                  <span className={isPastDeadline && round.state === 'open' ? 'text-red-600 font-medium' : 'text-neutral-700 dark:text-neutral-500'}>
                    {formatDeadline(round.deadline)}
                  </span>
                </div>

                {round.state !== 'locked' && (
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-500 dark:text-neutral-600">Matches</span>
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-neutral-100 dark:bg-neutral-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-500 rounded-full"
                          style={{
                            width: round.match_count > 0
                              ? `${(round.completed_match_count / round.match_count) * 100}%`
                              : '0%',
                          }}
                        />
                      </div>
                      <span className="text-neutral-700 dark:text-neutral-500">
                        {round.completed_match_count} / {round.match_count}
                      </span>
                    </div>
                  </div>
                )}

                {round.admin_stats && (
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-500 dark:text-neutral-600">Submissions</span>
                    <span className="text-neutral-700 dark:text-neutral-500">
                      {round.admin_stats.submitted_entries} / {round.admin_stats.total_entries}
                    </span>
                  </div>
                )}
              </div>

              {round.state !== 'completed' && (
                <div className="flex items-center justify-end gap-2 mt-3 pt-3 border-t border-border-default">
                  {round.state === 'locked' && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => openModal('open', round.round_key)}
                      loading={actionLoading === `${round.round_key}-open`}
                      loadingText="Opening..."
                    >
                      Open Round
                    </Button>
                  )}

                  {round.state === 'open' && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openModal('extend_deadline', round.round_key)}
                        loading={actionLoading === `${round.round_key}-extend_deadline`}
                        loadingText="..."
                      >
                        Extend
                      </Button>
                      <Button
                        variant="gray"
                        size="sm"
                        onClick={() => handleAction(round.round_key, 'close')}
                        loading={actionLoading === `${round.round_key}-close`}
                        loadingText="..."
                      >
                        Close
                      </Button>
                    </>
                  )}

                  {(round.state === 'in_progress' || round.state === 'open') && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleAction(round.round_key, 'complete')}
                      loading={actionLoading === `${round.round_key}-complete`}
                      loadingText="..."
                    >
                      Complete
                    </Button>
                  )}
                </div>
              )}

              {round.state === 'completed' && (
                <div className="mt-3 pt-3 border-t border-border-default">
                  <span className="text-xs text-neutral-400">Done</span>
                </div>
              )}
            </Card>
          )
        })}
      </div>

      {/* Desktop table */}
      <Card className="hidden sm:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-default">
                <th className="text-left py-3 px-4 font-semibold text-neutral-700">Round</th>
                <th className="text-left py-3 px-4 font-semibold text-neutral-700">State</th>
                <th className="text-left py-3 px-4 font-semibold text-neutral-700">Deadline</th>
                <th className="text-left py-3 px-4 font-semibold text-neutral-700">Matches</th>
                <th className="text-left py-3 px-4 font-semibold text-neutral-700">Submissions</th>
                <th className="text-right py-3 px-4 font-semibold text-neutral-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rounds.map((round) => {
                const roundName = ROUND_LABELS[round.round_key as RoundKey] ?? round.round_key
                const isPastDeadline = round.deadline ? new Date(round.deadline) < new Date() : false

                return (
                  <tr key={round.round_key} className="border-b border-border-default last:border-b-0">
                    <td className="py-3 px-4 font-medium text-neutral-900">{roundName}</td>
                    <td className="py-3 px-4">{getStateBadge(round.state)}</td>
                    <td className="py-3 px-4">
                      <span className={isPastDeadline && round.state === 'open' ? 'text-red-600 font-medium' : 'text-neutral-600'}>
                        {formatDeadline(round.deadline)}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {round.state === 'locked' ? (
                        <span className="text-neutral-400">—</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-neutral-700">
                            {round.completed_match_count} / {round.match_count}
                          </span>
                          <div className="w-16 h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-green-500 rounded-full"
                              style={{
                                width: round.match_count > 0
                                  ? `${(round.completed_match_count / round.match_count) * 100}%`
                                  : '0%',
                              }}
                            />
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {round.admin_stats ? (
                        <span className="text-neutral-700">
                          {round.admin_stats.submitted_entries} / {round.admin_stats.total_entries}
                        </span>
                      ) : (
                        <span className="text-neutral-400">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-2">
                        {round.state === 'locked' && (
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => openModal('open', round.round_key)}
                            loading={actionLoading === `${round.round_key}-open`}
                            loadingText="Opening..."
                          >
                            Open Round
                          </Button>
                        )}

                        {round.state === 'open' && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openModal('extend_deadline', round.round_key)}
                              loading={actionLoading === `${round.round_key}-extend_deadline`}
                              loadingText="..."
                            >
                              Extend
                            </Button>
                            <Button
                              variant="gray"
                              size="sm"
                              onClick={() => handleAction(round.round_key, 'close')}
                              loading={actionLoading === `${round.round_key}-close`}
                              loadingText="..."
                            >
                              Close
                            </Button>
                          </>
                        )}

                        {(round.state === 'in_progress' || round.state === 'open') && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleAction(round.round_key, 'complete')}
                            loading={actionLoading === `${round.round_key}-complete`}
                            loadingText="..."
                          >
                            Complete
                          </Button>
                        )}

                        {round.state === 'completed' && (
                          <span className="text-xs text-neutral-400">Done</span>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-sm text-blue-800 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-600">
        <strong>How round management works:</strong> Open a round to allow predictions.
        Members will be notified by email. When the deadline passes, predictions auto-lock.
        After all matches in a round complete, mark it as completed to unlock scoring and
        optionally auto-open the next round.
      </div>

      {/* Deadline modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setModal(null)} />
          <div className="relative bg-surface sm:rounded-2xl rounded-t-2xl shadow-xl sm:max-w-sm w-full p-6 dark:shadow-none dark:border dark:border-border-default">
            <h3 className="text-lg font-bold text-neutral-900 mb-1">
              {modal.type === 'open' ? 'Open Round' : 'Extend Deadline'}
            </h3>
            <p className="text-sm text-neutral-500 mb-4">
              {modal.type === 'open'
                ? `Set a deadline for ${modal.roundName}. Members will be notified.`
                : `Set a new deadline for ${modal.roundName}.`}
            </p>

            <div className="space-y-3 mb-5">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Date</label>
                <input
                  type="date"
                  value={deadlineDate}
                  onChange={(e) => setDeadlineDate(e.target.value)}
                  className="w-full px-3 py-2 border border-border-default rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Time</label>
                <input
                  type="time"
                  value={deadlineTime}
                  onChange={(e) => setDeadlineTime(e.target.value)}
                  className="w-full px-3 py-2 border border-border-default rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>

            <div className="flex gap-3 justify-end">
              <Button variant="gray" onClick={() => setModal(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleModalSubmit}
                disabled={!deadlineDate || !deadlineTime}
                loading={actionLoading !== null}
                loadingText={modal.type === 'open' ? 'Opening...' : 'Updating...'}
              >
                {modal.type === 'open' ? 'Open Round' : 'Update Deadline'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
