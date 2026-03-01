'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { SuperPoolData } from './page'
import { Badge, getStatusVariant } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { useToast } from '@/components/ui/Toast'

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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-neutral-900 dark:text-white">Pool Management</h2>
        <span className="px-3 py-1 bg-neutral-100 text-neutral-700 rounded-full font-medium text-sm">
          {pools.length} Total Pools
        </span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search pools..."
          className="px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-lg text-sm text-neutral-700 dark:text-neutral-200 bg-surface w-64 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-lg text-sm text-neutral-700 dark:text-neutral-200 bg-surface"
        >
          <option value="all">All Status</option>
          <option value="open">Open</option>
          <option value="locked">Locked</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {/* Pools cards */}
      <div className="grid gap-4">
        {filteredPools.length === 0 ? (
          <div className="bg-surface rounded-lg shadow dark:shadow-none dark:border dark:border-border-default p-8 text-center text-neutral-600 dark:text-neutral-400">
            No pools found.
          </div>
        ) : (
          filteredPools.map((pool) => (
            <div
              key={pool.pool_id}
              className="bg-surface rounded-lg shadow dark:shadow-none dark:border dark:border-border-default p-6 hover:shadow-md dark:hover:border-neutral-600 transition"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="text-lg font-bold text-neutral-900 dark:text-white">
                      {pool.pool_name}
                    </h3>
                    <Badge variant={getStatusVariant(pool.status)}>
                      {pool.status}
                    </Badge>
                  </div>
                  {pool.description && (
                    <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-2">
                      {pool.description}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-4 text-sm text-neutral-600 dark:text-neutral-400">
                    <span>
                      Code: <strong className="font-mono">{pool.pool_code}</strong>
                    </span>
                    <span>
                      Members: <strong>{getMemberCount(pool)}</strong>
                    </span>
                    <span>
                      Admin:{' '}
                      <strong>
                        {pool.admin_user?.username || 'Unknown'}
                      </strong>
                    </span>
                    <span>
                      Tournament:{' '}
                      <strong>{pool.tournaments?.name || 'N/A'}</strong>
                    </span>
                    <span>
                      Created:{' '}
                      {new Date(pool.created_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => openDeleteModal(pool)}
                  className="flex-shrink-0"
                >
                  Delete Pool
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Delete Pool Modal */}
      {modal.type === 'delete_pool' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-surface rounded-xl shadow-xl max-w-lg w-full mx-4 p-6 dark:shadow-none dark:border dark:border-border-default">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-3 h-3 bg-danger-600 rounded-full animate-pulse" />
              <h3 className="text-xl font-bold text-danger-700">Delete Pool</h3>
            </div>

            <div className="bg-danger-50 border border-danger-200 rounded-lg p-4 mb-4">
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
                className="w-full px-3 py-2 border border-danger-300 rounded-lg text-sm text-neutral-900 focus:ring-2 focus:ring-danger-500 focus:border-transparent"
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
