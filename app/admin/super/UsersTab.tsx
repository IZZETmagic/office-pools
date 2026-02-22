'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { SuperUserData } from './page'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'

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

  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | 'super' | 'regular'>('all')
  const [modal, setModal] = useState<ModalState>({ type: 'none' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
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
      setSuccess(null)
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

    setSuccess(`${modal.user.username} promoted to super admin.`)
    setSaving(false)

    setTimeout(() => {
      setModal({ type: 'none' })
      setSuccess(null)
    }, 2000)
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
        <h2 className="text-2xl font-bold text-neutral-900">User Management</h2>
        <div className="flex gap-3 text-sm">
          <span className="px-3 py-1 bg-danger-100 text-danger-700 rounded-full font-medium">
            {superAdminCount} Super Admin{superAdminCount !== 1 ? 's' : ''}
          </span>
          <span className="px-3 py-1 bg-neutral-100 text-neutral-700 rounded-full font-medium">
            {users.length} Total Users
          </span>
        </div>
      </div>

      {success && <Alert variant="success" className="mb-4">{success}</Alert>}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search users..."
          className="px-3 py-2 border border-neutral-300 rounded-lg text-sm text-neutral-700 bg-white w-64 focus:ring-2 focus:ring-danger-500 focus:border-transparent"
        />

        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as any)}
          className="px-3 py-2 border border-neutral-300 rounded-lg text-sm text-neutral-700 bg-white"
        >
          <option value="all">All Roles</option>
          <option value="super">Super Admins</option>
          <option value="regular">Regular Users</option>
        </select>
      </div>

      {/* Users table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-neutral-50 border-b border-neutral-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-neutral-700 uppercase">
                  User
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-neutral-700 uppercase">
                  Email
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-neutral-700 uppercase">
                  Role
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-neutral-700 uppercase">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-neutral-700 uppercase">
                  Joined
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-neutral-700 uppercase">
                  Last Login
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-neutral-700 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
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
                      className={`hover:bg-neutral-50 ${isCurrentUser ? 'bg-danger-50/30' : ''}`}
                    >
                      <td className="px-4 py-3">
                        <div>
                          <span className="font-medium text-neutral-900">
                            {user.username}
                          </span>
                          {isCurrentUser && (
                            <span className="ml-2 text-xs text-danger-500 font-medium">
                              (You)
                            </span>
                          )}
                          {user.full_name && (
                            <p className="text-xs text-neutral-600">
                              {user.full_name}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-neutral-600">
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
                      <td className="px-4 py-3 text-sm text-neutral-600">
                        {new Date(user.created_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="px-4 py-3 text-sm text-neutral-600">
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
                              <button
                                onClick={() =>
                                  handleToggleSuperAdmin(
                                    user,
                                    !user.is_super_admin
                                  )
                                }
                                className={`text-xs px-3 py-1.5 rounded font-medium transition ${
                                  user.is_super_admin
                                    ? 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                                    : 'bg-danger-600 text-white hover:bg-danger-700'
                                }`}
                              >
                                {user.is_super_admin
                                  ? 'Remove Admin'
                                  : 'Make Admin'}
                              </button>
                              <button
                                onClick={() => handleToggleActive(user)}
                                className={`text-xs px-3 py-1.5 rounded font-medium transition ${
                                  user.is_active
                                    ? 'bg-danger-50 text-danger-600 hover:bg-danger-100'
                                    : 'bg-success-50 text-success-600 hover:bg-success-100'
                                }`}
                              >
                                {user.is_active ? 'Deactivate' : 'Reactivate'}
                              </button>
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
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 p-6">
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
            {success && <Alert variant="success" className="mb-4">{success}</Alert>}

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
              <button
                onClick={handleConfirmPromote}
                disabled={saving || promoteConfirm !== 'PROMOTE'}
                className="px-4 py-2 rounded-lg font-semibold text-white bg-danger-600 hover:bg-danger-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Promoting...' : 'Promote to Super Admin'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
