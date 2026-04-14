'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { SuperUserData } from './page'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { useToast } from '@/components/ui/Toast'
import { logAuditEvent } from '@/lib/audit'
import { SpTable, type SpColumn } from './SpTable'

type UsersTabProps = {
  users: SuperUserData[]
  setUsers: (users: SuperUserData[]) => void
  currentUserId: string
}

type ModalState =
  | { type: 'none' }
  | { type: 'promote_admin'; user: SuperUserData }
  | { type: 'deactivate_user'; user: SuperUserData }

export function UsersTab({ users, setUsers, currentUserId }: UsersTabProps) {
  const supabase = createClient()
  const { showToast } = useToast()

  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | 'super' | 'regular'>('all')
  const [modal, setModal] = useState<ModalState>({ type: 'none' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [promoteConfirm, setPromoteConfirm] = useState('')

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

  async function handleToggleSuperAdmin(user: SuperUserData, makeSuperAdmin: boolean) {
    if (makeSuperAdmin) {
      setPromoteConfirm('')
      setError(null)
      setModal({ type: 'promote_admin', user })
      return
    }

    // Demoting - check if this is the only super admin
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
    logAuditEvent({
      action: 'toggle_active',
      target_user_id: user.user_id,
      details: { username: user.username, is_active: newActive },
      summary: `${newActive ? 'Reactivated' : 'Deactivated'} user ${user.username}`,
    })
  }

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
          {new Date(user.created_at).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
          })}
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
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (user) => {
        if (user.user_id === currentUserId) return null
        return (
          <div className="flex gap-1.5 justify-end">
            <Button
              size="xs"
              className="min-w-[100px]"
              variant="outline"
              onClick={() => handleToggleSuperAdmin(user, !user.is_super_admin)}
            >
              {user.is_super_admin ? 'Remove Admin' : 'Make Admin'}
            </Button>
            <Button
              size="xs"
              variant="outline"
              className={`min-w-[100px] ${user.is_active ? '!text-danger-600 !border-danger-200 hover:!bg-danger-50 dark:!text-danger-400 dark:!border-danger-800 dark:hover:!bg-danger-950' : '!text-success-600 !border-success-200 hover:!bg-success-50 dark:!text-success-400 dark:!border-success-800 dark:hover:!bg-success-950'}`}
              onClick={() => handleToggleActive(user)}
            >
              {user.is_active ? 'Deactivate' : 'Reactivate'}
            </Button>
          </div>
        )
      },
    },
  ]

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-6">
        <h2 className="text-2xl font-extrabold sp-heading shrink-0">
          <span className="text-neutral-900 dark:text-white">User</span>
          <span className="text-primary-600 dark:text-primary-500">Management</span>
        </h2>
        <div className="flex items-center gap-3">
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as any)}
          className="px-3 py-2 border border-neutral-300 dark:border-neutral-500 sp-radius-md text-sm text-neutral-700 dark:text-neutral-800 bg-white dark:bg-neutral-300 appearance-none pr-8"
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
          className="px-3 py-2 border border-neutral-300 dark:border-neutral-500 sp-radius-md text-sm text-neutral-700 dark:text-neutral-800 bg-white dark:bg-neutral-300 w-64 focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:placeholder-neutral-600"
        />
        </div>
      </div>

      {/* Users — mobile cards */}
      <div className="sm:hidden space-y-3">
        {filteredUsers.length === 0 ? (
          <div className="bg-surface rounded-xl shadow dark:shadow-none dark:border dark:border-border-default p-8 text-center text-neutral-600 dark:text-neutral-400">
            No users found.
          </div>
        ) : (
          filteredUsers.map((user, i) => {
            const isCurrentUser = user.user_id === currentUserId
            return (
              <div
                key={user.user_id}
                className={`bg-surface rounded-xl shadow dark:shadow-none dark:border dark:border-border-default overflow-hidden animate-fade-up ${isCurrentUser ? 'ring-1 ring-danger-300 dark:ring-danger-700' : ''}`}
                style={{ animationDelay: `${i * 0.05}s` }}
              >
                {/* Header bar: username + badges */}
                <div className="flex items-center gap-2 px-3.5 py-2 bg-neutral-100 dark:bg-neutral-200 border-b border-neutral-200 dark:border-neutral-700">
                  <span className="font-semibold text-sm text-neutral-900 dark:text-white truncate">
                    {user.username}
                  </span>
                  {isCurrentUser && <span className="text-[11px] text-primary-500">(you)</span>}
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
                {/* Body: details + actions */}
                <div className="px-3.5 py-3">
                  <div className="text-sm text-neutral-600 dark:text-neutral-400 mb-2">
                    {user.full_name && <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-0.5">{user.full_name}</p>}
                    <p className="truncate">{user.email}</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex gap-3 text-[11px] text-neutral-400 dark:text-neutral-500">
                      <span>Joined {new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                      <span>Login: {user.last_login ? new Date(user.last_login).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Never'}</span>
                    </div>
                  </div>
                  {!isCurrentUser && (
                    <div className="flex gap-1.5 mt-2.5 justify-end">
                      <Button
                        size="xs"
                        className="min-w-[100px]"
                        variant="outline"
                        onClick={() => handleToggleSuperAdmin(user, !user.is_super_admin)}
                      >
                        {user.is_super_admin ? 'Remove Admin' : 'Make Admin'}
                      </Button>
                      <Button
                        size="xs"
                        variant="outline"
                        className={`min-w-[100px] ${user.is_active ? '!text-danger-600 !border-danger-200 hover:!bg-danger-50 dark:!text-danger-400 dark:!border-danger-800 dark:hover:!bg-danger-950' : '!text-success-600 !border-success-200 hover:!bg-success-50 dark:!text-success-400 dark:!border-success-800 dark:hover:!bg-success-950'}`}
                        onClick={() => handleToggleActive(user)}
                      >
                        {user.is_active ? 'Deactivate' : 'Reactivate'}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Users — desktop table */}
      <div className="hidden sm:block">
        <SpTable<SuperUserData>
          columns={userColumns}
          data={filteredUsers}
          keyFn={(u) => u.user_id}
          emptyMessage="No users found."
          rowClassName={(u) => u.user_id === currentUserId ? 'ring-1 ring-inset' : ''}
        />
      </div>

      {/* Promote to Super Admin Modal */}
      {modal.type === 'promote_admin' && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
          <div className="fixed inset-0 bg-black/50" />
          <div className="relative bg-surface rounded-t-2xl sm:rounded-2xl shadow-xl sm:max-w-lg w-full p-6 dark:shadow-none dark:border dark:border-border-default">
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
      )}
    </div>
  )
}
