'use client'

import { useState, useCallback, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { SuperUserData } from './page'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { useToast } from '@/components/ui/Toast'
import { logAuditEvent } from '@/lib/audit'
import { SpTable, type SpColumn } from './SpTable'

// =============================================
// TYPES
// =============================================
type UsersTabProps = {
  users: SuperUserData[]
  setUsers: (users: SuperUserData[]) => void
  currentUserId: string
  navigateToUserId?: string | null
  clearNavigateToUser?: () => void
}

type ModalState =
  | { type: 'none' }
  | { type: 'promote_admin'; user: SuperUserData }

type ActionModal =
  | { type: 'none' }
  | { type: 'send_email' }
  | { type: 'add_note' }
  | { type: 'flag_user'; currentlyFlagged: boolean }
  | { type: 'delete_account' }
  | { type: 'adjust_points'; entryId: string; entryName: string; poolName: string; currentAdj: number }
  | { type: 'remove_from_pool'; poolId: string; poolName: string }
  | { type: 'transfer_ownership'; poolId: string; poolName: string; members: { user_id: string; username: string }[] }
  | { type: 'unlock_predictions'; entryId: string; entryName: string; poolName: string }
  | { type: 'add_to_pool'; availablePools: { pool_id: string; pool_name: string; pool_code: string; status: string }[] }
  | { type: 'impersonate_confirm' }

type PoolMembership = {
  member_id: string
  role: string
  joined_at: string
  user_id: string
  entry_fee_paid: boolean
  pools: {
    pool_id: string
    pool_name: string
    pool_code: string
    status: string
    prediction_mode: string
    created_at: string
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

type NoteEntry = {
  id: string
  performed_at: string
  summary: string | null
  performer?: { username: string } | null
}

type AvailablePool = {
  pool_id: string
  pool_name: string
  pool_code: string
  status: string
}

type UserDetail = {
  user: SuperUserData
  memberships: PoolMembership[]
  auditOnUser: AuditEntry[]
  auditByUser: AuditEntry[]
  notes: NoteEntry[]
  isFlagged: boolean
  poolMembers: Record<string, { user_id: string; username: string }[]>
  availablePools: AvailablePool[]
}

// =============================================
// HELPERS
// =============================================
const MODE_LABELS: Record<string, string> = {
  full_tournament: 'Full Tournament',
  progressive: 'Progressive',
  bracket_picker: 'Bracket',
}

const ACTION_LABELS: Record<string, string> = {
  promote_admin: 'Promoted to admin',
  demote_admin: 'Demoted from admin',
  toggle_active: 'Account status changed',
  enter_result: 'Entered match result',
  reset_match: 'Reset match',
  update_live_score: 'Updated live score',
  set_status: 'Changed match status',
  advance_teams: 'Advanced teams',
  delete_pool: 'Deleted pool',
  unlock_predictions: 'Predictions unlocked',
  adjust_points: 'Points adjusted',
  reset_password: 'Password reset sent',
  send_email: 'Email sent',
  admin_note: 'Admin note',
  flag_user: 'Account flagged',
  unflag_user: 'Account unflagged',
  remove_from_pool: 'Removed from pool',
  transfer_ownership: 'Ownership transferred',
  add_to_pool: 'Added to pool',
  impersonate: 'Impersonation link',
  delete_account: 'Account deleted',
}

const ACTION_BADGE_VARIANT: Record<string, 'blue' | 'green' | 'yellow' | 'gray'> = {
  flag_user: 'yellow',
  unflag_user: 'green',
  delete_account: 'gray',
  remove_from_pool: 'gray',
  add_to_pool: 'green',
  admin_note: 'gray',
  send_email: 'blue',
  reset_password: 'yellow',
  adjust_points: 'yellow',
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

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

// Shared inline border style
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
  userId,
  username,
  showToast,
  onActionComplete,
}: {
  actionModal: ActionModal
  setActionModal: (m: ActionModal) => void
  userId: string
  username: string
  showToast: (msg: string, variant: 'success' | 'error') => void
  onActionComplete: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Form state
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [noteContent, setNoteContent] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [adjustAmount, setAdjustAmount] = useState('')
  const [adjustReason, setAdjustReason] = useState('')
  const [selectedNewAdmin, setSelectedNewAdmin] = useState('')
  const [selectedPool, setSelectedPool] = useState('')
  const [flagReason, setFlagReason] = useState('')

  async function callAction(action: string, payload: Record<string, any> = {}) {
    setSaving(true)
    setFormError(null)
    try {
      const res = await fetch(`/api/admin/users/${userId}/actions`, {
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
    setEmailSubject('')
    setEmailBody('')
    setNoteContent('')
    setDeleteConfirm('')
    setAdjustAmount('')
    setAdjustReason('')
    setSelectedNewAdmin('')
    setSelectedPool('')
    setFlagReason('')
  }

  if (actionModal.type === 'none') return null

  // Shared props for all ModalShell usages
  const shellProps = { onClose: close, saving, formError }

  // ---- Flag / Unflag ----
  if (actionModal.type === 'flag_user') {
    const isFlagging = !actionModal.currentlyFlagged
    return (
      <ModalShell
        {...shellProps}
        title={isFlagging ? 'Flag Account' : 'Unflag Account'}
        danger={isFlagging}
        submitLabel={isFlagging ? 'Flag Account' : 'Unflag Account'}
        submitDisabled={!flagReason.trim()}
        onSubmit={async () => {
          const result = await callAction('toggle_flag', { reason: flagReason.trim() })
          if (result) {
            showToast(result.isFlagged ? 'Account flagged' : 'Account unflagged', 'success')
            close()
            onActionComplete()
          }
        }}
      >
        <div className="space-y-3">
          <p className="text-sm sp-text-ink sp-body">
            {isFlagging
              ? <>Flag <strong>{username}</strong> for review. This will be visible to all super admins.</>
              : <>Remove the flag from <strong>{username}</strong>.</>
            }
          </p>
          <div>
            <label className="block text-sm font-medium sp-text-ink mb-1 sp-body">
              Reason (required)
            </label>
            <textarea
              value={flagReason}
              onChange={(e) => setFlagReason(e.target.value)}
              placeholder={isFlagging ? 'Why is this account being flagged?' : 'Why is the flag being removed?'}
              rows={3}
              className="w-full px-3 py-2 border sp-border-silver sp-radius-sm text-sm sp-text-ink sp-bg-surface focus:ring-2 focus:ring-primary-500 resize-y"
            />
          </div>
        </div>
      </ModalShell>
    )
  }

  // ---- Send Email ----
  if (actionModal.type === 'send_email') {
    return (
      <ModalShell
        {...shellProps}
        title={`Send Email to ${username}`}
        submitLabel="Send Email"
        submitDisabled={!emailSubject.trim() || !emailBody.trim()}
        onSubmit={async () => {
          const result = await callAction('send_email', { subject: emailSubject, body: emailBody })
          if (result) {
            showToast('Email sent successfully', 'success')
            close()
            onActionComplete()
          }
        }}
      >
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium sp-text-ink mb-1 sp-body">Subject</label>
            <input
              type="text"
              value={emailSubject}
              onChange={(e) => setEmailSubject(e.target.value)}
              placeholder="Email subject..."
              className="w-full px-3 py-2 border sp-border-silver sp-radius-sm text-sm sp-text-ink sp-bg-surface focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium sp-text-ink mb-1 sp-body">Body (HTML)</label>
            <textarea
              value={emailBody}
              onChange={(e) => setEmailBody(e.target.value)}
              placeholder="Email body content..."
              rows={6}
              className="w-full px-3 py-2 border sp-border-silver sp-radius-sm text-sm sp-text-ink sp-bg-surface focus:ring-2 focus:ring-primary-500 resize-y"
            />
          </div>
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
          placeholder="Internal note about this user..."
          rows={4}
          className="w-full px-3 py-2 border sp-border-silver sp-radius-sm text-sm sp-text-ink sp-bg-surface focus:ring-2 focus:ring-primary-500 resize-y"
        />
        <p className="text-xs sp-text-slate mt-1.5 sp-body">
          This note is only visible to super admins.
        </p>
      </ModalShell>
    )
  }

  // ---- Delete Account ----
  if (actionModal.type === 'delete_account') {
    return (
      <ModalShell
        {...shellProps}
        title="Delete Account"
        danger
        submitLabel="Delete Account"
        submitDisabled={deleteConfirm !== username}
        onSubmit={async () => {
          const result = await callAction('delete_account', { confirm_username: deleteConfirm })
          if (result) {
            showToast(`Account ${username} deleted`, 'success')
            close()
            onActionComplete()
          }
        }}
      >
        <div className="bg-danger-50 border border-danger-200 rounded-xl p-4 mb-4">
          <p className="text-sm text-danger-700 font-medium mb-2">
            This action is permanent and cannot be undone!
          </p>
          <p className="text-sm text-danger-600">
            Deleting <strong>{username}</strong> will permanently remove:
          </p>
          <ul className="list-disc list-inside text-sm text-danger-600 mt-2 space-y-1">
            <li>Their user account and auth credentials</li>
            <li>All pool memberships and entries</li>
            <li>All predictions, scores, and rankings</li>
            <li>All audit log entries for this user</li>
          </ul>
        </div>
        <div>
          <label className="block text-sm font-medium text-danger-700 mb-1">
            Type <span className="font-bold">{username}</span> to confirm
          </label>
          <input
            type="text"
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            placeholder={username}
            className="w-full px-3 py-2 border border-danger-300 rounded-xl text-sm text-neutral-900 focus:ring-2 focus:ring-danger-500 focus:border-transparent"
          />
        </div>
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
              {actionModal.entryName} &middot; {actionModal.poolName}
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

  // ---- Remove from Pool ----
  if (actionModal.type === 'remove_from_pool') {
    return (
      <ModalShell
        {...shellProps}
        title="Remove from Pool"
        danger
        submitLabel="Remove"
        onSubmit={async () => {
          const result = await callAction('remove_from_pool', { pool_id: actionModal.poolId })
          if (result) {
            showToast(`Removed from ${actionModal.poolName}`, 'success')
            close()
            onActionComplete()
          }
        }}
      >
        <p className="text-sm sp-text-ink sp-body">
          Remove <strong>{username}</strong> from <strong>{actionModal.poolName}</strong>?
          This will delete all their entries, predictions, and scores in this pool.
        </p>
      </ModalShell>
    )
  }

  // ---- Transfer Ownership ----
  if (actionModal.type === 'transfer_ownership') {
    return (
      <ModalShell
        {...shellProps}
        title="Transfer Pool Ownership"
        submitLabel="Transfer"
        submitDisabled={!selectedNewAdmin}
        onSubmit={async () => {
          const result = await callAction('transfer_ownership', {
            pool_id: actionModal.poolId,
            new_admin_user_id: selectedNewAdmin,
          })
          if (result) {
            showToast(`Ownership of ${actionModal.poolName} transferred`, 'success')
            close()
            onActionComplete()
          }
        }}
      >
        <div className="space-y-3">
          <p className="text-sm sp-text-ink sp-body">
            Transfer admin of <strong>{actionModal.poolName}</strong> from <strong>{username}</strong> to:
          </p>
          <select
            value={selectedNewAdmin}
            onChange={(e) => setSelectedNewAdmin(e.target.value)}
            className="w-full px-3 py-2 border sp-border-silver sp-radius-sm text-sm sp-text-ink sp-bg-surface"
          >
            <option value="">Select new admin...</option>
            {actionModal.members.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.username}
              </option>
            ))}
          </select>
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
          Unlock predictions for <strong>{actionModal.entryName}</strong> in{' '}
          <strong>{actionModal.poolName}</strong>?
          The user will be able to edit and resubmit their predictions.
        </p>
      </ModalShell>
    )
  }

  // ---- Add to Pool ----
  if (actionModal.type === 'add_to_pool') {
    return (
      <ModalShell
        {...shellProps}
        title="Add to Pool"
        submitLabel="Add to Pool"
        submitDisabled={!selectedPool}
        onSubmit={async () => {
          const result = await callAction('add_to_pool', { pool_id: selectedPool })
          if (result) {
            const pool = actionModal.availablePools.find((p) => p.pool_id === selectedPool)
            showToast(`Added to ${pool?.pool_name || 'pool'}`, 'success')
            close()
            onActionComplete()
          }
        }}
      >
        <div className="space-y-3">
          <p className="text-sm sp-text-ink sp-body">
            Add <strong>{username}</strong> as a player to a pool:
          </p>
          {actionModal.availablePools.length === 0 ? (
            <p className="text-sm sp-text-slate sp-body">
              This user is already a member of all available pools.
            </p>
          ) : (
            <select
              value={selectedPool}
              onChange={(e) => setSelectedPool(e.target.value)}
              className="w-full px-3 py-2 border sp-border-silver sp-radius-sm text-sm sp-text-ink sp-bg-surface"
            >
              <option value="">Select a pool...</option>
              {actionModal.availablePools.map((p) => (
                <option key={p.pool_id} value={p.pool_id}>
                  {p.pool_name} ({p.pool_code}) — {p.status}
                </option>
              ))}
            </select>
          )}
        </div>
      </ModalShell>
    )
  }

  // ---- Impersonate Confirm ----
  if (actionModal.type === 'impersonate_confirm') {
    return (
      <ModalShell
        {...shellProps}
        title="Impersonate User"
        submitLabel="Sign in as this user"
        onSubmit={async () => {
          // 1. Get OTP token from the server
          const result = await callAction('impersonate')
          if (!result?.token || !result?.email) return

          // 2. Verify OTP client-side to create the session in this browser
          const { createClient } = await import('@/lib/supabase/client')
          const supabase = createClient()
          const { error: verifyError } = await supabase.auth.verifyOtp({
            email: result.email,
            token: result.token,
            type: 'magiclink',
          })

          if (verifyError) {
            setFormError(verifyError.message)
            return
          }

          // 3. Redirect to dashboard as the impersonated user
          showToast(`Signed in as ${username}`, 'success')
          close()
          window.location.href = '/dashboard'
        }}
      >
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-2">
          <p className="text-sm text-amber-800 font-medium mb-2">
            Warning: This will sign you out of your admin account!
          </p>
          <p className="text-sm text-amber-700">
            You will be logged in as <strong>{username}</strong> in this browser.
            To return to your admin account, you will need to sign out and log back in.
          </p>
        </div>
        <p className="text-xs sp-text-slate sp-body">
          This action is logged in the audit trail.
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
// DETAIL SHEET COMPONENT
// =============================================
function UserDetailSheet({
  detail,
  currentUserId,
  onBack,
  onToggleAdmin,
  onToggleActive,
  onRefresh,
  onUserDeleted,
}: {
  detail: UserDetail
  currentUserId: string
  onBack: () => void
  onToggleAdmin: (user: SuperUserData, makeSuperAdmin: boolean) => void
  onToggleActive: (user: SuperUserData) => void
  onRefresh: () => void
  onUserDeleted: (userId: string) => void
}) {
  const { user, memberships, auditOnUser, auditByUser, notes, isFlagged, poolMembers, availablePools } = detail
  const isCurrentUser = user.user_id === currentUserId
  const [activityTab, setActivityTab] = useState<'on' | 'by'>('on')
  const [actionModal, setActionModal] = useState<ActionModal>({ type: 'none' })
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const { showToast } = useToast()

  // Aggregate stats
  const totalPools = memberships.length
  const adminPools = memberships.filter((m) => m.role === 'admin').length
  const totalEntries = memberships.reduce((sum, m) => sum + m.pool_entries.length, 0)
  const submittedEntries = memberships.reduce(
    (sum, m) => sum + m.pool_entries.filter((e) => e.has_submitted_predictions).length,
    0
  )
  const totalPoints = memberships.reduce(
    (sum, m) => sum + m.pool_entries.reduce((s, e) => s + (e.total_points || 0), 0),
    0
  )
  const bestRank = memberships
    .flatMap((m) => m.pool_entries)
    .reduce((best: number | null, e) => {
      if (e.current_rank == null) return best
      if (best == null) return e.current_rank
      return Math.min(best, e.current_rank)
    }, null)

  const auditList = activityTab === 'on' ? auditOnUser : auditByUser

  // Quick action helpers
  async function quickAction(action: string, payload: Record<string, any> = {}) {
    setActionLoading(action)
    try {
      const res = await fetch(`/api/admin/users/${user.user_id}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload }),
      })
      const data = await res.json()
      if (!res.ok) {
        showToast(data.error || 'Action failed', 'error')
        return null
      }
      return data
    } catch {
      showToast('Network error', 'error')
      return null
    } finally {
      setActionLoading(null)
    }
  }

  async function handleResetPassword() {
    if (!confirm(`Send a password reset email to ${user.email}?`)) return
    const result = await quickAction('reset_password')
    if (result) {
      showToast('Password reset email sent', 'success')
      onRefresh()
    }
  }

  function handleToggleFlag() {
    setActionModal({ type: 'flag_user', currentlyFlagged: isFlagged })
  }

  function handleImpersonate() {
    setActionModal({ type: 'impersonate_confirm' })
  }

  function handleActionComplete() {
    // Check if it was a delete action
    if (actionModal.type === 'delete_account') {
      onUserDeleted(user.user_id)
    } else {
      onRefresh()
    }
  }

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
        Users
      </button>

      {/* User profile header */}
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div
          className="w-14 h-14 sp-radius-md flex items-center justify-center shrink-0 text-xl font-bold sp-heading"
          style={{ backgroundColor: 'var(--sp-primary-light)', color: 'var(--sp-primary)' }}
        >
          {user.username.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-2xl font-extrabold sp-heading sp-text-ink">
              {user.username}
            </h2>
            {isCurrentUser && (
              <span className="text-xs sp-text-primary font-medium">(you)</span>
            )}
            <div className="flex gap-1.5 flex-wrap">
              {user.is_super_admin ? (
                <Badge variant="yellow">Super Admin</Badge>
              ) : (
                <Badge variant="gray">User</Badge>
              )}
              <Badge variant={user.is_active ? 'green' : 'gray'}>
                {user.is_active ? 'Active' : 'Inactive'}
              </Badge>
              {isFlagged && (
                <Badge variant="yellow">Flagged</Badge>
              )}
            </div>
          </div>
          <p className="text-sm sp-text-slate mt-0.5 sp-body">
            {user.full_name && <span className="sp-text-ink">{user.full_name} &middot; </span>}
            {user.email}
          </p>
        </div>
        {/* Actions */}
        {!isCurrentUser && (
          <div className="flex gap-1.5 shrink-0 flex-wrap">
            <Button
              size="xs"
              variant="outline"
              onClick={() => onToggleAdmin(user, !user.is_super_admin)}
            >
              {user.is_super_admin ? 'Remove Admin' : 'Make Admin'}
            </Button>
            <Button
              size="xs"
              variant="outline"
              className={user.is_active
                ? '!text-danger-600 !border-danger-200 hover:!bg-danger-50'
                : '!text-success-600 !border-success-200 hover:!bg-success-50'
              }
              onClick={() => onToggleActive(user)}
            >
              {user.is_active ? 'Deactivate' : 'Reactivate'}
            </Button>
            <DropdownMenu
              items={[
                { label: isFlagged ? 'Unflag Account' : 'Flag Account', onClick: handleToggleFlag },
                { label: 'Reset Password', onClick: handleResetPassword },
                { label: 'Send Email', onClick: () => setActionModal({ type: 'send_email' }) },
                { label: 'Add Note', onClick: () => setActionModal({ type: 'add_note' }) },
                { label: 'Add to Pool', onClick: () => setActionModal({ type: 'add_to_pool', availablePools }) },
                { label: 'Impersonate', onClick: handleImpersonate },
                { label: 'Delete Account', danger: true, onClick: () => setActionModal({ type: 'delete_account' }) },
              ]}
            />
          </div>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Pools', value: totalPools, sub: `${adminPools} as admin` },
          { label: 'Entries', value: totalEntries, sub: `${submittedEntries} submitted` },
          { label: 'Total Points', value: totalPoints },
          { label: 'Best Rank', value: bestRank != null ? `#${bestRank}` : '-' },
          { label: 'Joined', value: formatDate(user.created_at) },
          { label: 'Last Login', value: user.last_login ? timeAgo(user.last_login) : 'Never' },
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
              <div className="text-[11px] sp-text-slate sp-body mt-0.5">{stat.sub}</div>
            )}
          </div>
        ))}
      </div>

      {/* Account details card */}
      <div
        className="sp-bg-surface sp-radius-sm p-4 space-y-2"
        style={{ border: thinBorder }}
      >
        <h3 className="text-xs font-medium uppercase tracking-wide sp-text-slate sp-body mb-3">Account Details</h3>
        {[
          ['User ID', user.user_id],
          ['Auth ID', user.auth_user_id || '-'],
          ['Email', user.email],
          ['Username', user.username],
          ['Full Name', user.full_name || '-'],
          ['Created', formatDateTime(user.created_at)],
          ['Last Login', user.last_login ? formatDateTime(user.last_login) : 'Never'],
        ].map(([label, value]) => (
          <div key={label} className="flex gap-3 text-sm">
            <span className="sp-text-slate w-24 shrink-0 sp-body">{label}</span>
            <span className="sp-text-ink sp-body truncate">{value}</span>
          </div>
        ))}
      </div>

      {/* Admin Notes */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold sp-text-ink sp-heading">
            Admin Notes ({notes.length})
          </h3>
          {!isCurrentUser && (
            <button
              onClick={() => setActionModal({ type: 'add_note' })}
              className="text-xs font-medium sp-text-primary hover:underline sp-body"
            >
              + Add Note
            </button>
          )}
        </div>
        {notes.length === 0 ? (
          <div
            className="sp-bg-surface sp-radius-sm p-4 text-center"
            style={{ border: thinBorder }}
          >
            <p className="text-sm sp-text-slate sp-body">No admin notes yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {notes.map((note) => (
              <div
                key={note.id}
                className="sp-bg-surface sp-radius-sm p-3.5"
                style={{ border: thinBorder }}
              >
                <p className="text-sm sp-text-ink sp-body whitespace-pre-wrap">{note.summary}</p>
                <div className="flex gap-3 mt-2 text-[11px] sp-text-slate sp-body">
                  <span>{note.performer?.username || 'System'}</span>
                  <span>{formatDateTime(note.performed_at)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pool memberships */}
      <div>
        <h3 className="text-sm font-semibold sp-text-ink sp-heading mb-3">
          Pool Memberships ({totalPools})
        </h3>
        {memberships.length === 0 ? (
          <div
            className="sp-bg-surface sp-radius-sm p-6 text-center"
            style={{ border: thinBorder }}
          >
            <p className="text-sm sp-text-slate sp-body">This user is not a member of any pools.</p>
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
                    <th className="text-left px-4 py-3 font-medium sp-text-slate whitespace-nowrap sp-body">Pool</th>
                    <th className="text-left px-4 py-3 font-medium sp-text-slate whitespace-nowrap sp-body">Role</th>
                    <th className="text-left px-4 py-3 font-medium sp-text-slate whitespace-nowrap sp-body">Mode</th>
                    <th className="text-left px-4 py-3 font-medium sp-text-slate whitespace-nowrap sp-body">Status</th>
                    <th className="text-right px-4 py-3 font-medium sp-text-slate whitespace-nowrap sp-body">Entries</th>
                    <th className="text-right px-4 py-3 font-medium sp-text-slate whitespace-nowrap sp-body">Points</th>
                    <th className="text-right px-4 py-3 font-medium sp-text-slate whitespace-nowrap sp-body">Rank</th>
                    <th className="text-left px-4 py-3 font-medium sp-text-slate whitespace-nowrap sp-body">Joined</th>
                    {!isCurrentUser && (
                      <th className="text-center px-4 py-3 font-medium sp-text-slate whitespace-nowrap sp-body w-10"></th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {memberships.map((m) => {
                    const pool = m.pools
                    const entries = m.pool_entries
                    const poolPoints = entries.reduce((s, e) => s + (e.total_points || 0), 0)
                    const topRank = entries.reduce((best: number | null, e) => {
                      if (e.current_rank == null) return best
                      if (best == null) return e.current_rank
                      return Math.min(best, e.current_rank)
                    }, null)

                    const menuItems: { label: string; danger?: boolean; onClick: () => void }[] = []
                    if (m.role === 'admin' && pool) {
                      const members = poolMembers[pool.pool_id] || []
                      if (members.length > 0) {
                        menuItems.push({
                          label: 'Transfer Ownership',
                          onClick: () => setActionModal({
                            type: 'transfer_ownership',
                            poolId: pool.pool_id,
                            poolName: pool.pool_name,
                            members,
                          }),
                        })
                      }
                    }
                    if (m.role !== 'admin' && pool) {
                      menuItems.push({
                        label: 'Remove from Pool',
                        danger: true,
                        onClick: () => setActionModal({
                          type: 'remove_from_pool',
                          poolId: pool.pool_id,
                          poolName: pool.pool_name,
                        }),
                      })
                    }

                    return (
                      <tr
                        key={m.member_id}
                        className="sp-hover-snow transition-colors"
                        style={{ borderBottom: thinBorder }}
                      >
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div>
                            <span className="sp-text-ink font-medium sp-body">{pool?.pool_name || 'Unknown'}</span>
                            {pool?.pool_code && (
                              <span className="ml-1.5 text-[11px] sp-text-slate font-mono">{pool.pool_code}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <Badge variant={m.role === 'admin' ? 'yellow' : 'gray'}>
                            {m.role === 'admin' ? 'Admin' : 'Player'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm sp-text-slate sp-body">
                          {pool ? MODE_LABELS[pool.prediction_mode] || pool.prediction_mode : '-'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <Badge variant={pool?.status === 'open' ? 'green' : pool?.status === 'closed' ? 'yellow' : 'gray'}>
                            {pool?.status || '-'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <span className="sp-text-ink font-medium sp-body">{entries.length}</span>
                          <span className="sp-text-slate text-xs ml-1">
                            ({entries.filter((e) => e.has_submitted_predictions).length} submitted)
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap font-medium sp-text-ink sp-body">
                          {poolPoints}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap sp-body">
                          {topRank != null ? (
                            <span className={`font-bold ${topRank <= 3 ? 'sp-text-primary' : 'sp-text-ink'}`}>
                              #{topRank}
                            </span>
                          ) : (
                            <span className="sp-text-slate">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm sp-text-slate sp-body">
                          {formatDate(m.joined_at)}
                        </td>
                        {!isCurrentUser && (
                          <td className="px-4 py-3 whitespace-nowrap text-center">
                            {menuItems.length > 0 && <DropdownMenu items={menuItems} />}
                          </td>
                        )}
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
      {memberships.some((m) => m.pool_entries.length > 0) && (
        <div>
          <h3 className="text-sm font-semibold sp-text-ink sp-heading mb-3">
            Entries ({totalEntries})
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
                    <th className="text-left px-4 py-3 font-medium sp-text-slate whitespace-nowrap sp-body">Pool</th>
                    <th className="text-left px-4 py-3 font-medium sp-text-slate whitespace-nowrap sp-body">Status</th>
                    <th className="text-right px-4 py-3 font-medium sp-text-slate whitespace-nowrap sp-body">Match Pts</th>
                    <th className="text-right px-4 py-3 font-medium sp-text-slate whitespace-nowrap sp-body">Bonus Pts</th>
                    <th className="text-right px-4 py-3 font-medium sp-text-slate whitespace-nowrap sp-body">Adj</th>
                    <th className="text-right px-4 py-3 font-medium sp-text-slate whitespace-nowrap sp-body">Total</th>
                    <th className="text-right px-4 py-3 font-medium sp-text-slate whitespace-nowrap sp-body">Rank</th>
                    {!isCurrentUser && (
                      <th className="text-center px-4 py-3 font-medium sp-text-slate whitespace-nowrap sp-body w-10"></th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {memberships.flatMap((m) =>
                    m.pool_entries.map((entry) => {
                      const entryMenuItems: { label: string; onClick: () => void }[] = []
                      if (entry.has_submitted_predictions) {
                        entryMenuItems.push({
                          label: 'Unlock Predictions',
                          onClick: () => setActionModal({
                            type: 'unlock_predictions',
                            entryId: entry.entry_id,
                            entryName: entry.entry_name || `Entry #${entry.entry_number}`,
                            poolName: m.pools?.pool_name || 'pool',
                          }),
                        })
                      }
                      entryMenuItems.push({
                        label: 'Adjust Points',
                        onClick: () => setActionModal({
                          type: 'adjust_points',
                          entryId: entry.entry_id,
                          entryName: entry.entry_name || `Entry #${entry.entry_number}`,
                          poolName: m.pools?.pool_name || 'pool',
                          currentAdj: entry.point_adjustment || 0,
                        }),
                      })

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
                            {m.pools?.pool_name || '-'}
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
                              <span className={entry.point_adjustment > 0 ? 'sp-text-green' : 'sp-text-red'} title={entry.adjustment_reason || undefined}>
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
                          {!isCurrentUser && (
                            <td className="px-4 py-3 whitespace-nowrap text-center">
                              <DropdownMenu items={entryMenuItems} />
                            </td>
                          )}
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

      {/* Activity log */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold sp-text-ink sp-heading">Activity</h3>
          <div
            className="flex gap-1 sp-radius-md p-1"
            style={{ backgroundColor: 'var(--sp-snow)', border: thinBorder }}
          >
            {([
              { key: 'on' as const, label: `On user (${auditOnUser.length})` },
              { key: 'by' as const, label: `By user (${auditByUser.length})` },
            ]).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActivityTab(tab.key)}
                className={`px-3 py-1.5 sp-radius-sm text-xs font-medium sp-body transition-colors ${
                  activityTab === tab.key
                    ? 'sp-bg-surface sp-text-ink shadow-sm'
                    : 'sp-text-slate hover:text-neutral-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {auditList.length === 0 ? (
          <div
            className="sp-bg-surface sp-radius-sm p-6 text-center"
            style={{ border: thinBorder }}
          >
            <p className="text-sm sp-text-slate sp-body">No activity recorded.</p>
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
                    {activityTab === 'on' && (
                      <th className="text-left px-4 py-3 font-medium sp-text-slate whitespace-nowrap sp-body">By</th>
                    )}
                    <th className="text-left px-4 py-3 font-medium sp-text-slate whitespace-nowrap sp-body">Summary</th>
                    <th className="text-left px-4 py-3 font-medium sp-text-slate whitespace-nowrap sp-body">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {auditList.map((log) => (
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
                      {activityTab === 'on' && (
                        <td className="px-4 py-3 whitespace-nowrap sp-text-ink sp-body">
                          {log.performer?.username || '-'}
                        </td>
                      )}
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
        userId={user.user_id}
        username={user.username}
        showToast={showToast}
        onActionComplete={handleActionComplete}
      />
    </div>
  )
}

// =============================================
// MAIN COMPONENT
// =============================================
export function UsersTab({ users, setUsers, currentUserId, navigateToUserId, clearNavigateToUser }: UsersTabProps) {
  const supabase = createClient()
  const { showToast } = useToast()

  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | 'super' | 'regular'>('all')
  const [modal, setModal] = useState<ModalState>({ type: 'none' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [promoteConfirm, setPromoteConfirm] = useState('')

  // Detail sheet state
  const [selectedUser, setSelectedUser] = useState<UserDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  const superAdminCount = users.filter((u) => u.is_super_admin).length

  const filteredUsers = users.filter((u) => {
    if (roleFilter === 'super' && !u.is_super_admin) return false
    if (roleFilter === 'regular' && u.is_super_admin) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        u.username.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.full_name && u.full_name.toLowerCase().includes(q))
      )
    }
    return true
  })

  // Open user detail sheet
  const openUserDetail = useCallback(async (user: SuperUserData) => {
    setLoadingDetail(true)
    setSelectedUser(null)
    try {
      const res = await fetch(`/api/admin/users/${user.user_id}`)
      if (res.ok) {
        const data = await res.json()
        setSelectedUser(data)
      } else {
        showToast('Failed to load user details', 'error')
      }
    } catch {
      showToast('Failed to load user details', 'error')
    } finally {
      setLoadingDetail(false)
    }
  }, [showToast])

  // Open user detail by ID (for cross-tab navigation)
  const openUserById = useCallback(async (userId: string) => {
    setLoadingDetail(true)
    setSelectedUser(null)
    try {
      const res = await fetch(`/api/admin/users/${userId}`)
      if (res.ok) {
        const data = await res.json()
        setSelectedUser(data)
      } else {
        showToast('Failed to load user details', 'error')
      }
    } catch {
      showToast('Failed to load user details', 'error')
    } finally {
      setLoadingDetail(false)
    }
  }, [showToast])

  // Handle cross-tab navigation from PoolsTab
  useEffect(() => {
    if (navigateToUserId) {
      openUserById(navigateToUserId)
      clearNavigateToUser?.()
    }
  }, [navigateToUserId, openUserById, clearNavigateToUser])

  // Refresh detail sheet (after an action)
  const refreshUserDetail = useCallback(async () => {
    if (!selectedUser) return
    try {
      const res = await fetch(`/api/admin/users/${selectedUser.user.user_id}`)
      if (res.ok) {
        const data = await res.json()
        setSelectedUser(data)
      }
    } catch {
      // silent
    }
  }, [selectedUser])

  function goBack() {
    setSelectedUser(null)
    setLoadingDetail(false)
  }

  function handleUserDeleted(userId: string) {
    setUsers(users.filter((u) => u.user_id !== userId))
    goBack()
    showToast('Account deleted', 'success')
  }

  async function handleToggleSuperAdmin(user: SuperUserData, makeSuperAdmin: boolean) {
    if (makeSuperAdmin) {
      setPromoteConfirm('')
      setError(null)
      setModal({ type: 'promote_admin', user })
      return
    }

    if (superAdminCount <= 1) {
      alert('Cannot remove the only super admin.')
      return
    }

    if (!confirm(`Remove super admin privileges from ${user.username}?`)) return

    const { error } = await supabase
      .from('users')
      .update({ is_super_admin: false })
      .eq('user_id', user.user_id)

    if (error) {
      alert('Failed: ' + error.message)
      return
    }

    setUsers(
      users.map((u) =>
        u.user_id === user.user_id ? { ...u, is_super_admin: false } : u
      )
    )
    if (selectedUser && selectedUser.user.user_id === user.user_id) {
      setSelectedUser({ ...selectedUser, user: { ...selectedUser.user, is_super_admin: false } })
    }
    logAuditEvent({
      action: 'demote_admin',
      target_user_id: user.user_id,
      details: { username: user.username, email: user.email },
      summary: `Removed super admin from ${user.username}`,
    })
  }

  async function handleConfirmPromote() {
    if (modal.type !== 'promote_admin') return

    if (promoteConfirm !== 'PROMOTE') {
      setError('Type PROMOTE to confirm.')
      return
    }

    setSaving(true)
    setError(null)

    const { error: updateError } = await supabase
      .from('users')
      .update({ is_super_admin: true })
      .eq('user_id', modal.user.user_id)

    if (updateError) {
      setError(updateError.message)
      setSaving(false)
      return
    }

    setUsers(
      users.map((u) =>
        u.user_id === modal.user.user_id ? { ...u, is_super_admin: true } : u
      )
    )
    if (selectedUser && selectedUser.user.user_id === modal.user.user_id) {
      setSelectedUser({ ...selectedUser, user: { ...selectedUser.user, is_super_admin: true } })
    }

    setSaving(false)
    setModal({ type: 'none' })
    showToast(`${modal.user.username} promoted to super admin.`, 'success')
    logAuditEvent({
      action: 'promote_admin',
      target_user_id: modal.user.user_id,
      details: { username: modal.user.username, email: modal.user.email },
      summary: `Promoted ${modal.user.username} to super admin`,
    })
  }

  async function handleToggleActive(user: SuperUserData) {
    if (user.user_id === currentUserId) {
      alert('Cannot deactivate your own account.')
      return
    }

    const newActive = !user.is_active
    const action = newActive ? 'reactivate' : 'deactivate'

    if (!confirm(`Are you sure you want to ${action} ${user.username}?`)) return

    const { error } = await supabase
      .from('users')
      .update({ is_active: newActive })
      .eq('user_id', user.user_id)

    if (error) {
      alert('Failed: ' + error.message)
      return
    }

    setUsers(
      users.map((u) =>
        u.user_id === user.user_id ? { ...u, is_active: newActive } : u
      )
    )
    if (selectedUser && selectedUser.user.user_id === user.user_id) {
      setSelectedUser({ ...selectedUser, user: { ...selectedUser.user, is_active: newActive } })
    }
    logAuditEvent({
      action: 'toggle_active',
      target_user_id: user.user_id,
      details: { username: user.username, is_active: newActive },
      summary: `${newActive ? 'Reactivated' : 'Deactivated'} user ${user.username}`,
    })
  }

  // ===== DETAIL SHEET =====
  if (selectedUser || loadingDetail) {
    if (loadingDetail && !selectedUser) {
      return (
        <div className="sp-body space-y-6">
          <button
            onClick={goBack}
            className="flex items-center gap-1.5 text-sm font-medium text-neutral-500 hover:text-neutral-900 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
            Users
          </button>
          <div className="text-center py-16">
            <p className="text-sm sp-text-slate sp-body">Loading user details...</p>
          </div>
        </div>
      )
    }

    if (selectedUser) {
      return (
        <>
          <UserDetailSheet
            detail={selectedUser}
            currentUserId={currentUserId}
            onBack={goBack}
            onToggleAdmin={handleToggleSuperAdmin}
            onToggleActive={handleToggleActive}
            onRefresh={refreshUserDetail}
            onUserDeleted={handleUserDeleted}
          />

          {/* Promote modal (needs to render even in detail view) */}
          {modal.type === 'promote_admin' && renderPromoteModal()}
        </>
      )
    }
  }

  // ===== LIST VIEW =====
  const userColumns: SpColumn<SuperUserData>[] = [
    {
      key: 'user',
      header: 'User',
      sticky: true,
      render: (user) => (
        <div>
          <span className="sp-heading" style={{ fontSize: 14, fontWeight: 700 }}>
            {user.username}
          </span>
          {user.user_id === currentUserId && (
            <span className="ml-1" style={{ fontSize: 12, color: 'var(--sp-primary)' }}>(you)</span>
          )}
          {user.full_name && (
            <p style={{ fontSize: 12, color: 'var(--sp-slate)', marginTop: 1 }}>{user.full_name}</p>
          )}
        </div>
      ),
    },
    {
      key: 'email',
      header: 'Email',
      render: (user) => <span style={{ fontSize: 13 }}>{user.email}</span>,
    },
    {
      key: 'role',
      header: 'Role',
      align: 'center',
      render: (user) =>
        user.is_super_admin ? (
          <Badge variant="yellow">Super Admin</Badge>
        ) : (
          <Badge variant="gray">User</Badge>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      render: (user) => (
        <Badge variant={user.is_active ? 'green' : 'gray'}>
          {user.is_active ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'joined',
      header: 'Joined',
      render: (user) => (
        <span style={{ fontSize: 13, color: 'var(--sp-slate)' }}>
          {formatDate(user.created_at)}
        </span>
      ),
    },
    {
      key: 'last_login',
      header: 'Last Login',
      render: (user) => {
        if (!user.last_login) return <span style={{ fontSize: 13, color: 'var(--sp-slate)' }}>Never</span>
        const d = new Date(user.last_login)
        return (
          <div>
            <span style={{ fontSize: 13, color: 'var(--sp-slate)' }}>
              {d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
            <p style={{ fontSize: 11, color: 'var(--sp-slate)', opacity: 0.7, marginTop: 1 }}>
              {d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </p>
          </div>
        )
      },
    },
  ]

  function renderPromoteModal() {
    if (modal.type !== 'promote_admin') return null
    return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
        <div className="fixed inset-0 bg-black/50" />
        <div className="relative bg-surface rounded-t-2xl sm:rounded-2xl shadow-xl sm:max-w-lg w-full p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-3 h-3 bg-danger-600 rounded-full animate-pulse" />
            <h3 className="text-xl font-bold text-danger-700">
              Promote to Super Admin
            </h3>
          </div>

          <div className="bg-danger-50 border border-danger-200 rounded-xl p-4 mb-4">
            <p className="text-sm text-danger-700 font-medium mb-2">
              WARNING: This grants full system access!
            </p>
            <p className="text-sm text-danger-600">
              Promoting <strong>{modal.user.username}</strong> ({modal.user.email}) to Super Admin will give them:
            </p>
            <ul className="list-disc list-inside text-sm text-danger-600 mt-2 space-y-1">
              <li>Access to enter and edit match results globally</li>
              <li>Ability to reset match scores</li>
              <li>Power to manage all users and pools</li>
              <li>Ability to promote other super admins</li>
            </ul>
          </div>

          {error && <Alert variant="error" className="mb-4">{error}</Alert>}

          <div className="mb-6">
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Type <span className="font-bold text-danger-600">PROMOTE</span> to confirm
            </label>
            <input
              type="text"
              value={promoteConfirm}
              onChange={(e) => setPromoteConfirm(e.target.value)}
              placeholder="PROMOTE"
              className="w-full px-3 py-2 border border-danger-300 rounded-xl text-sm text-neutral-900 focus:ring-2 focus:ring-danger-500 focus:border-transparent"
            />
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
              variant="danger"
              onClick={handleConfirmPromote}
              disabled={promoteConfirm !== 'PROMOTE'}
              loading={saving}
              loadingText="Promoting..."
            >
              Promote to Super Admin
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <h2 className="text-2xl font-extrabold sp-heading shrink-0">
          <span className="sp-text-ink">User</span><span className="sp-text-primary">Management</span>
        </h2>
        <div className="flex items-center gap-3">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as any)}
            className="px-3 py-2 border sp-border-silver sp-radius-md text-sm sp-text-slate sp-bg-surface appearance-none pr-8"
            style={{ WebkitAppearance: 'none', MozAppearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%237B87A8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }}
          >
            <option value="all">All Roles</option>
            <option value="super">Super Admins</option>
            <option value="regular">Regular Users</option>
          </select>

          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search users..."
            className="px-3 py-2 border sp-border-silver sp-radius-md text-sm sp-text-ink sp-bg-surface w-full max-w-64 focus:ring-2 focus:ring-primary-500 focus:border-transparent placeholder:text-neutral-400"
          />
        </div>
      </div>

      {/* Users — mobile cards */}
      <div className="sm:hidden space-y-3">
        {filteredUsers.length === 0 ? (
          <div className="sp-bg-surface sp-radius-lg p-8 text-center sp-text-slate" style={{ border: cardBorder }}>
            No users found.
          </div>
        ) : (
          filteredUsers.map((user) => {
            const isCurrentUser = user.user_id === currentUserId
            return (
              <button
                key={user.user_id}
                onClick={() => openUserDetail(user)}
                className={`w-full text-left sp-bg-surface sp-radius-lg overflow-hidden transition-shadow hover:shadow-md ${isCurrentUser ? 'ring-1 ring-primary-300' : ''}`}
                style={{ border: cardBorder }}
              >
                <div className="flex items-center gap-2 px-3.5 py-2" style={{ backgroundColor: 'var(--sp-snow)', borderBottom: thinBorder }}>
                  <span className="font-semibold text-sm sp-text-ink truncate sp-heading">
                    {user.username}
                  </span>
                  {isCurrentUser && <span className="text-[11px] sp-text-primary">(you)</span>}
                  <div className="flex gap-1.5 ml-auto flex-shrink-0">
                    {user.is_super_admin ? (
                      <Badge variant="yellow">Super Admin</Badge>
                    ) : (
                      <Badge variant="gray">User</Badge>
                    )}
                    <Badge variant={user.is_active ? 'green' : 'gray'}>
                      {user.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                </div>
                <div className="px-3.5 py-3">
                  <div className="text-sm sp-text-slate mb-2 sp-body">
                    {user.full_name && <p className="text-xs sp-text-slate mb-0.5">{user.full_name}</p>}
                    <p className="truncate">{user.email}</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex gap-3 text-[11px] sp-text-slate sp-body">
                      <span>Joined {formatDate(user.created_at)}</span>
                      <span>Login: {user.last_login ? formatDate(user.last_login) : 'Never'}</span>
                    </div>
                    <svg className="w-4 h-4 sp-text-slate" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                    </svg>
                  </div>
                </div>
              </button>
            )
          })
        )}
      </div>

      {/* Users — desktop table (clickable rows) */}
      <div className="hidden sm:block">
        <SpTable<SuperUserData>
          columns={userColumns}
          data={filteredUsers}
          keyFn={(u) => u.user_id}
          emptyMessage="No users found."
          rowClassName={(u) => u.user_id === currentUserId ? 'ring-1 ring-inset' : ''}
          onRowClick={openUserDetail}
        />
      </div>

      {/* Promote modal */}
      {renderPromoteModal()}
    </div>
  )
}
