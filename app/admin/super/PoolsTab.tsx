'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { SuperPoolData } from './page'
import { Badge, getStatusVariant } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { useToast } from '@/components/ui/Toast'
import { logAuditEvent } from '@/lib/audit'
import { SpTable, type SpColumn } from './SpTable'

// =============================================
// TYPES
// =============================================
type PoolsTabProps = {
  pools: SuperPoolData[]
  setPools: (pools: SuperPoolData[]) => void
  onNavigateToUser?: (userId: string) => void
}

type PoolMember = {
  member_id: string
  user_id: string
  role: string
  joined_at: string
  entry_fee_paid: boolean
  users: {
    user_id: string
    username: string
    full_name: string | null
    email: string
  } | null
  pool_entries: {
    entry_id: string
    entry_name: string
    entry_number: number
    has_submitted_predictions: boolean
    predictions_submitted_at: string | null
    total_points: number
    point_adjustment: number
    adjustment_reason: string | null
    current_rank: number | null
    match_points: number | null
    bonus_points: number | null
    created_at: string
  }[]
}

type AuditEntry = {
  id: string
  action: string
  performed_at: string
  summary: string | null
  details: Record<string, any>
  performer?: { username: string } | null
}

type RoundState = {
  id: string
  round_key: string
  state: string
  deadline: string | null
  opened_at: string | null
  closed_at: string | null
  completed_at: string | null
}

type AvailableUser = {
  user_id: string
  username: string
  email: string
  full_name: string | null
}

type PoolMemberRef = {
  user_id: string
  username: string
  role: string
}

type PoolDetail = {
  pool: any // full pool record with joins
  members: PoolMember[]
  settings: any | null
  auditLog: AuditEntry[]
  roundStates: RoundState[]
  stats: {
    totalMembers: number
    totalEntries: number
    submittedEntries: number
    pendingEntries: number
  }
  availableUsers: AvailableUser[]
  poolMembers: PoolMemberRef[]
}

type ActionModal =
  | { type: 'none' }
  | { type: 'change_status'; currentStatus: string }
  | { type: 'edit_pool_code'; currentCode: string }
  | { type: 'transfer_ownership'; members: PoolMemberRef[] }
  | { type: 'delete_pool'; poolName: string }
  | { type: 'remove_member'; userId: string; username: string }
  | { type: 'change_role'; userId: string; username: string; currentRole: string }
  | { type: 'add_member'; availableUsers: AvailableUser[] }
  | { type: 'add_note' }
  | { type: 'adjust_points'; entryId: string; entryName: string; username: string; currentAdj: number }
  | { type: 'unlock_predictions'; entryId: string; entryName: string; username: string }
  | { type: 'delete_entry'; entryId: string; entryName: string; username: string }
  | { type: 'lock_all_predictions' }
  | { type: 'unlock_all_predictions' }

// =============================================
// HELPERS
// =============================================
const MODE_LABELS: Record<string, string> = {
  full_tournament: 'Full Tournament',
  progressive: 'Progressive',
  bracket_picker: 'Bracket Picker',
}

const ROUND_LABELS: Record<string, string> = {
  group: 'Group Stage',
  round_32: 'Round of 32',
  round_16: 'Round of 16',
  quarter_final: 'Quarter-Finals',
  semi_final: 'Semi-Finals',
  third_place: 'Third Place',
  final: 'Final',
}

const ROUND_STATE_VARIANT: Record<string, 'green' | 'yellow' | 'blue' | 'gray'> = {
  open: 'green',
  in_progress: 'yellow',
  completed: 'blue',
  locked: 'gray',
}

const ACTION_LABELS: Record<string, string> = {
  delete_pool: 'Pool deleted',
  enter_result: 'Entered result',
  reset_match: 'Reset match',
  update_live_score: 'Updated live score',
  set_status: 'Changed status',
  advance_teams: 'Advanced teams',
  unlock_predictions: 'Predictions unlocked',
  lock_all_predictions: 'All predictions locked',
  unlock_all_predictions: 'All predictions unlocked',
  adjust_points: 'Points adjusted',
  remove_from_pool: 'Member removed',
  remove_member: 'Member removed',
  transfer_ownership: 'Ownership transferred',
  add_to_pool: 'Member added',
  add_member: 'Member added',
  change_pool_status: 'Status changed',
  edit_pool_code: 'Pool code changed',
  change_role: 'Role changed',
  toggle_fee_paid: 'Fee status changed',
  delete_entry: 'Entry deleted',
  admin_note: 'Admin note',
}

const ACTION_BADGE_VARIANT: Record<string, 'blue' | 'green' | 'yellow' | 'gray'> = {
  delete_pool: 'gray',
  remove_member: 'gray',
  remove_from_pool: 'gray',
  delete_entry: 'gray',
  add_member: 'green',
  add_to_pool: 'green',
  change_pool_status: 'yellow',
  adjust_points: 'yellow',
  admin_note: 'gray',
  transfer_ownership: 'yellow',
  lock_all_predictions: 'yellow',
  unlock_all_predictions: 'green',
  unlock_predictions: 'green',
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatDateTime(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

// Shared inline border styles
const thinBorder = '0.5px solid var(--sp-silver)66'
const cardBorder = '0.5px solid var(--sp-silver)80'

// =============================================
// MODAL SHELL (extracted to avoid re-mount on re-render)
// =============================================
function ModalShell({
  title,
  danger,
  children,
  onSubmit,
  submitLabel,
  submitDisabled,
  onClose,
  saving,
  formError,
}: {
  title: string
  danger?: boolean
  children: React.ReactNode
  onSubmit: () => void
  submitLabel: string
  submitDisabled?: boolean
  onClose: () => void
  saving: boolean
  formError: string | null
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div
        className="relative sp-bg-surface rounded-t-2xl sm:rounded-2xl shadow-xl sm:max-w-lg w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className={`text-lg font-bold sp-heading mb-4 ${danger ? 'text-danger-700' : 'sp-text-ink'}`}>
          {title}
        </h3>
        {formError && <Alert variant="error" className="mb-4">{formError}</Alert>}
        {children}
        <div className="flex gap-3 justify-end mt-6">
          <Button variant="gray" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            onClick={onSubmit}
            disabled={submitDisabled}
            loading={saving}
            loadingText="Processing..."
          >
            {submitLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

// =============================================
// ACTION MODALS
// =============================================
function ActionModals({
  actionModal,
  setActionModal,
  poolId,
  poolName,
  showToast,
  onActionComplete,
}: {
  actionModal: ActionModal
  setActionModal: (m: ActionModal) => void
  poolId: string
  poolName: string
  showToast: (msg: string, variant: 'success' | 'error') => void
  onActionComplete: (deleted?: boolean) => void
}) {
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Form state
  const [selectedStatus, setSelectedStatus] = useState('')
  const [newPoolCode, setNewPoolCode] = useState('')
  const [selectedNewAdmin, setSelectedNewAdmin] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [selectedUser, setSelectedUser] = useState('')
  const [noteContent, setNoteContent] = useState('')
  const [adjustAmount, setAdjustAmount] = useState('')
  const [adjustReason, setAdjustReason] = useState('')
  const [selectedRole, setSelectedRole] = useState('')

  async function callAction(action: string, payload: Record<string, any> = {}) {
    setSaving(true)
    setFormError(null)
    try {
      const res = await fetch(`/api/admin/pools/${poolId}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload }),
      })
      const data = await res.json()
      if (!res.ok) {
        setFormError(data.error || 'Action failed')
        setSaving(false)
        return null
      }
      setSaving(false)
      return data
    } catch {
      setFormError('Network error')
      setSaving(false)
      return null
    }
  }

  function close() {
    setActionModal({ type: 'none' })
    setFormError(null)
    setSelectedStatus('')
    setNewPoolCode('')
    setSelectedNewAdmin('')
    setDeleteConfirm('')
    setSelectedUser('')
    setNoteContent('')
    setAdjustAmount('')
    setAdjustReason('')
    setSelectedRole('')
  }

  if (actionModal.type === 'none') return null

  const shellProps = { onClose: close, saving, formError }

  // ---- Change Status ----
  if (actionModal.type === 'change_status') {
    const statuses = ['open', 'closed', 'completed']
    return (
      <ModalShell
        {...shellProps}
        title="Change Pool Status"
        submitLabel="Update Status"
        submitDisabled={!selectedStatus || selectedStatus === actionModal.currentStatus}
        onSubmit={async () => {
          const result = await callAction('change_status', { status: selectedStatus })
          if (result) {
            showToast(`Status changed to ${selectedStatus}`, 'success')
            close()
            onActionComplete()
          }
        }}
      >
        <div className="space-y-3">
          <p className="text-sm sp-text-ink sp-body">
            Current status: <Badge variant={getStatusVariant(actionModal.currentStatus)}>{actionModal.currentStatus}</Badge>
          </p>
          <div>
            <label className="block text-sm font-medium sp-text-ink mb-1 sp-body">New Status</label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full px-3 py-2 border sp-border-silver sp-radius-sm text-sm sp-text-ink sp-bg-surface"
            >
              <option value="">Select status...</option>
              {statuses.filter((s) => s !== actionModal.currentStatus).map((s) => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </div>
        </div>
      </ModalShell>
    )
  }

  // ---- Edit Pool Code ----
  if (actionModal.type === 'edit_pool_code') {
    return (
      <ModalShell
        {...shellProps}
        title="Edit Pool Code"
        submitLabel="Update Code"
        submitDisabled={!newPoolCode.trim() || newPoolCode.trim() === actionModal.currentCode}
        onSubmit={async () => {
          const result = await callAction('edit_pool_code', { pool_code: newPoolCode.trim() })
          if (result) {
            showToast('Pool code updated', 'success')
            close()
            onActionComplete()
          }
        }}
      >
        <div className="space-y-3">
          <div className="sp-bg-mist sp-radius-sm p-3">
            <div className="text-xs sp-text-slate sp-body">Current Code</div>
            <div className="text-sm font-mono font-medium sp-text-ink sp-body">{actionModal.currentCode}</div>
          </div>
          <div>
            <label className="block text-sm font-medium sp-text-ink mb-1 sp-body">New Code</label>
            <input
              type="text"
              value={newPoolCode}
              onChange={(e) => setNewPoolCode(e.target.value.toUpperCase())}
              placeholder="e.g. WORLD26"
              className="w-full px-3 py-2 border sp-border-silver sp-radius-sm text-sm sp-text-ink sp-bg-surface font-mono focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>
      </ModalShell>
    )
  }

  // ---- Transfer Ownership ----
  if (actionModal.type === 'transfer_ownership') {
    return (
      <ModalShell
        {...shellProps}
        title="Transfer Ownership"
        submitLabel="Transfer"
        submitDisabled={!selectedNewAdmin}
        onSubmit={async () => {
          const result = await callAction('transfer_ownership', { new_admin_user_id: selectedNewAdmin })
          if (result) {
            showToast('Ownership transferred', 'success')
            close()
            onActionComplete()
          }
        }}
      >
        <div className="space-y-3">
          <p className="text-sm sp-text-ink sp-body">
            Transfer admin of <strong>{poolName}</strong> to another member:
          </p>
          <select
            value={selectedNewAdmin}
            onChange={(e) => setSelectedNewAdmin(e.target.value)}
            className="w-full px-3 py-2 border sp-border-silver sp-radius-sm text-sm sp-text-ink sp-bg-surface"
          >
            <option value="">Select new admin...</option>
            {actionModal.members.filter((m) => m.role !== 'admin').map((m) => (
              <option key={m.user_id} value={m.user_id}>{m.username}</option>
            ))}
          </select>
        </div>
      </ModalShell>
    )
  }

  // ---- Delete Pool ----
  if (actionModal.type === 'delete_pool') {
    return (
      <ModalShell
        {...shellProps}
        title="Delete Pool"
        danger
        submitLabel="Permanently Delete Pool"
        submitDisabled={deleteConfirm !== actionModal.poolName}
        onSubmit={async () => {
          const result = await callAction('delete_pool', { confirm_pool_name: deleteConfirm })
          if (result) {
            showToast(`Pool "${actionModal.poolName}" deleted`, 'success')
            close()
            onActionComplete(true)
          }
        }}
      >
        <div className="bg-danger-50 border border-danger-200 rounded-xl p-4 mb-4">
          <p className="text-sm text-danger-700 font-medium mb-2">
            WARNING: This action is PERMANENT and cannot be undone!
          </p>
          <p className="text-sm text-danger-600">
            Deleting &quot;{actionModal.poolName}&quot; will permanently remove:
          </p>
          <ul className="list-disc list-inside text-sm text-danger-600 mt-2 space-y-1">
            <li>All pool memberships</li>
            <li>All predictions made by members</li>
            <li>All calculated scores and rankings</li>
            <li>All pool settings and configuration</li>
          </ul>
        </div>
        <div>
          <label className="block text-sm font-medium text-danger-700 mb-1">
            Type <span className="font-bold">{actionModal.poolName}</span> to confirm
          </label>
          <input
            type="text"
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            placeholder={actionModal.poolName}
            className="w-full px-3 py-2 border border-danger-300 rounded-xl text-sm text-neutral-900 focus:ring-2 focus:ring-danger-500 focus:border-transparent"
          />
        </div>
      </ModalShell>
    )
  }

  // ---- Remove Member ----
  if (actionModal.type === 'remove_member') {
    return (
      <ModalShell
        {...shellProps}
        title="Remove Member"
        danger
        submitLabel="Remove"
        onSubmit={async () => {
          const result = await callAction('remove_member', { user_id: actionModal.userId })
          if (result) {
            showToast(`Removed ${actionModal.username} from pool`, 'success')
            close()
            onActionComplete()
          }
        }}
      >
        <p className="text-sm sp-text-ink sp-body">
          Remove <strong>{actionModal.username}</strong> from <strong>{poolName}</strong>?
          This will delete all their entries, predictions, and scores in this pool.
        </p>
      </ModalShell>
    )
  }

  // ---- Change Role ----
  if (actionModal.type === 'change_role') {
    const newRole = actionModal.currentRole === 'admin' ? 'player' : 'admin'
    return (
      <ModalShell
        {...shellProps}
        title="Change Role"
        submitLabel={newRole === 'admin' ? 'Promote to Admin' : 'Demote to Player'}
        onSubmit={async () => {
          const result = await callAction('change_role', { user_id: actionModal.userId, role: newRole })
          if (result) {
            showToast(`${actionModal.username} is now ${newRole}`, 'success')
            close()
            onActionComplete()
          }
        }}
      >
        <div className="space-y-3">
          <p className="text-sm sp-text-ink sp-body">
            Change <strong>{actionModal.username}</strong>'s role from{' '}
            <Badge variant={actionModal.currentRole === 'admin' ? 'yellow' : 'gray'}>
              {actionModal.currentRole}
            </Badge>{' '}
            to{' '}
            <Badge variant={newRole === 'admin' ? 'yellow' : 'gray'}>
              {newRole}
            </Badge>
          </p>
          {newRole === 'admin' && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
              <p className="text-sm text-amber-800">
                This will demote the current admin to player and make{' '}
                <strong>{actionModal.username}</strong> the new pool admin.
              </p>
            </div>
          )}
        </div>
      </ModalShell>
    )
  }

  // ---- Add Member ----
  if (actionModal.type === 'add_member') {
    return (
      <ModalShell
        {...shellProps}
        title="Add Member"
        submitLabel="Add to Pool"
        submitDisabled={!selectedUser}
        onSubmit={async () => {
          const result = await callAction('add_member', { user_id: selectedUser })
          if (result) {
            const user = actionModal.availableUsers.find((u) => u.user_id === selectedUser)
            showToast(`Added ${user?.username || 'user'} to pool`, 'success')
            close()
            onActionComplete()
          }
        }}
      >
        <div className="space-y-3">
          <p className="text-sm sp-text-ink sp-body">
            Add a user as a player to <strong>{poolName}</strong>:
          </p>
          {actionModal.availableUsers.length === 0 ? (
            <p className="text-sm sp-text-slate sp-body">
              All users are already members of this pool.
            </p>
          ) : (
            <select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              className="w-full px-3 py-2 border sp-border-silver sp-radius-sm text-sm sp-text-ink sp-bg-surface"
            >
              <option value="">Select a user...</option>
              {actionModal.availableUsers.map((u) => (
                <option key={u.user_id} value={u.user_id}>
                  {u.username} ({u.email})
                </option>
              ))}
            </select>
          )}
        </div>
      </ModalShell>
    )
  }

  // ---- Add Note ----
  if (actionModal.type === 'add_note') {
    return (
      <ModalShell
        {...shellProps}
        title="Add Admin Note"
        submitLabel="Save Note"
        submitDisabled={!noteContent.trim()}
        onSubmit={async () => {
          const result = await callAction('add_note', { content: noteContent })
          if (result) {
            showToast('Note saved', 'success')
            close()
            onActionComplete()
          }
        }}
      >
        <textarea
          value={noteContent}
          onChange={(e) => setNoteContent(e.target.value)}
          placeholder="Internal note about this pool..."
          rows={4}
          className="w-full px-3 py-2 border sp-border-silver sp-radius-sm text-sm sp-text-ink sp-bg-surface focus:ring-2 focus:ring-primary-500 resize-y"
        />
        <p className="text-xs sp-text-slate mt-1.5 sp-body">
          This note is only visible to super admins.
        </p>
      </ModalShell>
    )
  }

  // ---- Adjust Points ----
  if (actionModal.type === 'adjust_points') {
    return (
      <ModalShell
        {...shellProps}
        title="Adjust Points"
        submitLabel="Apply Adjustment"
        submitDisabled={!adjustAmount || Number(adjustAmount) === 0 || !adjustReason.trim()}
        onSubmit={async () => {
          const result = await callAction('adjust_points', {
            entry_id: actionModal.entryId,
            adjustment: Number(adjustAmount),
            reason: adjustReason,
          })
          if (result) {
            showToast(`Points adjusted: ${Number(adjustAmount) > 0 ? '+' : ''}${adjustAmount}`, 'success')
            close()
            onActionComplete()
          }
        }}
      >
        <div className="space-y-3">
          <div className="sp-bg-mist sp-radius-sm p-3">
            <div className="text-xs sp-text-slate sp-body">Entry</div>
            <div className="text-sm font-medium sp-text-ink sp-body">
              {actionModal.entryName} &middot; {actionModal.username}
            </div>
            <div className="text-xs sp-text-slate sp-body mt-1">
              Current adjustment: {actionModal.currentAdj > 0 ? '+' : ''}{actionModal.currentAdj}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium sp-text-ink mb-1 sp-body">
              Point Adjustment (+/-)
            </label>
            <input
              type="number"
              value={adjustAmount}
              onChange={(e) => setAdjustAmount(e.target.value)}
              placeholder="e.g. +5 or -3"
              className="w-full px-3 py-2 border sp-border-silver sp-radius-sm text-sm sp-text-ink sp-bg-surface focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium sp-text-ink mb-1 sp-body">Reason (required)</label>
            <textarea
              value={adjustReason}
              onChange={(e) => setAdjustReason(e.target.value)}
              placeholder="Reason for adjustment..."
              rows={2}
              className="w-full px-3 py-2 border sp-border-silver sp-radius-sm text-sm sp-text-ink sp-bg-surface focus:ring-2 focus:ring-primary-500 resize-y"
            />
          </div>
        </div>
      </ModalShell>
    )
  }

  // ---- Unlock Predictions ----
  if (actionModal.type === 'unlock_predictions') {
    return (
      <ModalShell
        {...shellProps}
        title="Unlock Predictions"
        submitLabel="Unlock"
        onSubmit={async () => {
          const result = await callAction('unlock_predictions', { entry_id: actionModal.entryId })
          if (result) {
            showToast(`Predictions unlocked for ${actionModal.entryName}`, 'success')
            close()
            onActionComplete()
          }
        }}
      >
        <p className="text-sm sp-text-ink sp-body">
          Unlock predictions for <strong>{actionModal.entryName}</strong> by{' '}
          <strong>{actionModal.username}</strong>?
          They will be able to edit and resubmit their predictions.
        </p>
      </ModalShell>
    )
  }

  // ---- Delete Entry ----
  if (actionModal.type === 'delete_entry') {
    return (
      <ModalShell
        {...shellProps}
        title="Delete Entry"
        danger
        submitLabel="Delete Entry"
        onSubmit={async () => {
          const result = await callAction('delete_entry', { entry_id: actionModal.entryId })
          if (result) {
            showToast(`Entry "${actionModal.entryName}" deleted`, 'success')
            close()
            onActionComplete()
          }
        }}
      >
        <p className="text-sm sp-text-ink sp-body">
          Permanently delete entry <strong>{actionModal.entryName}</strong> by{' '}
          <strong>{actionModal.username}</strong>?
          This will remove all predictions, scores, and rankings for this entry.
        </p>
      </ModalShell>
    )
  }

  // ---- Lock All Predictions ----
  if (actionModal.type === 'lock_all_predictions') {
    return (
      <ModalShell
        {...shellProps}
        title="Lock All Predictions"
        submitLabel="Lock All"
        onSubmit={async () => {
          const result = await callAction('lock_all_predictions')
          if (result) {
            showToast('All predictions locked', 'success')
            close()
            onActionComplete()
          }
        }}
      >
        <p className="text-sm sp-text-ink sp-body">
          Lock all predictions for <strong>{poolName}</strong>?
          All entries will be marked as submitted and users will not be able to edit them.
        </p>
      </ModalShell>
    )
  }

  // ---- Unlock All Predictions ----
  if (actionModal.type === 'unlock_all_predictions') {
    return (
      <ModalShell
        {...shellProps}
        title="Unlock All Predictions"
        submitLabel="Unlock All"
        onSubmit={async () => {
          const result = await callAction('unlock_all_predictions')
          if (result) {
            showToast('All predictions unlocked', 'success')
            close()
            onActionComplete()
          }
        }}
      >
        <p className="text-sm sp-text-ink sp-body">
          Unlock all predictions for <strong>{poolName}</strong>?
          All entries will be marked as not submitted and users can edit and resubmit.
        </p>
      </ModalShell>
    )
  }

  return null
}

// =============================================
// THREE-DOT MENU COMPONENT
// =============================================
function DropdownMenu({
  items,
}: {
  items: { label: string; danger?: boolean; onClick: () => void }[]
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation()
          setOpen(!open)
        }}
        className="p-1.5 sp-radius-sm transition-colors sp-hover-mist"
      >
        <svg className="w-4 h-4 sp-text-slate" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 12.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 18.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 top-full mt-1 z-50 sp-bg-surface sp-radius-sm shadow-lg py-1 min-w-[160px] flex flex-col"
            style={{ border: cardBorder }}
          >
            {items.map((item) => (
              <button
                key={item.label}
                onClick={(e) => {
                  e.stopPropagation()
                  setOpen(false)
                  item.onClick()
                }}
                className={`w-full text-left px-3 py-2 text-sm sp-body transition-colors sp-hover-snow ${
                  item.danger ? 'text-danger-600' : 'sp-text-ink'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// =============================================
// POOL DETAIL SHEET
// =============================================
function PoolDetailSheet({
  detail,
  onBack,
  onRefresh,
  onPoolDeleted,
  onNavigateToUser,
}: {
  detail: PoolDetail
  onBack: () => void
  onRefresh: () => void
  onPoolDeleted: () => void
  onNavigateToUser?: (userId: string) => void
}) {
  const { pool, members, settings, auditLog, roundStates, stats, availableUsers, poolMembers } = detail
  const [actionModal, setActionModal] = useState<ActionModal>({ type: 'none' })
  const { showToast } = useToast()

  const deadline = pool.prediction_deadline
    ? new Date(pool.prediction_deadline)
    : null
  const deadlinePassed = deadline ? deadline < new Date() : false

  function handleActionComplete(deleted?: boolean) {
    if (deleted) {
      onPoolDeleted()
    } else {
      onRefresh()
    }
  }

  // Header dropdown items
  const headerActions = [
    { label: 'Change Status', onClick: () => setActionModal({ type: 'change_status', currentStatus: pool.status }) },
    { label: 'Edit Pool Code', onClick: () => setActionModal({ type: 'edit_pool_code', currentCode: pool.pool_code }) },
    { label: 'Transfer Ownership', onClick: () => setActionModal({ type: 'transfer_ownership', members: poolMembers }) },
    { label: 'Add Member', onClick: () => setActionModal({ type: 'add_member', availableUsers }) },
    { label: 'Add Note', onClick: () => setActionModal({ type: 'add_note' }) },
    { label: 'Lock All Predictions', onClick: () => setActionModal({ type: 'lock_all_predictions' }) },
    { label: 'Unlock All Predictions', onClick: () => setActionModal({ type: 'unlock_all_predictions' }) },
    { label: 'Delete Pool', danger: true, onClick: () => setActionModal({ type: 'delete_pool', poolName: pool.pool_name }) },
  ]

  return (
    <div className="sp-body space-y-6">
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm font-medium text-neutral-500 hover:text-neutral-900 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
        </svg>
        Pools
      </button>

      {/* Pool header */}
      <div className="flex items-start gap-4">
        <div
          className="w-14 h-14 sp-radius-md flex items-center justify-center shrink-0 text-xl font-bold sp-heading"
          style={{ backgroundColor: 'var(--sp-primary-light)', color: 'var(--sp-primary)' }}
        >
          {pool.brand_emoji || pool.pool_name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-2xl font-extrabold sp-heading sp-text-ink">
              {pool.pool_name}
            </h2>
            <Badge variant={getStatusVariant(pool.status)}>{pool.status}</Badge>
            <span className="text-xs font-mono sp-text-slate">{pool.pool_code}</span>
          </div>
          {pool.description && (
            <p className="text-sm sp-text-slate mt-0.5 sp-body">{pool.description}</p>
          )}
          <p className="text-sm sp-text-slate mt-0.5 sp-body">
            Admin: <span className="sp-text-ink">{pool.admin_user?.username || 'Unknown'}</span>
            {' '}&middot;{' '}
            {pool.tournaments?.name || 'No tournament'}
            {' '}&middot;{' '}
            {MODE_LABELS[pool.prediction_mode] || pool.prediction_mode}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="xs"
            variant="outline"
            href={`/pools/${pool.pool_id}`}
          >
            View Pool
          </Button>
          <DropdownMenu items={headerActions} />
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Members', value: stats.totalMembers },
          { label: 'Entries', value: stats.totalEntries },
          { label: 'Submitted', value: stats.submittedEntries },
          { label: 'Pending', value: stats.pendingEntries },
          { label: 'Created', value: formatDate(pool.created_at) },
          {
            label: 'Deadline',
            value: deadline ? formatDate(pool.prediction_deadline) : 'None',
            sub: deadlinePassed ? 'Passed' : deadline ? 'Active' : undefined,
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="sp-bg-surface sp-radius-sm p-3.5"
            style={{ border: thinBorder }}
          >
            <div className="text-[11px] font-medium uppercase tracking-wide sp-text-slate sp-body mb-1">
              {stat.label}
            </div>
            <div className="text-lg font-extrabold sp-text-ink sp-heading">{stat.value}</div>
            {stat.sub && (
              <div className={`text-[11px] sp-body mt-0.5 ${deadlinePassed ? 'sp-text-red' : 'sp-text-green'}`}>
                {stat.sub}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Pool details card */}
      <div
        className="sp-bg-surface sp-radius-sm p-4 space-y-2"
        style={{ border: thinBorder }}
      >
        <h3 className="text-xs font-medium uppercase tracking-wide sp-text-slate sp-body mb-3">Pool Configuration</h3>
        {[
          ['Pool ID', pool.pool_id],
          ['Pool Code', pool.pool_code],
          ['Status', pool.status],
          ['Mode', MODE_LABELS[pool.prediction_mode] || pool.prediction_mode],
          ['Tournament', pool.tournaments?.name || '-'],
          ['Max Participants', pool.max_participants ?? 'Unlimited'],
          ['Max Entries/User', pool.max_entries_per_user],
          ['Private', pool.is_private ? 'Yes' : 'No'],
          ['Deadline', deadline ? formatDateTime(pool.prediction_deadline) : 'None'],
          ['Admin', `${pool.admin_user?.username || 'Unknown'} (${pool.admin_user?.email || '-'})`],
          ['Created', formatDateTime(pool.created_at)],
          ['Updated', formatDateTime(pool.updated_at)],
        ].map(([label, value]) => (
          <div key={String(label)} className="flex gap-3 text-sm">
            <span className="sp-text-slate w-32 shrink-0 sp-body">{label}</span>
            <span className="sp-text-ink sp-body truncate">{String(value)}</span>
          </div>
        ))}
        {pool.brand_name && (
          <>
            <div className="border-t mt-3 pt-3" style={{ borderColor: 'var(--sp-silver)' }} />
            <h4 className="text-xs font-medium uppercase tracking-wide sp-text-slate sp-body mb-2">Branding</h4>
            {[
              ['Brand Name', pool.brand_name],
              ['Brand Emoji', pool.brand_emoji || '-'],
              ['Brand Color', pool.brand_color || '-'],
              ['Landing URL', pool.brand_landing_url || '-'],
            ].map(([label, value]) => (
              <div key={String(label)} className="flex gap-3 text-sm">
                <span className="sp-text-slate w-32 shrink-0 sp-body">{label}</span>
                <span className="sp-text-ink sp-body truncate">{String(value)}</span>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Round states (progressive pools) */}
      {roundStates.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold sp-text-ink sp-heading mb-3">
            Round States
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {roundStates.map((rs) => (
              <div
                key={rs.id}
                className="sp-bg-surface sp-radius-sm p-3.5"
                style={{ border: thinBorder }}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium sp-text-ink sp-body">
                    {ROUND_LABELS[rs.round_key] || rs.round_key}
                  </span>
                  <Badge variant={ROUND_STATE_VARIANT[rs.state] || 'gray'}>
                    {rs.state}
                  </Badge>
                </div>
                {rs.deadline && (
                  <div className="text-[11px] sp-text-slate sp-body">
                    Deadline: {formatDateTime(rs.deadline)}
                  </div>
                )}
                {rs.opened_at && (
                  <div className="text-[11px] sp-text-slate sp-body">
                    Opened: {formatDateTime(rs.opened_at)}
                  </div>
                )}
                {rs.completed_at && (
                  <div className="text-[11px] sp-text-slate sp-body">
                    Completed: {formatDateTime(rs.completed_at)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Members table */}
      <div>
        <h3 className="text-sm font-semibold sp-text-ink sp-heading mb-3">
          Members ({stats.totalMembers})
        </h3>
        {members.length === 0 ? (
          <div
            className="sp-bg-surface sp-radius-sm p-6 text-center"
            style={{ border: thinBorder }}
          >
            <p className="text-sm sp-text-slate sp-body">No members in this pool.</p>
          </div>
        ) : (
          <div
            className="sp-radius-lg overflow-hidden sp-bg-surface"
            style={{ boxShadow: '0 2px 10px rgba(0, 0, 0, 0.04)', border: cardBorder }}
          >
            <div className="overflow-x-auto overscroll-x-contain">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: 'var(--sp-snow)', borderBottom: thinBorder }}>
                    <th className="text-left px-4 py-3 font-medium sp-text-slate whitespace-nowrap sp-body">User</th>
                    <th className="text-left px-4 py-3 font-medium sp-text-slate whitespace-nowrap sp-body">Role</th>
                    <th className="text-right px-4 py-3 font-medium sp-text-slate whitespace-nowrap sp-body">Entries</th>
                    <th className="text-right px-4 py-3 font-medium sp-text-slate whitespace-nowrap sp-body">Points</th>
                    <th className="text-right px-4 py-3 font-medium sp-text-slate whitespace-nowrap sp-body">Best Rank</th>
                    <th className="text-center px-4 py-3 font-medium sp-text-slate whitespace-nowrap sp-body">Fee Paid</th>
                    <th className="text-left px-4 py-3 font-medium sp-text-slate whitespace-nowrap sp-body">Joined</th>
                    <th className="w-10 px-2 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => {
                    const entries = m.pool_entries || []
                    const totalPoints = entries.reduce((s, e) => s + (e.total_points || 0), 0)
                    const bestRank = entries.reduce((best: number | null, e) => {
                      if (e.current_rank == null) return best
                      if (best == null) return e.current_rank
                      return Math.min(best, e.current_rank)
                    }, null)

                    const memberActions = [
                      ...(onNavigateToUser
                        ? [{
                            label: 'View User Profile',
                            onClick: () => onNavigateToUser(m.user_id),
                          }]
                        : []),
                      {
                        label: m.entry_fee_paid ? 'Mark Unpaid' : 'Mark Paid',
                        onClick: async () => {
                          try {
                            const res = await fetch(`/api/admin/pools/${pool.pool_id}/actions`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ action: 'toggle_fee_paid', member_id: m.member_id }),
                            })
                            if (res.ok) {
                              showToast(`Fee status updated for ${m.users?.username}`, 'success')
                              onRefresh()
                            } else {
                              const data = await res.json()
                              showToast(data.error || 'Failed', 'error')
                            }
                          } catch {
                            showToast('Network error', 'error')
                          }
                        },
                      },
                      {
                        label: m.role === 'admin' ? 'Demote to Player' : 'Promote to Admin',
                        onClick: () => setActionModal({
                          type: 'change_role',
                          userId: m.user_id,
                          username: m.users?.username || 'Unknown',
                          currentRole: m.role,
                        }),
                      },
                      ...(m.role !== 'admin'
                        ? [{
                            label: 'Remove',
                            danger: true,
                            onClick: () => setActionModal({
                              type: 'remove_member',
                              userId: m.user_id,
                              username: m.users?.username || 'Unknown',
                            }),
                          }]
                        : []),
                    ]

                    return (
                      <tr
                        key={m.member_id}
                        className="sp-hover-snow transition-colors"
                        style={{ borderBottom: thinBorder }}
                      >
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div>
                            {onNavigateToUser ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  onNavigateToUser(m.user_id)
                                }}
                                className="sp-text-primary font-medium sp-body hover:underline text-left"
                              >
                                {m.users?.username || 'Unknown'}
                              </button>
                            ) : (
                              <span className="sp-text-ink font-medium sp-body">
                                {m.users?.username || 'Unknown'}
                              </span>
                            )}
                            {m.users?.full_name && (
                              <span className="ml-1.5 text-[11px] sp-text-slate">
                                {m.users.full_name}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] sp-text-slate">{m.users?.email || '-'}</div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <Badge variant={m.role === 'admin' ? 'yellow' : 'gray'}>
                            {m.role === 'admin' ? 'Admin' : 'Player'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <span className="sp-text-ink font-medium sp-body">{entries.length}</span>
                          <span className="sp-text-slate text-xs ml-1">
                            ({entries.filter((e) => e.has_submitted_predictions).length} submitted)
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap font-medium sp-text-ink sp-body">
                          {totalPoints}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap sp-body">
                          {bestRank != null ? (
                            <span className={`font-bold ${bestRank <= 3 ? 'sp-text-primary' : 'sp-text-ink'}`}>
                              #{bestRank}
                            </span>
                          ) : (
                            <span className="sp-text-slate">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          {m.entry_fee_paid ? (
                            <span className="sp-text-green">Paid</span>
                          ) : (
                            <span className="sp-text-slate">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm sp-text-slate sp-body">
                          {formatDate(m.joined_at)}
                        </td>
                        <td className="px-2 py-3 whitespace-nowrap">
                          <DropdownMenu items={memberActions} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Entries breakdown */}
      {stats.totalEntries > 0 && (
        <div>
          <h3 className="text-sm font-semibold sp-text-ink sp-heading mb-3">
            All Entries ({stats.totalEntries})
          </h3>
          <div
            className="sp-radius-lg overflow-hidden sp-bg-surface"
            style={{ boxShadow: '0 2px 10px rgba(0, 0, 0, 0.04)', border: cardBorder }}
          >
            <div className="overflow-x-auto overscroll-x-contain">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: 'var(--sp-snow)', borderBottom: thinBorder }}>
                    <th className="text-left px-4 py-3 font-medium sp-text-slate whitespace-nowrap sp-body">Entry</th>
                    <th className="text-left px-4 py-3 font-medium sp-text-slate whitespace-nowrap sp-body">User</th>
                    <th className="text-left px-4 py-3 font-medium sp-text-slate whitespace-nowrap sp-body">Status</th>
                    <th className="text-right px-4 py-3 font-medium sp-text-slate whitespace-nowrap sp-body">Match Pts</th>
                    <th className="text-right px-4 py-3 font-medium sp-text-slate whitespace-nowrap sp-body">Bonus Pts</th>
                    <th className="text-right px-4 py-3 font-medium sp-text-slate whitespace-nowrap sp-body">Adj</th>
                    <th className="text-right px-4 py-3 font-medium sp-text-slate whitespace-nowrap sp-body">Total</th>
                    <th className="text-right px-4 py-3 font-medium sp-text-slate whitespace-nowrap sp-body">Rank</th>
                    <th className="w-10 px-2 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {members.flatMap((m) =>
                    (m.pool_entries || []).map((entry) => {
                      const username = m.users?.username || 'Unknown'
                      const entryActions = [
                        ...(entry.has_submitted_predictions
                          ? [{
                              label: 'Unlock Predictions',
                              onClick: () => setActionModal({
                                type: 'unlock_predictions',
                                entryId: entry.entry_id,
                                entryName: entry.entry_name || `Entry #${entry.entry_number}`,
                                username,
                              }),
                            }]
                          : []),
                        {
                          label: 'Adjust Points',
                          onClick: () => setActionModal({
                            type: 'adjust_points',
                            entryId: entry.entry_id,
                            entryName: entry.entry_name || `Entry #${entry.entry_number}`,
                            username,
                            currentAdj: entry.point_adjustment || 0,
                          }),
                        },
                        {
                          label: 'Delete Entry',
                          danger: true,
                          onClick: () => setActionModal({
                            type: 'delete_entry',
                            entryId: entry.entry_id,
                            entryName: entry.entry_name || `Entry #${entry.entry_number}`,
                            username,
                          }),
                        },
                      ]

                      return (
                        <tr
                          key={entry.entry_id}
                          className="sp-hover-snow transition-colors"
                          style={{ borderBottom: thinBorder }}
                        >
                          <td className="px-4 py-3 whitespace-nowrap sp-text-ink font-medium sp-body">
                            {entry.entry_name || `Entry #${entry.entry_number}`}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap sp-text-slate sp-body">
                            {username}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <Badge variant={entry.has_submitted_predictions ? 'green' : 'gray'}>
                              {entry.has_submitted_predictions ? 'Submitted' : 'Pending'}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap sp-text-ink sp-body">
                            {entry.match_points ?? 0}
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap sp-text-ink sp-body">
                            {entry.bonus_points ?? 0}
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap sp-body">
                            {entry.point_adjustment !== 0 ? (
                              <span
                                className={entry.point_adjustment > 0 ? 'sp-text-green' : 'sp-text-red'}
                                title={entry.adjustment_reason || undefined}
                              >
                                {entry.point_adjustment > 0 ? '+' : ''}{entry.point_adjustment}
                              </span>
                            ) : (
                              <span className="sp-text-slate">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap font-bold sp-text-ink sp-body">
                            {entry.total_points}
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap sp-body">
                            {entry.current_rank != null ? (
                              <span className={`font-bold ${entry.current_rank <= 3 ? 'sp-text-primary' : 'sp-text-ink'}`}>
                                #{entry.current_rank}
                              </span>
                            ) : (
                              <span className="sp-text-slate">-</span>
                            )}
                          </td>
                          <td className="px-2 py-3 whitespace-nowrap">
                            <DropdownMenu items={entryActions} />
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Scoring config summary (if settings exist) */}
      {settings && (
        <div>
          <h3 className="text-sm font-semibold sp-text-ink sp-heading mb-3">Scoring Configuration</h3>
          <div
            className="sp-bg-surface sp-radius-sm p-4"
            style={{ border: thinBorder }}
          >
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
              <div className="space-y-2">
                <h4 className="text-xs font-medium uppercase tracking-wide sp-text-slate sp-body">Group Stage</h4>
                {[
                  ['Exact Score', settings.group_exact_score],
                  ['Correct GD', settings.group_correct_difference],
                  ['Correct Result', settings.group_correct_result],
                ].map(([label, val]) => (
                  <div key={String(label)} className="flex justify-between">
                    <span className="sp-text-slate sp-body">{label}</span>
                    <span className="sp-text-ink font-medium sp-body">{val} pts</span>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                <h4 className="text-xs font-medium uppercase tracking-wide sp-text-slate sp-body">Knockout</h4>
                {[
                  ['Exact Score', settings.knockout_exact_score],
                  ['Correct GD', settings.knockout_correct_difference],
                  ['Correct Result', settings.knockout_correct_result],
                ].map(([label, val]) => (
                  <div key={String(label)} className="flex justify-between">
                    <span className="sp-text-slate sp-body">{label}</span>
                    <span className="sp-text-ink font-medium sp-body">{val} pts</span>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                <h4 className="text-xs font-medium uppercase tracking-wide sp-text-slate sp-body">Multipliers</h4>
                {[
                  ['R16', settings.round_16_multiplier],
                  ['QF', settings.quarter_final_multiplier],
                  ['SF', settings.semi_final_multiplier],
                  ['Final', settings.final_multiplier],
                ].map(([label, val]) => (
                  <div key={String(label)} className="flex justify-between">
                    <span className="sp-text-slate sp-body">{label}</span>
                    <span className="sp-text-ink font-medium sp-body">{val}x</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Activity log */}
      <div>
        <h3 className="text-sm font-semibold sp-text-ink sp-heading mb-3">
          Activity ({auditLog.length})
        </h3>
        {auditLog.length === 0 ? (
          <div
            className="sp-bg-surface sp-radius-sm p-6 text-center"
            style={{ border: thinBorder }}
          >
            <p className="text-sm sp-text-slate sp-body">No activity recorded for this pool.</p>
          </div>
        ) : (
          <div
            className="sp-radius-lg overflow-hidden sp-bg-surface"
            style={{ boxShadow: '0 2px 10px rgba(0, 0, 0, 0.04)', border: cardBorder }}
          >
            <div className="overflow-x-auto overscroll-x-contain">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: 'var(--sp-snow)', borderBottom: thinBorder }}>
                    <th className="text-left px-4 py-3 font-medium sp-text-slate whitespace-nowrap sp-body">Action</th>
                    <th className="text-left px-4 py-3 font-medium sp-text-slate whitespace-nowrap sp-body">By</th>
                    <th className="text-left px-4 py-3 font-medium sp-text-slate whitespace-nowrap sp-body">Summary</th>
                    <th className="text-left px-4 py-3 font-medium sp-text-slate whitespace-nowrap sp-body">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLog.map((log) => (
                    <tr
                      key={log.id}
                      className="sp-hover-snow transition-colors"
                      style={{ borderBottom: thinBorder }}
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Badge variant={ACTION_BADGE_VARIANT[log.action] || 'blue'}>
                          {ACTION_LABELS[log.action] || log.action}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap sp-text-ink sp-body">
                        {log.performer?.username || '-'}
                      </td>
                      <td className="px-4 py-3 sp-text-slate sp-body">
                        <div className="max-w-[300px] truncate">{log.summary || '-'}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap sp-text-slate sp-body">
                        {formatDateTime(log.performed_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Action modals */}
      <ActionModals
        actionModal={actionModal}
        setActionModal={setActionModal}
        poolId={pool.pool_id}
        poolName={pool.pool_name}
        showToast={showToast}
        onActionComplete={handleActionComplete}
      />
    </div>
  )
}

// =============================================
// MAIN COMPONENT
// =============================================
export function PoolsTab({ pools, setPools, onNavigateToUser }: PoolsTabProps) {
  const { showToast } = useToast()

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  // Detail sheet state
  const [selectedPool, setSelectedPool] = useState<PoolDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

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

  // Open pool detail sheet
  const openPoolDetail = useCallback(async (pool: SuperPoolData) => {
    setLoadingDetail(true)
    setSelectedPool(null)
    try {
      const res = await fetch(`/api/admin/pools/${pool.pool_id}`)
      if (res.ok) {
        const data = await res.json()
        setSelectedPool(data)
      } else {
        showToast('Failed to load pool details', 'error')
      }
    } catch {
      showToast('Failed to load pool details', 'error')
    } finally {
      setLoadingDetail(false)
    }
  }, [showToast])

  // Refresh pool detail (re-fetch)
  const refreshPoolDetail = useCallback(async () => {
    if (!selectedPool) return
    try {
      const res = await fetch(`/api/admin/pools/${selectedPool.pool.pool_id}`)
      if (res.ok) {
        const data = await res.json()
        setSelectedPool(data)
      } else {
        showToast('Failed to refresh pool details', 'error')
      }
    } catch {
      showToast('Failed to refresh pool details', 'error')
    }
  }, [selectedPool, showToast])

  function goBack() {
    setSelectedPool(null)
    setLoadingDetail(false)
  }

  function handlePoolDeleted() {
    if (selectedPool) {
      setPools(pools.filter((p) => p.pool_id !== selectedPool.pool.pool_id))
    }
    goBack()
  }

  // Status filter options
  const statusOptions: { value: string; label: string; count: number | null }[] = [
    { value: 'all', label: 'All', count: null },
    { value: 'open', label: 'Open', count: pools.filter((p) => p.status === 'open').length },
    { value: 'closed', label: 'Closed', count: pools.filter((p) => p.status === 'closed').length },
    { value: 'completed', label: 'Completed', count: pools.filter((p) => p.status === 'completed').length },
  ]

  // ===== DETAIL SHEET =====
  if (selectedPool || loadingDetail) {
    if (loadingDetail && !selectedPool) {
      return (
        <div className="sp-body space-y-6">
          <button
            onClick={goBack}
            className="flex items-center gap-1.5 text-sm font-medium text-neutral-500 hover:text-neutral-900 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
            Pools
          </button>
          <div className="text-center py-16">
            <p className="text-sm sp-text-slate sp-body">Loading pool details...</p>
          </div>
        </div>
      )
    }

    if (selectedPool) {
      return (
        <PoolDetailSheet
          detail={selectedPool}
          onBack={goBack}
          onRefresh={refreshPoolDetail}
          onPoolDeleted={handlePoolDeleted}
          onNavigateToUser={onNavigateToUser}
        />
      )
    }
  }

  // ===== LIST VIEW =====
  const poolColumns: SpColumn<SuperPoolData>[] = [
    {
      key: 'pool',
      header: 'Pool',
      sticky: true,
      render: (pool) => (
        <div>
          <span className="sp-heading" style={{ fontSize: 14, fontWeight: 700 }}>
            {pool.pool_name}
          </span>
          {pool.description && (
            <p style={{ fontSize: 12, color: 'var(--sp-slate)', marginTop: 1 }} className="truncate max-w-[200px]">
              {pool.description}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'code',
      header: 'Code',
      render: (pool) => (
        <span className="font-mono" style={{ fontSize: 13 }}>{pool.pool_code}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      render: (pool) => (
        <Badge variant={getStatusVariant(pool.status)}>
          {pool.status}
        </Badge>
      ),
    },
    {
      key: 'members',
      header: 'Members',
      align: 'center',
      render: (pool) => (
        <span style={{ fontSize: 13, fontWeight: 600 }}>{getMemberCount(pool)}</span>
      ),
    },
    {
      key: 'admin',
      header: 'Admin',
      render: (pool) => (
        <span style={{ fontSize: 13, color: 'var(--sp-slate)' }}>
          {pool.admin_user?.username || 'Unknown'}
        </span>
      ),
    },
    {
      key: 'mode',
      header: 'Mode',
      render: (pool) => (
        <span style={{ fontSize: 13, color: 'var(--sp-slate)' }}>
          {MODE_LABELS[pool.prediction_mode] || pool.prediction_mode}
        </span>
      ),
    },
    {
      key: 'created',
      header: 'Created',
      render: (pool) => (
        <span style={{ fontSize: 13, color: 'var(--sp-slate)' }}>
          {formatDate(pool.created_at)}
        </span>
      ),
    },
  ]

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-extrabold sp-heading mb-4">
          <span className="sp-text-ink">Pool</span>
          <span className="sp-text-primary">Management</span>
        </h2>
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {statusOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setStatusFilter(opt.value)}
                className={`px-3 py-1.5 sp-radius-sm text-xs font-medium sp-body transition-colors ${
                  statusFilter === opt.value
                    ? 'sp-bg-primary-light sp-text-primary'
                    : 'sp-bg-mist sp-text-slate sp-hover-snow'
                }`}
              >
                {opt.label}{opt.count != null && <span className="ml-1 opacity-70">{opt.count}</span>}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search pools..."
            className="px-3 py-2 border sp-border-silver sp-radius-md text-sm sp-text-ink sp-bg-surface w-full max-w-64 focus:ring-2 focus:ring-primary-500 focus:border-transparent placeholder:text-neutral-400"
          />
        </div>
      </div>

      {/* Pools — mobile cards */}
      <div className="sm:hidden space-y-3">
        {filteredPools.length === 0 ? (
          <div className="sp-bg-surface sp-radius-lg p-8 text-center sp-text-slate" style={{ border: cardBorder }}>
            No pools found.
          </div>
        ) : (
          filteredPools.map((pool) => (
            <button
              key={pool.pool_id}
              onClick={() => openPoolDetail(pool)}
              className="w-full text-left sp-bg-surface sp-radius-lg overflow-hidden transition-shadow hover:shadow-md"
              style={{ border: cardBorder }}
            >
              <div className="flex items-center gap-2 px-3.5 py-2" style={{ backgroundColor: 'var(--sp-snow)', borderBottom: thinBorder }}>
                <span className="font-semibold text-sm sp-text-ink truncate sp-heading">
                  {pool.pool_name}
                </span>
                <div className="flex gap-1.5 ml-auto flex-shrink-0">
                  <Badge variant={getStatusVariant(pool.status)}>{pool.status}</Badge>
                </div>
              </div>
              <div className="px-3.5 py-3">
                {pool.description && (
                  <p className="text-xs sp-text-slate mb-2 line-clamp-1 sp-body">{pool.description}</p>
                )}
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] sp-text-slate sp-body mb-2">
                  <span>Code: <strong className="font-mono">{pool.pool_code}</strong></span>
                  <span>Members: <strong>{getMemberCount(pool)}</strong></span>
                  <span>Admin: <strong>{pool.admin_user?.username || 'Unknown'}</strong></span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] sp-text-slate sp-body">
                    {formatDate(pool.created_at)}
                  </span>
                  <svg className="w-4 h-4 sp-text-slate" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                  </svg>
                </div>
              </div>
            </button>
          ))
        )}
      </div>

      {/* Pools — desktop table (clickable rows) */}
      <div className="hidden sm:block">
        <SpTable<SuperPoolData>
          columns={poolColumns}
          data={filteredPools}
          keyFn={(p) => p.pool_id}
          emptyMessage="No pools found."
          onRowClick={openPoolDetail}
        />
      </div>
    </div>
  )
}
