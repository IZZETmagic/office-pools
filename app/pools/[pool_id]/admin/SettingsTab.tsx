'use client'

import { useState, useEffect, useMemo } from 'react'
import { Icon } from '@/components/ui/Icon'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { PoolData, MemberData } from '../types'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { useToast } from '@/components/ui/Toast'
import { Input } from '@/components/ui/Input'

type SettingsTabProps = {
  pool: PoolData
  setPool: (pool: PoolData) => void
  members: MemberData[]
  onDirtyChange?: (dirty: boolean) => void
}


/* ── Building blocks mirrored from the RN settings screen ────────────────────
   Card / Caption / Divider / FieldRow / SettingsRow / DangerRow in
   mobile/components/pool-detail/SettingsTab.tsx. Sizes are RN's: a 12px slate
   field label above its control, a 14px semibold row title with an 11px slate
   subtitle beside it, and a half-pixel silver rule at 50%. */

function Caption({ children }: { children: React.ReactNode }) {
  return <h3 className="t-caption text-muted">{children}</h3>
}

function Divider() {
  return <div className="h-px bg-silver/50 my-1" />
}

function FieldRow({
  label, children, className, helperText,
}: { label: string; children: React.ReactNode; className?: string; helperText?: string }) {
  return (
    <div className={`flex flex-col gap-1 ${className ?? ''}`}>
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
      {helperText && <span className="text-[11px] text-muted">{helperText}</span>}
    </div>
  )
}

function SettingsRow({
  label, subtitle, children,
}: { label: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className="text-sm font-semibold text-ink">{label}</span>
        {subtitle && <span className="text-[11px] text-muted">{subtitle}</span>}
      </div>
      {children}
    </div>
  )
}

function DangerRow({
  icon, title, subtitle, tone, onClick,
}: { icon: string; title: string; subtitle: string; tone: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="w-full flex items-center gap-3 py-2 text-left transition-opacity hover:opacity-70">
      <Icon name={icon} size={16} weight="semibold" className={`shrink-0 ${tone}`} />
      <span className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className={`text-sm font-bold ${tone}`}>{title}</span>
        <span className="text-[11px] text-muted">{subtitle}</span>
      </span>
      <Icon name="chevron.right" size={11} weight="semibold" className="shrink-0 text-muted" />
    </button>
  )
}

export function SettingsTab({ pool, setPool, members, onDirtyChange }: SettingsTabProps) {
  const supabase = createClient()
  const router = useRouter()
  const { showToast } = useToast()

  // Pool details form
  const [poolName, setPoolName] = useState(pool.pool_name)
  const [description, setDescription] = useState(pool.description || '')
  const [status, setStatus] = useState(pool.status)
  const [acceptingMembers, setAcceptingMembers] = useState(pool.accepting_members ?? true)
  const [isPrivate, setIsPrivate] = useState(pool.is_private)
  const [maxParticipants, setMaxParticipants] = useState(
    pool.max_participants?.toString() || '0'
  )
  const [maxEntries, setMaxEntries] = useState(
    pool.max_entries_per_user?.toString() || '1'
  )
  const [entryFee, setEntryFee] = useState(pool.entry_fee?.toString() || '')
  const [entryFeeCurrency, setEntryFeeCurrency] = useState(pool.entry_fee_currency || 'USD')

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

  // Archive state. There is deliberately no delete state: "Delete Pool" was
  // removed in favour of a reversible archive (decision 2026-07-25, migration
  // 040). True deletion is a service-role support action.
  const [showArchiveModal, setShowArchiveModal] = useState(false)
  const [archiving, setArchiving] = useState(false)

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
      acceptingMembers !== (pool.accepting_members ?? true) ||
      isPrivate !== pool.is_private ||
      maxParticipants !== (pool.max_participants?.toString() || '0') ||
      maxEntries !== (pool.max_entries_per_user?.toString() || '1') ||
      deadlineDate !== initialDeadlineDate ||
      deadlineTime !== initialDeadlineTime ||
      entryFee !== (pool.entry_fee?.toString() || '') ||
      entryFeeCurrency !== (pool.entry_fee_currency || 'USD')
    )
  }, [poolName, description, status, acceptingMembers, isPrivate, maxParticipants, maxEntries, deadlineDate, deadlineTime, pool, initialDeadlineDate, initialDeadlineTime, entryFee, entryFeeCurrency])

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
      accepting_members: acceptingMembers,
      is_private: isPrivate,
      max_participants: maxP > 0 ? maxP : null,
      max_entries_per_user: maxE,
      entry_fee: entryFee ? parseFloat(entryFee) : null,
      entry_fee_currency: entryFeeCurrency,
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
      accepting_members: acceptingMembers,
      is_private: isPrivate,
      max_participants: maxP > 0 ? maxP : null,
      max_entries_per_user: maxE,
      entry_fee: entryFee ? parseFloat(entryFee) : null,
      entry_fee_currency: entryFeeCurrency,
      ...(newDeadline ? { prediction_deadline: newDeadline.toISOString() } : {}),
    })
    showToast('Settings saved.', 'success')
    setSaving(false)
  }

  // Archive is a single server-side operation, not a client write plus a
  // notification call. The route owns admin verification, stamping
  // archived_at/archived_by, the membership event and the member fan-out — so
  // an archive can never land without the people in the pool being told.
  //
  // It writes `archived_at`, NOT `status`. The previous version set
  // status='completed', which conflated "the competition finished" with "the
  // admin filed this away" and destroyed the lifecycle value on the way past.
  async function handleArchivePool() {
    setArchiving(true)
    setError(null)

    const res = await fetch(`/api/pools/${pool.pool_id}/archive`, { method: 'POST' })
    const body = await res.json().catch(() => ({}))

    if (!res.ok) {
      setError(body?.error || 'Failed to archive the pool.')
      setArchiving(false)
      return
    }

    setPool({ ...pool, archived_at: body.archived_at, archived_by: body.archived_by })
    showToast('Pool archived. Members have been notified.', 'success')
    setArchiving(false)
    setShowArchiveModal(false)
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

  // 'closed' used to live here, meaning "no new members" — a join-ability
  // concept sharing a column with lifecycle. It now has its own toggle below
  // (migration 025); this control is lifecycle only.
  const statusOptions = [
    { value: 'open' as const, label: 'Open', desc: 'Pool is running' },
    { value: 'completed' as const, label: 'Completed', desc: 'Tournament finished' },
  ]

  const acceptingOptions = [
    { value: true as const, label: 'Accepting', desc: 'Anyone with the code can join' },
    { value: false as const, label: 'Not accepting', desc: 'No new members can join' },
  ]

  const visibilityOptions = [
    { value: false as const, label: 'Public', desc: 'Anyone with code can join' },
    { value: true as const, label: 'Private', desc: 'Requires pool code to join' },
  ]

  return (
    <div className="relative pb-20">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-ink">Pool Settings</h2>
        <div className="flex items-center gap-1.5 mt-1">
          <span className="text-sm text-muted">Code:</span>
          <button
            onClick={() => {
              navigator.clipboard.writeText(pool.pool_code)
              setCopied(true)
              setTimeout(() => setCopied(false), 2000)
            }}
            className="inline-flex items-center gap-1.5 font-mono text-sm font-semibold text-ink bg-mist hover:bg-silver px-2 py-0.5 rounded-chip transition cursor-pointer"
            title="Copy pool code"
          >
            {pool.pool_code}
            {copied ? (
              <Icon name="checkmark" size={14} className="text-success-500" />
            ) : (
              <Icon name="doc.on.doc" size={14} className="text-muted" />
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

      <div className="space-y-4">
        {/* ── Pool Information ── */}
        <Card>
          <Caption>
            Pool Information
          </Caption>

          <div className="space-y-4">
            <FieldRow label="Pool Name *">
              <Input
                type="text"
                value={poolName}
                onChange={(e) => setPoolName(e.target.value)}
                placeholder="Enter pool name"
              />
            </FieldRow>

            <FieldRow label="Description">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe your pool..."
                rows={3}
                className="w-full px-3 py-2.5 rounded-chip bg-mist text-sm text-ink focus:ring-2 focus:ring-primary-600/40 focus:border-transparent text-ink"
              />
            </FieldRow>

            <FieldRow label="Pool Status">
              <div className="inline-flex rounded-control overflow-hidden border border-border-default">
                {statusOptions.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setStatus(s.value)}
                    className={`px-4 py-2 text-sm font-medium transition border-r last:border-r-0 border-border-default cursor-pointer ${
                      status === s.value
                        ? 'bg-primary-500 text-white'
                        : 'bg-surface text-ink hover:bg-snow'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted mt-1.5">
                {statusOptions.find(s => s.value === status)?.desc}
              </p>
            </FieldRow>

            <FieldRow label="New Members">
              <div className="inline-flex rounded-control overflow-hidden border border-border-default">
                {acceptingOptions.map((o) => (
                  <button
                    key={String(o.value)}
                    type="button"
                    onClick={() => setAcceptingMembers(o.value)}
                    className={`px-4 py-2 text-sm font-medium transition border-r last:border-r-0 border-border-default cursor-pointer ${
                      acceptingMembers === o.value
                        ? 'bg-primary-500 text-white'
                        : 'bg-surface text-ink hover:bg-snow'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted mt-1.5">
                {acceptingOptions.find(o => o.value === acceptingMembers)?.desc}
                {' '}Independent of pool status — the pool stays visible to existing members either way.
              </p>
            </FieldRow>
          </div>
        </Card>

        {/* ── Prediction Deadline ── */}
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Caption>
              {pool.prediction_mode === 'progressive' ? 'Group Stage Deadline' : 'Prediction Deadline'}
            </Caption>
            {pool.prediction_mode === 'progressive' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
                Progressive
              </span>
            )}
          </div>

          {pool.prediction_mode === 'progressive' && (
            <Alert variant="info">
              This pool uses progressive predictions. Round-specific deadlines are managed in the <strong>Rounds</strong> tab. The deadline below applies to the initial group stage.
            </Alert>
          )}

          {currentDeadline && (
            <div className="mb-4">
              <p className="text-sm text-muted">
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
                <p className="text-sm text-muted">
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
              <label className="block text-xs font-medium text-muted mb-1">
                Date
              </label>
              <input
                type="date"
                value={deadlineDate}
                onChange={(e) => setDeadlineDate(e.target.value)}
                className="px-3 py-2.5 rounded-chip bg-mist text-sm text-ink focus:ring-2 focus:ring-primary-600/40 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">
                Time
              </label>
              <input
                type="time"
                value={deadlineTime}
                onChange={(e) => setDeadlineTime(e.target.value)}
                className="px-3 py-2.5 rounded-chip bg-mist text-sm text-ink focus:ring-2 focus:ring-primary-600/40 focus:border-transparent"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setQuickDeadline('tournament_start')}
              className="text-xs px-3 py-1.5 rounded-chip bg-mist text-ink hover:bg-silver transition"
            >
              Tournament Start (Jun 11)
            </button>
            <button
              onClick={() => setQuickDeadline('one_day_before')}
              className="text-xs px-3 py-1.5 rounded-chip bg-mist text-ink hover:bg-silver transition"
            >
              1 Day Before Start
            </button>
            <button
              onClick={() => setQuickDeadline('one_week_before')}
              className="text-xs px-3 py-1.5 rounded-chip bg-mist text-ink hover:bg-silver transition"
            >
              1 Week Before Start
            </button>
          </div>
        </Card>

        {/* ── Access & Limits ── */}
        <Card>
          <Caption>
            Access & Limits
          </Caption>

          <div className="space-y-4">
            <FieldRow label="Pool Visibility">
              <div className="inline-flex rounded-control overflow-hidden border border-border-default">
                {visibilityOptions.map((opt) => (
                  <button
                    key={String(opt.value)}
                    type="button"
                    onClick={() => setIsPrivate(opt.value)}
                    className={`px-4 py-2 text-sm font-medium transition border-r last:border-r-0 border-border-default cursor-pointer ${
                      isPrivate === opt.value
                        ? 'bg-primary-500 text-white'
                        : 'bg-surface text-ink hover:bg-snow'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted mt-1.5">
                {visibilityOptions.find(o => o.value === isPrivate)?.desc}
              </p>
            </FieldRow>

            <Divider />

            <SettingsRow
              label="Cap on total members"
              subtitle={!maxParticipants || maxParticipants === '0' ? 'No limit' : 'Set to 0 for unlimited'}
            >
              <div className="w-28 shrink-0">
                <Input
                  type="number"
                  min="0"
                  value={maxParticipants}
                  onChange={(e) => setMaxParticipants(e.target.value)}
                />
              </div>
            </SettingsRow>
          </div>
        </Card>

        {/* ── Prediction Entries ── */}
        <Card>
          <Caption>
            Prediction Entries
          </Caption>
          <p className="text-sm text-muted mb-4">
            Allow members to submit multiple sets of predictions. Each entry is scored independently.
          </p>

          <div className="space-y-4">
            <FieldRow label="Max Entries Per Member">
              <div className="flex">
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setMaxEntries(String(n))}
                    className={`w-9 h-9 text-sm font-medium border -ml-px first:ml-0 first:rounded-l-xl last:rounded-r-xl transition ${
                      parseInt(maxEntries) === n
                        ? 'bg-primary-500 text-white border-primary-500 z-10'
                        : 'bg-surface text-ink border-border-default hover:bg-mist'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </FieldRow>

            {parseInt(maxEntries) > 1 && (
              <Alert variant="info" className="text-xs">
                  Members will be able to create up to {maxEntries} entries (e.g. &quot;Serious&quot;, &quot;Fun&quot;). Each entry appears as its own row on the leaderboard.
                </Alert>
            )}
          </div>
        </Card>

        {/* ── Entry Fees ── */}
        <Card>
          <Caption>
            Entry Fees
          </Caption>
          <p className="text-sm text-muted mb-4">
            Set an entry fee that members pay for each entry. Leave blank for a free pool.
          </p>

          <div className="space-y-4">
            <div className="flex gap-3">
              <FieldRow label="Fee Amount" className="flex-1">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={entryFee}
                  onChange={(e) => setEntryFee(e.target.value)}
                />
              </FieldRow>
              <FieldRow label="Currency" className="w-28">
                <select
                  value={entryFeeCurrency}
                  onChange={(e) => setEntryFeeCurrency(e.target.value)}
                  className="w-full h-10 px-3 border border-border-default rounded-control text-sm text-ink bg-surface focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 "
                >
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                  <option value="CAD">CAD (C$)</option>
                  <option value="AUD">AUD (A$)</option>
                  <option value="MXN">MXN ($)</option>
                  <option value="BRL">BRL (R$)</option>
                  <option value="JPY">JPY (¥)</option>
                  <option value="CHF">CHF (Fr)</option>
                  <option value="BMD">BMD ($)</option>
                </select>
              </FieldRow>
            </div>

            {entryFee && parseFloat(entryFee) > 0 && (
              <Alert variant="info" className="text-xs">
                  Each entry will cost {new Intl.NumberFormat(undefined, { style: 'currency', currency: entryFeeCurrency }).format(parseFloat(entryFee))}. Track payments in the <strong>Fees</strong> tab.
                </Alert>
            )}
          </div>
        </Card>

        {/* ── Danger Zone ── */}
        <Card className="border border-danger-200">
          <Caption>
            Danger Zone
          </Caption>

          {/*
            Delete Pool was removed here (decision 2026-07-25). It destroyed every
            member's predictions irreversibly on one tap. Archive replaces it and is
            reversible; genuine deletion is a support action run with service-role
            credentials. Do not re-add a delete control to this screen.
          */}
          <DangerRow
            icon="archivebox"
            title="Archive Pool"
            subtitle="Files the pool away for everyone. Nothing is deleted, and you can restore it at any time from your profile."
            tone="text-warning-800"
            onClick={() => setShowArchiveModal(true)}
          />

          <p className="mt-3 text-[11px] text-muted">
            Need a pool permanently deleted? Contact support — it can&apos;t be undone, so we
            do it by hand.
          </p>
        </Card>
      </div>

      {/* ── Sticky save bar ── */}
      {hasChanges && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border-default bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
          <div className="mx-auto max-w-3xl flex items-center justify-between px-4 py-3">
            <p className="text-sm text-muted">You have unsaved changes</p>
            <Button
              onClick={handleSaveAll}
              loading={saving}
              loadingText="Saving..."
            >
              Save Changes
            </Button>
          </div>
        </div>
      )}

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
          <div className="bg-surface rounded-t-sheet sm:rounded-card shadow-card-elevated overflow-hidden sm:max-w-md w-full sm:mx-4 p-4 sm:p-6 dark:shadow-none dark:border dark:border-border-default animate-modal-slide-up">
            <h3 className="text-lg font-bold text-ink mb-3">
              Archive Pool
            </h3>

            <p className="text-sm text-ink mb-3">
              Are you sure you want to archive this pool?
            </p>

            <Alert variant="warning">
              <p className="font-bold mb-2">
                {pool.pool_name}
              </p>
              <ul className="space-y-1">
                <li>&#8226; Nothing is deleted — every prediction and result is kept</li>
                <li>&#8226; It moves to Archived in everyone&apos;s profile, read-only</li>
                <li>&#8226; It stops counting toward trophies and stats until restored</li>
                <li>&#8226; All {members.length} members will be told that you archived it</li>
                <li>&#8226; You can restore it at any time</li>
              </ul>
            </Alert>

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

    </div>
  )
}
