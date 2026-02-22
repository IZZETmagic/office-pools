'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { PoolData, MemberData } from '../types'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { Input } from '@/components/ui/Input'
import { FormField } from '@/components/ui/FormField'

type SettingsTabProps = {
  pool: PoolData
  setPool: (pool: PoolData) => void
  members: MemberData[]
}

export function SettingsTab({ pool, setPool, members }: SettingsTabProps) {
  const supabase = createClient()
  const router = useRouter()

  // Pool details form
  const [poolName, setPoolName] = useState(pool.pool_name)
  const [description, setDescription] = useState(pool.description || '')
  const [status, setStatus] = useState(pool.status)
  const [isPrivate, setIsPrivate] = useState(pool.is_private)
  const [maxParticipants, setMaxParticipants] = useState(
    pool.max_participants?.toString() || '0'
  )

  // Deadline
  const [deadlineDate, setDeadlineDate] = useState(
    pool.prediction_deadline
      ? new Date(pool.prediction_deadline).toISOString().split('T')[0]
      : ''
  )
  const [deadlineTime, setDeadlineTime] = useState(
    pool.prediction_deadline
      ? new Date(pool.prediction_deadline).toTimeString().slice(0, 5)
      : '14:00'
  )

  // UI state
  const [saving, setSaving] = useState(false)
  const [savingDeadline, setSavingDeadline] = useState(false)
  const [savingPrivacy, setSavingPrivacy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Delete state
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteConfirmName, setDeleteConfirmName] = useState('')
  const [deleting, setDeleting] = useState(false)

  const currentDeadline = pool.prediction_deadline
    ? new Date(pool.prediction_deadline)
    : null
  const timeUntilDeadline = currentDeadline
    ? currentDeadline.getTime() - Date.now()
    : null
  const daysUntilDeadline = timeUntilDeadline
    ? Math.floor(timeUntilDeadline / (1000 * 60 * 60 * 24))
    : null
  const hoursUntilDeadline = timeUntilDeadline
    ? Math.floor(
        (timeUntilDeadline % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
      )
    : null

  async function handleSaveDetails() {
    if (!poolName.trim()) {
      setError('Pool name is required.')
      return
    }

    setSaving(true)
    setError(null)
    setSuccess(null)

    const { error: updateError } = await supabase
      .from('pools')
      .update({
        pool_name: poolName.trim(),
        description: description.trim() || null,
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('pool_id', pool.pool_id)

    if (updateError) {
      setError(updateError.message)
    } else {
      setPool({
        ...pool,
        pool_name: poolName.trim(),
        description: description.trim() || null,
        status,
      })
      setSuccess('Pool details updated.')
    }
    setSaving(false)
  }

  async function handleSaveDeadline() {
    if (!deadlineDate) {
      setError('Please select a date.')
      return
    }

    const newDeadline = new Date(`${deadlineDate}T${deadlineTime}:00`)
    if (newDeadline <= new Date()) {
      setError('Deadline must be in the future.')
      return
    }

    setSavingDeadline(true)
    setError(null)
    setSuccess(null)

    const { error: updateError } = await supabase
      .from('pools')
      .update({
        prediction_deadline: newDeadline.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('pool_id', pool.pool_id)

    if (updateError) {
      setError(updateError.message)
    } else {
      setPool({ ...pool, prediction_deadline: newDeadline.toISOString() })
      setSuccess('Prediction deadline updated.')
    }
    setSavingDeadline(false)
  }

  async function handleSavePrivacy() {
    setSavingPrivacy(true)
    setError(null)
    setSuccess(null)

    const maxP = parseInt(maxParticipants) || 0

    const { error: updateError } = await supabase
      .from('pools')
      .update({
        is_private: isPrivate,
        max_participants: maxP > 0 ? maxP : null,
        updated_at: new Date().toISOString(),
      })
      .eq('pool_id', pool.pool_id)

    if (updateError) {
      setError(updateError.message)
    } else {
      setPool({
        ...pool,
        is_private: isPrivate,
        max_participants: maxP > 0 ? maxP : null,
      })
      setSuccess('Privacy settings updated.')
    }
    setSavingPrivacy(false)
  }

  async function handleArchivePool() {
    if (!confirm('Are you sure you want to archive this pool? Members will still be able to view data but not make changes.'))
      return

    const { error } = await supabase
      .from('pools')
      .update({ status: 'completed', updated_at: new Date().toISOString() })
      .eq('pool_id', pool.pool_id)

    if (error) {
      setError(error.message)
    } else {
      setPool({ ...pool, status: 'completed' })
      setStatus('completed')
      setSuccess('Pool archived successfully.')
    }
  }

  async function handleDeletePool() {
    if (deleteConfirmName !== pool.pool_name) return

    setDeleting(true)
    setError(null)

    // Delete in order: predictions -> pool_members -> pool_settings -> pools
    const memberIds = members.map((m) => m.member_id)

    if (memberIds.length > 0) {
      const { error: predErr } = await supabase
        .from('predictions')
        .delete()
        .in('member_id', memberIds)

      if (predErr) {
        setError('Failed to delete predictions: ' + predErr.message)
        setDeleting(false)
        return
      }
    }

    const { error: memErr } = await supabase
      .from('pool_members')
      .delete()
      .eq('pool_id', pool.pool_id)

    if (memErr) {
      setError('Failed to delete members: ' + memErr.message)
      setDeleting(false)
      return
    }

    const { error: setErr } = await supabase
      .from('pool_settings')
      .delete()
      .eq('pool_id', pool.pool_id)

    if (setErr) {
      setError('Failed to delete settings: ' + setErr.message)
      setDeleting(false)
      return
    }

    const { error: poolErr } = await supabase
      .from('pools')
      .delete()
      .eq('pool_id', pool.pool_id)

    if (poolErr) {
      setError('Failed to delete pool: ' + poolErr.message)
      setDeleting(false)
      return
    }

    router.push('/dashboard')
  }

  // Quick deadline options
  function setQuickDeadline(option: string) {
    // World Cup 2026 starts June 11
    let d: Date
    switch (option) {
      case 'tournament_start':
        d = new Date('2026-06-11T13:00:00')
        break
      case 'one_day_before':
        d = new Date('2026-06-10T13:00:00')
        break
      case 'one_week_before':
        d = new Date('2026-06-04T13:00:00')
        break
      default:
        return
    }
    setDeadlineDate(d.toISOString().split('T')[0])
    setDeadlineTime(d.toTimeString().slice(0, 5))
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-neutral-900 mb-6">Pool Settings</h2>

      {error && (
        <Alert variant="error" className="mb-4">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-danger-800 font-bold">
            x
          </button>
        </Alert>
      )}
      {success && (
        <Alert variant="success" className="mb-4">
          {success}
          <button onClick={() => setSuccess(null)} className="ml-2 text-success-800 font-bold">
            x
          </button>
        </Alert>
      )}

      {/* Pool Information */}
      <Card className="mb-6">
        <h3 className="text-lg font-semibold text-neutral-900 mb-4">
          Pool Information
        </h3>

        <div className="space-y-4">
          <FormField label="Pool Name *">
            <Input
              type="text"
              value={poolName}
              onChange={(e) => setPoolName(e.target.value)}
              placeholder="Enter pool name"
            />
          </FormField>

          <FormField label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe your pool..."
              rows={3}
              className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-neutral-900"
            />
          </FormField>

          <div>
            <p className="text-sm text-neutral-600">
              Pool Code:{' '}
              <span className="font-mono font-bold text-neutral-900">
                {pool.pool_code}
              </span>
            </p>
          </div>

          <FormField label="Pool Status">
            <div className="space-y-2">
              {(['open', 'closed', 'completed'] as const).map((s) => (
                <label key={s} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="status"
                    value={s}
                    checked={status === s}
                    onChange={() => setStatus(s)}
                    className="text-primary-600"
                  />
                  <span className="text-sm text-neutral-700">
                    {s === 'open'
                      ? 'Open (accepting new members)'
                      : s === 'closed'
                        ? 'Closed (no new members)'
                        : 'Completed (tournament finished)'}
                  </span>
                </label>
              ))}
            </div>
          </FormField>

          <Button
            onClick={handleSaveDetails}
            loading={saving}
            loadingText="Saving..."
          >
            Save Changes
          </Button>
        </div>
      </Card>

      {/* Prediction Deadline */}
      <Card className="mb-6">
        <h3 className="text-lg font-semibold text-neutral-900 mb-4">
          Prediction Deadline
        </h3>

        {currentDeadline && (
          <div className="mb-4">
            <p className="text-sm text-neutral-600">
              Current Deadline:{' '}
              <span className="font-medium">
                {currentDeadline.toLocaleDateString('en-US', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}{' '}
                {currentDeadline.toLocaleTimeString('en-US', {
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </span>
            </p>
            {daysUntilDeadline !== null && timeUntilDeadline! > 0 && (
              <p className="text-sm text-neutral-600">
                Time until deadline: {daysUntilDeadline} days {hoursUntilDeadline} hours
              </p>
            )}
            {timeUntilDeadline !== null && timeUntilDeadline <= 0 && (
              <p className="text-sm text-danger-500 font-medium">
                Deadline has passed
              </p>
            )}
          </div>
        )}

        <div className="flex gap-3 mb-4 flex-wrap">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Date
            </label>
            <input
              type="date"
              value={deadlineDate}
              onChange={(e) => setDeadlineDate(e.target.value)}
              className="px-3 py-2 border border-neutral-300 rounded-lg text-sm text-neutral-900 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Time
            </label>
            <input
              type="time"
              value={deadlineTime}
              onChange={(e) => setDeadlineTime(e.target.value)}
              className="px-3 py-2 border border-neutral-300 rounded-lg text-sm text-neutral-900 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => setQuickDeadline('tournament_start')}
            className="text-xs px-3 py-1.5 rounded bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition"
          >
            Tournament Start (Jun 11)
          </button>
          <button
            onClick={() => setQuickDeadline('one_day_before')}
            className="text-xs px-3 py-1.5 rounded bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition"
          >
            1 Day Before Start
          </button>
          <button
            onClick={() => setQuickDeadline('one_week_before')}
            className="text-xs px-3 py-1.5 rounded bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition"
          >
            1 Week Before Start
          </button>
        </div>

        <Button
          onClick={handleSaveDeadline}
          loading={savingDeadline}
          loadingText="Updating..."
        >
          Update Deadline
        </Button>
      </Card>

      {/* Privacy Settings */}
      <Card className="mb-6">
        <h3 className="text-lg font-semibold text-neutral-900 mb-4">
          Privacy Settings
        </h3>

        <div className="space-y-4">
          <FormField label="Pool Visibility">
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="privacy"
                  checked={!isPrivate}
                  onChange={() => setIsPrivate(false)}
                  className="text-primary-600"
                />
                <span className="text-sm text-neutral-700">
                  Public (anyone with code can join)
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="privacy"
                  checked={isPrivate}
                  onChange={() => setIsPrivate(true)}
                  className="text-primary-600"
                />
                <span className="text-sm text-neutral-700">
                  Private (requires admin approval)
                </span>
              </label>
            </div>
          </FormField>

          <FormField
            label="Maximum Members"
            helperText="Set to 0 for unlimited"
          >
            <Input
              type="number"
              min="0"
              value={maxParticipants}
              onChange={(e) => setMaxParticipants(e.target.value)}
              className="max-w-[200px]"
            />
          </FormField>

          <Button
            onClick={handleSavePrivacy}
            loading={savingPrivacy}
            loadingText="Saving..."
          >
            Save Privacy Settings
          </Button>
        </div>
      </Card>

      {/* Danger Zone */}
      <div className="border-2 border-danger-300 rounded-lg p-4 sm:p-6 bg-danger-50">
        <h3 className="text-lg font-semibold text-danger-600 mb-4">
          Danger Zone
        </h3>

        <div className="space-y-4">
          {/* Archive */}
          <div>
            <h4 className="text-sm font-semibold text-neutral-900 mb-1">
              Archive Pool
            </h4>
            <p className="text-sm text-neutral-600 mb-3">
              Archive this pool to preserve data but prevent new activity.
            </p>
            <button
              onClick={handleArchivePool}
              className="px-4 py-2 text-sm rounded-lg font-semibold bg-warning-500 text-white hover:bg-warning-600 transition"
            >
              Archive Pool
            </button>
          </div>

          <hr className="border-danger-200" />

          {/* Delete */}
          <div>
            <h4 className="text-sm font-semibold text-neutral-900 mb-1">
              Delete Pool
            </h4>
            <p className="text-sm text-neutral-600 mb-3">
              Permanently delete this pool and all data. This action CANNOT be
              undone.
            </p>
            <button
              onClick={() => setShowDeleteModal(true)}
              className="px-4 py-2 text-sm rounded-lg font-semibold bg-danger-600 text-white hover:bg-danger-700 transition"
            >
              Delete Pool
            </button>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
          <div className="bg-white rounded-t-xl sm:rounded-xl shadow-xl sm:max-w-md w-full sm:mx-4 p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-danger-600 mb-3">
              Delete Pool - PERMANENT ACTION
            </h3>

            <p className="text-sm text-neutral-600 mb-3">
              You are about to PERMANENTLY DELETE:
            </p>

            <div className="bg-danger-50 border border-danger-200 rounded-lg p-3 mb-4">
              <p className="text-sm font-bold text-danger-700 mb-2">
                {pool.pool_name}
              </p>
              <ul className="text-sm text-danger-600 space-y-1">
                <li>- {members.length} members will lose access</li>
                <li>- All predictions will be deleted</li>
                <li>- All member data will be deleted</li>
                <li>- This action CANNOT be undone</li>
              </ul>
            </div>

            <FormField label={`Type "${pool.pool_name}" to confirm:`}>
              <Input
                type="text"
                value={deleteConfirmName}
                onChange={(e) => setDeleteConfirmName(e.target.value)}
                placeholder={pool.pool_name}
              />
            </FormField>

            <p className="text-sm text-danger-600 font-bold mt-3 mb-4">
              THIS WILL DELETE EVERYTHING
            </p>

            <div className="flex gap-3 justify-end">
              <Button
                variant="gray"
                onClick={() => {
                  setShowDeleteModal(false)
                  setDeleteConfirmName('')
                }}
                disabled={deleting}
              >
                Cancel
              </Button>
              <button
                onClick={handleDeletePool}
                disabled={deleteConfirmName !== pool.pool_name || deleting}
                className="px-4 py-2 text-sm rounded-lg font-semibold bg-danger-600 text-white hover:bg-danger-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleting
                  ? 'Deleting...'
                  : 'I Understand, Delete Forever'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
