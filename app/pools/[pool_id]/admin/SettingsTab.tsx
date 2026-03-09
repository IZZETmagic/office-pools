'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { PoolData, MemberData } from '../types'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { useToast } from '@/components/ui/Toast'
import { Input } from '@/components/ui/Input'
import { FormField } from '@/components/ui/FormField'

type SettingsTabProps = {
  pool: PoolData
  setPool: (pool: PoolData) => void
  members: MemberData[]
  onDirtyChange?: (dirty: boolean) => void
}

export function SettingsTab({ pool, setPool, members, onDirtyChange }: SettingsTabProps) {
  const supabase = createClient()
  const router = useRouter()
  const { showToast } = useToast()

  // Pool details form
  const [poolName, setPoolName] = useState(pool.pool_name)
  const [description, setDescription] = useState(pool.description || '')
  const [status, setStatus] = useState(pool.status)
  const [isPrivate, setIsPrivate] = useState(pool.is_private)
  const [maxParticipants, setMaxParticipants] = useState(
    pool.max_participants?.toString() || '0'
  )
  const [maxEntries, setMaxEntries] = useState(
    pool.max_entries_per_user?.toString() || '1'
  )

  const [copied, setCopied] = useState(false)

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
  const [error, setError] = useState<string | null>(null)

  // Archive state
  const [showArchiveModal, setShowArchiveModal] = useState(false)
  const [archiving, setArchiving] = useState(false)

  // Delete state
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteConfirmName, setDeleteConfirmName] = useState('')
  const [deleting, setDeleting] = useState(false)

  // Track if form has unsaved changes
  const initialDeadlineDate = pool.prediction_deadline
    ? new Date(pool.prediction_deadline).toISOString().split('T')[0]
    : ''
  const initialDeadlineTime = pool.prediction_deadline
    ? new Date(pool.prediction_deadline).toTimeString().slice(0, 5)
    : '14:00'

  const hasChanges = useMemo(() => {
    return (
      poolName !== pool.pool_name ||
      description !== (pool.description || '') ||
      status !== pool.status ||
      isPrivate !== pool.is_private ||
      maxParticipants !== (pool.max_participants?.toString() || '0') ||
      maxEntries !== (pool.max_entries_per_user?.toString() || '1') ||
      deadlineDate !== initialDeadlineDate ||
      deadlineTime !== initialDeadlineTime
    )
  }, [poolName, description, status, isPrivate, maxParticipants, maxEntries, deadlineDate, deadlineTime, pool, initialDeadlineDate, initialDeadlineTime])

  // Notify parent of dirty state
  useEffect(() => {
    onDirtyChange?.(hasChanges)
  }, [hasChanges, onDirtyChange])

  // Warn before browser navigation if there are unsaved changes
  useEffect(() => {
    if (!hasChanges) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [hasChanges])

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

  async function handleSaveAll() {
    // Validate pool name
    if (!poolName.trim()) {
      setError('Pool name is required.')
      return
    }

    // Validate deadline if set
    let newDeadline: Date | null = null
    if (deadlineDate) {
      newDeadline = new Date(`${deadlineDate}T${deadlineTime}:00`)
      if (newDeadline <= new Date()) {
        setError('Deadline must be in the future.')
        return
      }
    }

    // Validate max entries
    const maxE = parseInt(maxEntries) || 1
    if (maxE < 1 || maxE > 10) {
      setError('Max entries must be between 1 and 10.')
      return
    }

    const currentMax = Math.max(...members.map(m => (m.entries || []).length), 0)
    if (maxE < currentMax) {
      setError(`Cannot reduce below ${currentMax} — some members already have that many entries.`)
      return
    }

    const maxP = parseInt(maxParticipants) || 0

    setSaving(true)
    setError(null)

    const updatePayload: Record<string, any> = {
      pool_name: poolName.trim(),
      description: description.trim() || null,
      status,
      is_private: isPrivate,
      max_participants: maxP > 0 ? maxP : null,
      max_entries_per_user: maxE,
      updated_at: new Date().toISOString(),
    }

    if (newDeadline) {
      updatePayload.prediction_deadline = newDeadline.toISOString()
    }

    const { error: updateError } = await supabase
      .from('pools')
      .update(updatePayload)
      .eq('pool_id', pool.pool_id)

    if (updateError) {
      setError(updateError.message)
      setSaving(false)
      return
    }

    // Check if deadline changed — notify members if so
    const deadlineChanged = newDeadline &&
      (!pool.prediction_deadline || newDeadline.toISOString() !== new Date(pool.prediction_deadline).toISOString())

    if (deadlineChanged) {
      fetch('/api/notifications/deadline-changed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pool_id: pool.pool_id,
          new_deadline: newDeadline!.toISOString(),
        }),
      }).catch(() => {})
    }

    setPool({
      ...pool,
      pool_name: poolName.trim(),
      description: description.trim() || null,
      status,
      is_private: isPrivate,
      max_participants: maxP > 0 ? maxP : null,
      max_entries_per_user: maxE,
      ...(newDeadline ? { prediction_deadline: newDeadline.toISOString() } : {}),
    })
    showToast('Settings saved.', 'success')
    setSaving(false)
  }

  async function handleArchivePool() {
    setArchiving(true)

    const { error } = await supabase
      .from('pools')
      .update({ status: 'completed', updated_at: new Date().toISOString() })
      .eq('pool_id', pool.pool_id)

    if (error) {
      setError(error.message)
    } else {
      setPool({ ...pool, status: 'completed' })
      setStatus('completed')
      showToast('Pool archived successfully.', 'success')
    }
    setArchiving(false)
    setShowArchiveModal(false)
  }

  async function handleDeletePool() {
    if (deleteConfirmName !== pool.pool_name) return

    setDeleting(true)
    setError(null)

    // Delete in order: predictions -> entries -> pool_members -> pool_settings -> pools
    const memberIds = members.map((m) => m.member_id)
    const entryIds = members.flatMap((m) => (m.entries || []).map(e => e.entry_id))

    if (entryIds.length > 0) {
      const { error: predErr } = await supabase
        .from('predictions')
        .delete()
        .in('entry_id', entryIds)

      if (predErr) {
        setError('Failed to delete predictions: ' + predErr.message)
        setDeleting(false)
        return
      }
    }

    if (memberIds.length > 0) {
      const { error: entryErr } = await supabase
        .from('pool_entries')
        .delete()
        .in('member_id', memberIds)

      if (entryErr) {
        setError('Failed to delete entries: ' + entryErr.message)
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
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-neutral-900">Pool Settings</h2>
        <div className="flex items-center gap-1.5 mt-1">
          <span className="text-sm text-neutral-500">Code:</span>
          <button
            onClick={() => {
              navigator.clipboard.writeText(pool.pool_code)
              setCopied(true)
              setTimeout(() => setCopied(false), 2000)
            }}
            className="inline-flex items-center gap-1.5 font-mono text-sm font-semibold text-neutral-700 bg-neutral-100 hover:bg-neutral-200 px-2 py-0.5 rounded transition cursor-pointer"
            title="Copy pool code"
          >
            {pool.pool_code}
            {copied ? (
              <svg className="w-3.5 h-3.5 text-success-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
            ) : (
              <svg className="w-3.5 h-3.5 text-neutral-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" /></svg>
            )}
          </button>
        </div>
      </div>

      {error && (
        <Alert variant="error" className="mb-4">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-danger-800 font-bold">
            x
          </button>
        </Alert>
      )}

      <Card className="mb-6">
        {/* Pool Information */}
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
              className="w-full px-4 py-2 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent text-neutral-900"
            />
          </FormField>

          <FormField label="Pool Status">
            <div className="inline-grid grid-cols-3 gap-2">
              {([
                { value: 'open', label: 'Open', desc: 'Accepting new members' },
                { value: 'closed', label: 'Closed', desc: 'No new members' },
                { value: 'completed', label: 'Completed', desc: 'Tournament finished' },
              ] as const).map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setStatus(s.value)}
                  className={`p-3 rounded-xl border cursor-pointer transition text-left ${
                    status === s.value
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-neutral-200 hover:border-neutral-300'
                  }`}
                >
                  <p className="text-sm font-medium text-neutral-900">{s.label}</p>
                  <p className="text-xs text-neutral-500">{s.desc}</p>
                </button>
              ))}
            </div>
          </FormField>
        </div>

        {/* Divider */}
        <hr className="my-6 border-neutral-200" />

        {/* Prediction Mode badge */}
        {pool.prediction_mode === 'progressive' && (
          <div className="mb-4 flex items-center gap-2">
            <span className="text-sm font-medium text-neutral-700">Prediction Mode:</span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
              Progressive
            </span>
          </div>
        )}

        {/* Prediction Deadline */}
        <h3 className="text-lg font-semibold text-neutral-900 mb-4">
          {pool.prediction_mode === 'progressive' ? 'Group Stage Deadline' : 'Prediction Deadline'}
        </h3>

        {pool.prediction_mode === 'progressive' && (
          <div className="mb-4 flex items-start gap-3 p-3 bg-blue-50 border border-blue-200 rounded-xl dark:bg-blue-900/20 dark:border-blue-800">
            <svg className="w-5 h-5 text-blue-800 dark:text-blue-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
            </svg>
            <p className="text-xs text-blue-800 dark:text-blue-600 leading-5">
              This pool uses progressive predictions. Round-specific deadlines are managed in the <strong>Rounds</strong> tab. The deadline below applies to the initial group stage.
            </p>
          </div>
        )}

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
              className="px-3 py-2 border border-neutral-300 rounded-xl text-sm text-neutral-900 bg-surface focus:ring-2 focus:ring-primary-500 focus:border-transparent"
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
              className="px-3 py-2 border border-neutral-300 rounded-xl text-sm text-neutral-900 bg-surface focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
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

        {/* Divider */}
        <hr className="my-6 border-neutral-200" />

        {/* Privacy Settings */}
        <h3 className="text-lg font-semibold text-neutral-900 mb-4">
          Privacy Settings
        </h3>

        <div className="space-y-4">
          <FormField label="Pool Visibility">
            <div className="inline-grid grid-cols-2 gap-2">
              {([
                { value: false, label: 'Public', desc: 'Anyone with code can join' },
                { value: true, label: 'Private', desc: 'Requires pool code to join' },
              ] as const).map((opt) => (
                <button
                  key={String(opt.value)}
                  type="button"
                  onClick={() => setIsPrivate(opt.value)}
                  className={`p-3 rounded-xl border cursor-pointer transition text-left ${
                    isPrivate === opt.value
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-neutral-200 hover:border-neutral-300'
                  }`}
                >
                  <p className="text-sm font-medium text-neutral-900">{opt.label}</p>
                  <p className="text-xs text-neutral-500">{opt.desc}</p>
                </button>
              ))}
            </div>
          </FormField>

          <FormField
            label="Maximum Members"
            helperText="Set to 0 for unlimited"
          >
            <div className="w-[10.3125rem]">
              <Input
                type="number"
                min="0"
                value={maxParticipants}
                onChange={(e) => setMaxParticipants(e.target.value)}
              />
            </div>
          </FormField>
        </div>

        {/* Divider */}
        <hr className="my-6 border-neutral-200" />

        {/* Prediction Entries */}
        <h3 className="text-lg font-semibold text-neutral-900 mb-4">
          Prediction Entries
        </h3>

        <p className="text-sm text-neutral-600 mb-4">
          Allow members to submit multiple sets of predictions. Each entry is scored and ranked independently on the leaderboard.
        </p>

        <div className="space-y-4">
          <FormField label="Max Entries Per Member">
            <div className="flex">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setMaxEntries(String(n))}
                  className={`w-9 h-9 text-sm font-medium border -ml-px first:ml-0 first:rounded-l-xl last:rounded-r-xl transition ${
                    parseInt(maxEntries) === n
                      ? 'bg-primary-500 text-white border-primary-500 z-10'
                      : 'bg-surface text-neutral-700 border-neutral-200 hover:bg-neutral-100'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </FormField>

          {parseInt(maxEntries) > 1 && (
            <div className="flex items-start gap-3 p-3 bg-primary-50 border border-primary-200 rounded-xl dark:bg-primary-900/20 dark:border-primary-800">
              <svg className="w-5 h-5 text-primary-800 dark:text-primary-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
              </svg>
              <p className="text-xs text-primary-800 dark:text-primary-600 leading-5">
                Members will be able to create up to {maxEntries} entries (e.g. &quot;Serious&quot;, &quot;Fun&quot;). Each entry appears as its own row on the leaderboard.
              </p>
            </div>
          )}
        </div>

        {/* Save button */}
        <div className="mt-8 pt-6 border-t border-neutral-200 flex justify-end">
          <Button
            onClick={handleSaveAll}
            loading={saving}
            loadingText="Saving..."
            disabled={!hasChanges}
          >
            Save Changes
          </Button>
        </div>
      </Card>

      {/* Danger Zone */}
      <Card className="mb-6 border border-danger-200">

        <div className="relative grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-4">
          {/* Archive */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <h4 className="text-sm font-semibold text-neutral-900">Archive Pool</h4>
              <p className="text-sm text-neutral-500">Preserve data but prevent new activity.</p>
            </div>
            <Button variant="warning" size="sm" className="shrink-0 w-20" onClick={() => setShowArchiveModal(true)}>
              Archive
            </Button>
          </div>

          {/* Divider - desktop only */}
          <div className="hidden sm:block absolute inset-y-0 left-1/2 w-px bg-neutral-200" />

          {/* Delete */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <h4 className="text-sm font-semibold text-neutral-900">Delete Pool</h4>
              <p className="text-sm text-neutral-500">Permanently delete this pool and all data.</p>
            </div>
            <Button variant="danger" size="sm" className="shrink-0 w-20" onClick={() => setShowDeleteModal(true)}>
              Delete
            </Button>
          </div>
        </div>
      </Card>

      {/* Archive Confirmation Modal */}
      {showArchiveModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 animate-modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget && !archiving) {
              setShowArchiveModal(false)
            }
          }}
        >
          <div className="bg-surface rounded-t-2xl sm:rounded-2xl shadow-xl sm:max-w-md w-full sm:mx-4 p-4 sm:p-6 dark:shadow-none dark:border dark:border-border-default animate-modal-slide-up">
            <h3 className="text-lg font-bold text-neutral-900 mb-3">
              Archive Pool
            </h3>

            <p className="text-sm text-neutral-700 mb-3">
              Are you sure you want to archive this pool?
            </p>

            <div className="bg-warning-50 border border-warning-200 rounded-xl p-3 mb-4">
              <p className="text-sm font-bold text-warning-800 mb-2">
                {pool.pool_name}
              </p>
              <ul className="text-sm text-warning-800 space-y-1">
                <li>&#8226; Members will still be able to view data</li>
                <li>&#8226; No new predictions or changes can be made</li>
                <li>&#8226; The pool can be reactivated later</li>
              </ul>
            </div>

            <div className="flex gap-3 justify-end">
              <Button
                variant="gray"
                onClick={() => setShowArchiveModal(false)}
                disabled={archiving}
              >
                Cancel
              </Button>
              <Button
                variant="warning"
                onClick={handleArchivePool}
                loading={archiving}
                loadingText="Archiving..."
              >
                Archive Pool
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 animate-modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget && !deleting) {
              setShowDeleteModal(false)
              setDeleteConfirmName('')
            }
          }}
        >
          <div className="bg-surface rounded-t-2xl sm:rounded-2xl shadow-xl sm:max-w-md w-full sm:mx-4 p-4 sm:p-6 max-h-[90vh] overflow-y-auto dark:shadow-none dark:border dark:border-border-default animate-modal-slide-up">
            <h3 className="text-lg font-bold text-neutral-900 mb-3">
              Delete Pool
            </h3>

            <p className="text-sm text-neutral-700 mb-3">
              You are about to permanently delete this pool:
            </p>

            <div className="bg-danger-50 border border-danger-200 rounded-xl p-3 mb-4">
              <p className="text-sm font-bold text-danger-800 mb-2">
                {pool.pool_name}
              </p>
              <ul className="text-sm text-danger-800 space-y-1">
                <li>&#8226; {members.length} members will lose access</li>
                <li>&#8226; All predictions will be deleted</li>
                <li>&#8226; All member data will be deleted</li>
                <li>&#8226; This action cannot be undone</li>
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

            <div className="flex gap-3 justify-end mt-4">
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
              <Button
                variant="danger"
                onClick={handleDeletePool}
                disabled={deleteConfirmName !== pool.pool_name || deleting}
                loading={deleting}
                loadingText="Deleting..."
              >
                I Understand, Delete Forever
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
