'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { SuperUserData } from './page'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { useToast } from '@/components/ui/Toast'

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
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-center sm:justify-between gap-3 mb-6">
        <h2 className="text-2xl font-bold text-neutral-900 dark:text-white">User Management</h2>
        <div className="flex gap-3 text-sm">
          <span className="px-3 py-1 bg-danger-100 text-danger-700 rounded-full font-medium">
            {superAdminCount} Super Admin{superAdminCount !== 1 ? 's' : ''}
          </span>
          <span className="px-3 py-1 bg-neutral-100 text-neutral-700 rounded-full font-medium">
            {users.length} Total Users
          </span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search users..."
          className="px-3 py-2 border border-neutral-300 dark:border-neutral-500 rounded-lg text-sm text-neutral-700 dark:text-neutral-200 bg-white dark:bg-neutral-800 w-64 focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:placeholder-neutral-500"
        />

        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as any)}
          className="px-3 py-2 border border-neutral-300 dark:border-neutral-500 rounded-lg text-sm text-neutral-700 dark:text-neutral-200 bg-white dark:bg-neutral-800"
        >
          <option value="all">All Roles</option>
          <option value="super">Super Admins</option>
          <option value="regular">Regular Users</option>
        </select>
      </div>

      {/* Users — mobile cards */}
      <div className="sm:hidden space-y-3">
        {filteredUsers.length === 0 ? (
          <div className="bg-surface rounded-lg shadow dark:shadow-none dark:border dark:border-border-default p-8 text-center text-neutral-600 dark:text-neutral-400">
            No users found.
          </div>
        ) : (
          filteredUsers.map((user) => {
            const isCurrentUser = user.user_id === currentUserId
            return (
              <div
                key={user.user_id}
                className={`bg-surface rounded-lg shadow dark:shadow-none dark:border dark:border-border-default p-4 ${isCurrentUser ? 'ring-1 ring-danger-300 dark:ring-danger-700' : ''}`}
              >
                {/* Top row: name, badges */}
                <div className="flex items-center flex-wrap gap-2 mb-2">
                  <span className="font-medium text-neutral-900 dark:text-white">
                    {user.username}
                  </span>
                  {isCurrentUser && <span className="text-xs text-primary-500">(you)</span>}
                  {user.is_super_admin ? (
                    <Badge variant="yellow">Super Admin</Badge>
                  ) : (
                    <Badge variant="gray">User</Badge>
                  )}
                  <Badge variant={user.is_active ? 'green' : 'gray'}>
                    {user.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
                {/* Details */}
                <div className="space-y-1 text-sm text-neutral-600 dark:text-neutral-400 mb-3">
                  {user.full_name && <p className="text-xs">{user.full_name}</p>}
                  <p className="truncate">{user.email}</p>
                  <div className="flex gap-4 text-xs text-neutral-500 dark:text-neutral-500">
                    <span>Joined {new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    <span>Login: {user.last_login ? new Date(user.last_login).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Never'}</span>
                  </div>
                </div>
                {/* Actions */}
                {!isCurrentUser && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant={user.is_super_admin ? 'gray' : 'warning'}
                      onClick={() => handleToggleSuperAdmin(user, !user.is_super_admin)}
                    >
                      {user.is_super_admin ? 'Remove Admin' : 'Make Admin'}
                    </Button>
                    <Button
                      size="sm"
                      variant={user.is_active ? 'danger' : 'green'}
                      onClick={() => handleToggleActive(user)}
                    >
                      {user.is_active ? 'Deactivate' : 'Reactivate'}
                    </Button>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Users — desktop table */}
      <div className="hidden sm:block bg-surface rounded-lg shadow dark:shadow-none dark:border dark:border-border-default overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-neutral-50 dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-neutral-700 dark:text-neutral-300 uppercase">
                  User
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-neutral-700 dark:text-neutral-300 uppercase">
                  Email
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-neutral-700 dark:text-neutral-300 uppercase">
                  Role
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-neutral-700 dark:text-neutral-300 uppercase">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-neutral-700 dark:text-neutral-300 uppercase">
                  Joined
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-neutral-700 dark:text-neutral-300 uppercase">
                  Last Login
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-neutral-700 dark:text-neutral-300 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-neutral-600">
                    No users found.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => {
                  const isCurrentUser = user.user_id === currentUserId
                  return (
                    <tr
                      key={user.user_id}
                      className={`hover:bg-neutral-50 dark:hover:bg-neutral-800 ${isCurrentUser ? 'bg-danger-50/30' : ''}`}
                    >
                      <td className="px-4 py-3">
                        <div>
                          <span className="font-medium text-neutral-900 dark:text-white">
                            {user.username}
                          </span>
                          {isCurrentUser && <span className="text-xs text-primary-500 ml-1">(you)</span>}
                          {user.full_name && (
                            <p className="text-xs text-neutral-600">
                              {user.full_name}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-neutral-600 dark:text-neutral-400">
                        {user.email}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {user.is_super_admin ? (
                          <Badge variant="yellow">Super Admin</Badge>
                        ) : (
                          <Badge variant="gray">User</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={user.is_active ? 'green' : 'gray'}>
                          {user.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-sm text-neutral-600 dark:text-neutral-400">
                        {new Date(user.created_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="px-4 py-3 text-sm text-neutral-600 dark:text-neutral-400">
                        {user.last_login
                          ? new Date(user.last_login).toLocaleDateString(
                              'en-US',
                              { month: 'short', day: 'numeric' }
                            )
                          : 'Never'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex gap-2 justify-end">
                          {!isCurrentUser && (
                            <>
                              <Button
                                size="sm"
                                variant={user.is_super_admin ? 'gray' : 'warning'}
                                onClick={() =>
                                  handleToggleSuperAdmin(
                                    user,
                                    !user.is_super_admin
                                  )
                                }
                              >
                                {user.is_super_admin
                                  ? 'Remove Admin'
                                  : 'Make Admin'}
                              </Button>
                              <Button
                                size="sm"
                                variant={user.is_active ? 'danger' : 'green'}
                                onClick={() => handleToggleActive(user)}
                              >
                                {user.is_active ? 'Deactivate' : 'Reactivate'}
                              </Button>
                            </>
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

      {/* Promote to Super Admin Modal */}
      {modal.type === 'promote_admin' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-surface rounded-xl shadow-xl max-w-lg w-full mx-4 p-6 dark:shadow-none dark:border dark:border-border-default">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-3 h-3 bg-danger-600 rounded-full animate-pulse" />
              <h3 className="text-xl font-bold text-danger-700">
                Promote to Super Admin
              </h3>
            </div>

            <div className="bg-danger-50 border border-danger-200 rounded-lg p-4 mb-4">
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
                className="w-full px-3 py-2 border border-danger-300 rounded-lg text-sm text-neutral-900 focus:ring-2 focus:ring-danger-500 focus:border-transparent"
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
