'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { SuperPoolData } from './page'
import { Badge, getStatusVariant } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { useToast } from '@/components/ui/Toast'
import { logAuditEvent } from '@/lib/audit'

type PoolsTabProps = {
  pools: SuperPoolData[]
  setPools: (pools: SuperPoolData[]) => void
}

type ModalState =
  | { type: 'none' }
  | { type: 'delete_pool'; pool: SuperPoolData }

export function PoolsTab({ pools, setPools }: PoolsTabProps) {
  const supabase = createClient()
  const { showToast } = useToast()

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [modal, setModal] = useState<ModalState>({ type: 'none' })
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const filteredPools = pools.filter((p) => {
    if (statusFilter !== 'all' && p.status !== statusFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        p.pool_name.toLowerCase().includes(q) ||
        p.pool_code.toLowerCase().includes(q) ||
        (p.admin_user?.username && p.admin_user.username.toLowerCase().includes(q))
      )
    }
    return true
  })

  function getMemberCount(pool: SuperPoolData): number {
    return pool.pool_members?.[0]?.count ?? 0
  }

  function openDeleteModal(pool: SuperPoolData) {
    setDeleteConfirm('')
    setError(null)
    setModal({ type: 'delete_pool', pool })
  }

  async function handleDeletePool() {
    if (modal.type !== 'delete_pool') return
    const pool = modal.pool

    if (deleteConfirm !== pool.pool_name) {
      setError('Pool name does not match.')
      return
    }

    setDeleting(true)
    setError(null)

    // Log audit event before deletion so pool_id FK reference is preserved
    await logAuditEvent({
      action: 'delete_pool',
      pool_id: pool.pool_id,
      details: {
        pool_name: pool.pool_name,
        pool_code: pool.pool_code,
        member_count: getMemberCount(pool),
        admin: pool.admin_user?.username || 'Unknown',
        status: pool.status,
      },
      summary: `Deleted pool "${pool.pool_name}" (${getMemberCount(pool)} members)`,
    })

    // Delete in correct order to respect FK constraints:
    // 1. match_scores, bonus_scores (depend on predictions/pool_members)
    // 2. predictions, group_predictions, special_predictions (depend on pool_members)
    // 3. player_scores (depends on pool_members)
    // 4. pool_members (depends on pools)
    // 5. pool_settings (depends on pools)
    // 6. pools

    const memberIds: string[] = []
    const { data: members } = await supabase
      .from('pool_members')
      .select('member_id')
      .eq('pool_id', pool.pool_id)

    if (members) {
      memberIds.push(...members.map((m: any) => m.member_id))
    }

    // Collect entry_ids
    let entryIds: string[] = []
    if (memberIds.length > 0) {
      const { data: entries } = await supabase
        .from('pool_entries')
        .select('entry_id')
        .in('member_id', memberIds)
      if (entries) {
        entryIds = entries.map((e: any) => e.entry_id)
      }
    }

    if (entryIds.length > 0) {
      // Delete match_scores for these entries
      const { error: e1 } = await supabase
        .from('match_scores')
        .delete()
        .in('entry_id', entryIds)
      if (e1) { setError('Failed to delete match scores: ' + e1.message); setDeleting(false); return }

      // Delete bonus_scores
      const { error: e2 } = await supabase
        .from('bonus_scores')
        .delete()
        .in('entry_id', entryIds)
      if (e2) { setError('Failed to delete bonus scores: ' + e2.message); setDeleting(false); return }

      // Delete predictions
      const { error: e3 } = await supabase
        .from('predictions')
        .delete()
        .in('entry_id', entryIds)
      if (e3) { setError('Failed to delete predictions: ' + e3.message); setDeleting(false); return }

      // Delete group_predictions
      const { error: e4 } = await supabase
        .from('group_predictions')
        .delete()
        .in('entry_id', entryIds)
      if (e4) { setError('Failed to delete group predictions: ' + e4.message); setDeleting(false); return }

      // Delete special_predictions
      const { error: e5 } = await supabase
        .from('special_predictions')
        .delete()
        .in('entry_id', entryIds)
      if (e5) { setError('Failed to delete special predictions: ' + e5.message); setDeleting(false); return }

      // Delete player_scores
      const { error: e6 } = await supabase
        .from('player_scores')
        .delete()
        .in('entry_id', entryIds)
      if (e6) { setError('Failed to delete player scores: ' + e6.message); setDeleting(false); return }
    }

    // Delete pool_entries
    if (memberIds.length > 0) {
      const { error: eEntries } = await supabase
        .from('pool_entries')
        .delete()
        .in('member_id', memberIds)
      if (eEntries) { setError('Failed to delete pool entries: ' + eEntries.message); setDeleting(false); return }
    }

    // Delete pool_members
    const { error: e7 } = await supabase
      .from('pool_members')
      .delete()
      .eq('pool_id', pool.pool_id)
    if (e7) { setError('Failed to delete pool members: ' + e7.message); setDeleting(false); return }

    // Delete pool_settings
    const { error: e8 } = await supabase
      .from('pool_settings')
      .delete()
      .eq('pool_id', pool.pool_id)
    if (e8) { setError('Failed to delete pool settings: ' + e8.message); setDeleting(false); return }

    // Delete the pool itself
    const { error: e9 } = await supabase
      .from('pools')
      .delete()
      .eq('pool_id', pool.pool_id)
    if (e9) { setError('Failed to delete pool: ' + e9.message); setDeleting(false); return }

    setPools(pools.filter((p) => p.pool_id !== pool.pool_id))
    setDeleting(false)
    setModal({ type: 'none' })
    showToast(`Pool "${pool.pool_name}" has been permanently deleted.`, 'success')
  }

  // Status filter options with counts (only statuses that are actually settable in the app)
  const statusOptions: { value: string; label: string; count: number | null; color: string }[] = [
    { value: 'all', label: 'All', count: null, color: 'bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200' },
    { value: 'open', label: 'Open', count: pools.filter(p => p.status === 'open').length, color: 'bg-success-100 text-success-700 dark:bg-success-900/40 dark:text-success-300' },
    { value: 'closed', label: 'Closed', count: pools.filter(p => p.status === 'closed').length, color: 'bg-warning-100 text-warning-700 dark:bg-warning-900/40 dark:text-warning-300' },
    { value: 'completed', label: 'Completed', count: pools.filter(p => p.status === 'completed').length, color: 'bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200' },
  ]

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-neutral-900 dark:text-white">Pool Management</h2>
      </div>

      {/* Filters */}
      <div className="space-y-3 mb-6">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search pools..."
          className="px-3 py-2 border border-neutral-300 dark:border-neutral-500 rounded-xl text-sm text-neutral-700 dark:text-neutral-200 bg-white dark:bg-neutral-800 w-64 focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:placeholder-neutral-500"
        />
        <div className="flex flex-wrap gap-1.5">
          {statusOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setStatusFilter(opt.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
                statusFilter === opt.value
                  ? opt.color
                  : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700'
              }`}
            >
              {opt.label}{opt.count != null && <span className="ml-1 opacity-70">{opt.count}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Pools — mobile cards */}
      <div className="sm:hidden space-y-3">
        {filteredPools.length === 0 ? (
          <div className="bg-surface rounded-xl shadow dark:shadow-none dark:border dark:border-border-default p-8 text-center text-neutral-600 dark:text-neutral-400">
            No pools found.
          </div>
        ) : (
          filteredPools.map((pool, i) => (
            <div
              key={pool.pool_id}
              className="bg-surface rounded-xl shadow dark:shadow-none dark:border dark:border-border-default overflow-hidden animate-fade-up"
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              {/* Header bar: pool name + status */}
              <div className="flex items-center gap-2 px-3.5 py-2 bg-neutral-100 dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700">
                <span className="font-semibold text-sm text-neutral-900 dark:text-white truncate">
                  {pool.pool_name}
                </span>
                <div className="flex gap-1.5 ml-auto flex-shrink-0">
                  <Badge variant={getStatusVariant(pool.status)}>
                    {pool.status}
                  </Badge>
                </div>
              </div>
              {/* Body: details + actions */}
              <div className="px-3.5 py-3">
                {pool.description && (
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-2 line-clamp-1">
                    {pool.description}
                  </p>
                )}
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-neutral-500 dark:text-neutral-400 mb-2.5">
                  <span>Code: <strong className="font-mono">{pool.pool_code}</strong></span>
                  <span>Members: <strong>{getMemberCount(pool)}</strong></span>
                  <span>Admin: <strong>{pool.admin_user?.username || 'Unknown'}</strong></span>
                  <span>
                    {new Date(pool.created_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                </div>
                <div className="flex gap-1.5">
                  <Button
                    size="xs"
                    variant="outline"
                    href={`/pools/${pool.pool_id}`}
                  >
                    View
                  </Button>
                  <Button
                    size="xs"
                    variant="outline"
                    className="!text-danger-600 !border-danger-200 hover:!bg-danger-50 dark:!text-danger-400 dark:!border-danger-800 dark:hover:!bg-danger-950"
                    onClick={() => openDeleteModal(pool)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pools — desktop table */}
      <div className="hidden sm:block bg-surface rounded-xl shadow dark:shadow-none dark:border dark:border-border-default overflow-hidden">
        <div>
          <table className="w-full">
            <thead className="bg-neutral-100 dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-neutral-700 dark:text-neutral-300 uppercase">
                  Pool
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-neutral-700 dark:text-neutral-300 uppercase">
                  Code
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-neutral-700 dark:text-neutral-300 uppercase">
                  Status
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-neutral-700 dark:text-neutral-300 uppercase">
                  Members
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-neutral-700 dark:text-neutral-300 uppercase">
                  Admin
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-neutral-700 dark:text-neutral-300 uppercase">
                  Tournament
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-neutral-700 dark:text-neutral-300 uppercase">
                  Created
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-neutral-700 dark:text-neutral-300 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
              {filteredPools.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-neutral-600 dark:text-neutral-400">
                    No pools found.
                  </td>
                </tr>
              ) : (
                filteredPools.map((pool, i) => (
                  <tr
                    key={pool.pool_id}
                    className="hover:bg-neutral-50 dark:hover:bg-neutral-800 animate-fade-up"
                    style={{ animationDelay: `${i * 0.03}s` }}
                  >
                    <td className="px-4 py-3">
                      <div>
                        <span className="font-medium text-neutral-900 dark:text-white">
                          {pool.pool_name}
                        </span>
                        {pool.description && (
                          <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate max-w-[200px]">
                            {pool.description}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-sm text-neutral-600 dark:text-neutral-400">
                        {pool.pool_code}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={getStatusVariant(pool.status)}>
                        {pool.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-neutral-700 dark:text-neutral-300 font-medium">
                      {getMemberCount(pool)}
                    </td>
                    <td className="px-4 py-3 text-sm text-neutral-600 dark:text-neutral-400">
                      {pool.admin_user?.username || 'Unknown'}
                    </td>
                    <td className="px-4 py-3 text-sm text-neutral-600 dark:text-neutral-400">
                      {pool.tournaments?.name || 'N/A'}
                    </td>
                    <td className="px-4 py-3 text-sm text-neutral-600 dark:text-neutral-400">
                      {new Date(pool.created_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex gap-1.5 justify-end">
                        <Button
                          size="xs"
                          variant="outline"
                          href={`/pools/${pool.pool_id}`}
                        >
                          View
                        </Button>
                        <Button
                          size="xs"
                          variant="outline"
                          className="!text-danger-600 !border-danger-200 hover:!bg-danger-50 dark:!text-danger-400 dark:!border-danger-800 dark:hover:!bg-danger-950"
                          onClick={() => openDeleteModal(pool)}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Pool Modal */}
      {modal.type === 'delete_pool' && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
          <div className="fixed inset-0 bg-black/50" />
          <div className="relative bg-surface rounded-t-2xl sm:rounded-2xl shadow-xl sm:max-w-lg w-full p-6 dark:shadow-none dark:border dark:border-border-default">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-3 h-3 bg-danger-600 rounded-full animate-pulse" />
              <h3 className="text-xl font-bold text-danger-700">Delete Pool</h3>
            </div>

            <div className="bg-danger-50 border border-danger-200 rounded-xl p-4 mb-4">
              <p className="text-sm text-danger-700 font-medium mb-2">
                WARNING: This action is PERMANENT and cannot be undone!
              </p>
              <p className="text-sm text-danger-600">
                Deleting &quot;{modal.pool.pool_name}&quot; will permanently
                remove:
              </p>
              <ul className="list-disc list-inside text-sm text-danger-600 mt-2 space-y-1">
                <li>All {getMemberCount(modal.pool)} pool memberships</li>
                <li>All predictions made by members</li>
                <li>All calculated scores and rankings</li>
                <li>All pool settings and configuration</li>
              </ul>
            </div>

            {error && <Alert variant="error" className="mb-4">{error}</Alert>}

            <div className="mb-6">
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Type the pool name{' '}
                <span className="font-bold text-danger-600">
                  {modal.pool.pool_name}
                </span>{' '}
                to confirm
              </label>
              <input
                type="text"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder={modal.pool.pool_name}
                className="w-full px-3 py-2 border border-danger-300 rounded-xl text-sm text-neutral-900 focus:ring-2 focus:ring-danger-500 focus:border-transparent"
              />
            </div>

            <div className="flex gap-3 justify-end">
              <Button
                variant="gray"
                onClick={() => setModal({ type: 'none' })}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={handleDeletePool}
                disabled={deleteConfirm !== modal.pool.pool_name}
                loading={deleting}
                loadingText="Deleting..."
              >
                Permanently Delete Pool
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
