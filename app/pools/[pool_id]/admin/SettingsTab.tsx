'use client'

import { useState, useEffect, useMemo } from 'react'
import { useSlideIndicator } from '@/hooks/useSlideIndicator'
import { Icon } from '@/components/ui/Icon'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { PoolData, MemberData } from '../types'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { useToast } from '@/components/ui/Toast'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { POOL_MODE_INFO, type PredictionMode } from '@/lib/poolModeInfo'

type SettingsTabProps = {
  pool: PoolData
  setPool: (pool: PoolData) => void
  members: MemberData[]
  currentUserId: string
  onDirtyChange?: (dirty: boolean) => void
}


/* ── Building blocks mirrored from the RN settings screen ────────────────────
   Card / Caption / Divider / FieldRow / SettingsRow / DangerRow in
   mobile/components/pool-detail/SettingsTab.tsx. Sizes are RN's: a 12px slate
   field label above its control, a 14px semibold row title with an 11px slate
   subtitle beside it, and a half-pixel silver rule at 50%. */

/* SegmentedPicker: the same control as the My Pools / Discover toggle — a mist
   track with one surface pill that slides between the options, rather than each
   option toggling its own background. useSlideIndicator measures the active
   button and animates left/width; it keys off data-tab-key, so boolean values
   are stringified for it. Shared with PoolsClient and DashboardClient. */
function SegmentedPicker<T extends string | boolean>({
  value, options, onChange,
}: { value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void }) {
  const { containerRef, indicatorStyle, ready } = useSlideIndicator(String(value))
  return (
    <div ref={containerRef} className="relative flex gap-1 bg-mist rounded-pill p-1">
      <div
        className={`absolute top-1 bottom-1 bg-surface rounded-pill shadow-sm pointer-events-none ${ready ? 'transition-all duration-300 ease-out' : ''}`}
        style={{ left: indicatorStyle.left, width: indicatorStyle.width }}
      />
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={String(opt.value)}
            type="button"
            data-tab-key={String(opt.value)}
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            className={`relative z-10 flex-1 px-4 py-2 rounded-pill text-sm font-bold transition-colors ${
              active ? 'text-ink' : 'text-muted hover:text-ink'
            }`}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

/* EntryCountPicker: 1-10 as one flush strip, the chosen number filled primary. */
function EntryCountPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex rounded-control overflow-hidden">
      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
        const active = n === value
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            aria-pressed={active}
            className={`flex-1 py-2.5 t-num text-[13px] transition-colors ${
              active ? 'bg-primary-600 text-white' : 'bg-mist text-ink hover:bg-silver'
            }`}
          >
            {n}
          </button>
        )
      })}
    </div>
  )
}

/* Stepper: 32px round buttons at ink@6%, the value between them. RN shows the
   infinity glyph at 0 rather than the digit, because 0 means "no cap". */
function Stepper({
  value, min = 0, max = 500, onChange,
}: { value: number; min?: number; max?: number; onChange: (v: number) => void }) {
  const step = value < 20 ? 1 : 10
  const btn = 'w-8 h-8 rounded-pill bg-ink/6 flex items-center justify-center transition-opacity hover:opacity-70 disabled:opacity-30'
  return (
    <div className="flex items-center gap-2 shrink-0">
      <button type="button" aria-label="Decrease" disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - step))} className={btn}>
        <Icon name="minus" size={14} weight="bold" className="text-ink" />
      </button>
      <span className="w-10 text-center t-num t-num-extrabold text-base text-ink">
        {value === 0 ? '\u221E' : value}
      </span>
      <button type="button" aria-label="Increase" disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + step))} className={btn}>
        <Icon name="plus" size={14} weight="bold" className="text-ink" />
      </button>
    </div>
  )
}

/* QuickDeadlineButton: a primary@10% pill, 11px semibold. */
function QuickDeadlineButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="px-2.5 py-1.5 rounded-pill bg-primary-600/10 text-[11px] font-semibold text-primary-800 transition-opacity hover:opacity-80">
      {label}
    </button>
  )
}

/* ShareButton: half-width primary-tinted pill, icon + 13px bold label. Flips to
   a success tint and a checkmark for two seconds after copying. (RN ShareButton) */
function ShareButton({
  label, icon, active, onClick,
}: { label: string; icon: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-chip text-[13px] font-bold transition-colors ${
        active ? 'bg-success-600/12 text-success-900' : 'bg-primary-600/10 text-primary-800'
      }`}
    >
      <Icon name={icon} size={14} weight="semibold" className="shrink-0" />
      {label}
    </button>
  )
}

/* Card header: `t-section-header` (Nunito 900/20) in title case over a rule.
   This replaces an 11px uppercase micro-caption at `text-muted`, which read as
   a field label sitting above the card rather than as the card's own title.

   The rule lives on the wrapper, not on the <h3>, and badges go through
   `trailing` rather than beside the component. A border on the heading itself
   would stop at the end of the text, so the Pool Mode card — whose header
   carries a pill naming the mode — would have drawn a short rule under the
   words instead of one spanning the card. */
function Caption({
  children, tone, trailing,
}: { children: React.ReactNode; tone?: string; trailing?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 pb-3 mb-4 border-b border-border-subtle">
      <h3 className={`t-section-header ${tone ?? 'text-ink'}`}>
        {children}
      </h3>
      {trailing}
    </div>
  )
}


function FieldRow({
  label, children, className, helperText,
}: { label: string; children: React.ReactNode; className?: string; helperText?: string }) {
  return (
    <div className={`flex flex-col gap-1 min-h-0 ${className ?? ''}`}>
      {/* `t-body`, not `t-detail`. t-detail is 10px — the smallest token in the
          system, for micro-detail — and it was being used for the label that
          names the field, two points under the 12px this file's header records
          as RN's own spec. Also ink rather than muted: slate measures 3.58:1 on
          surface, which is under AA for text this size. */}
      <span className="t-body text-ink">{label}</span>
      {children}
      {helperText && <span className="t-detail text-muted">{helperText}</span>}
    </div>
  )
}

function SettingsRow({
  label, subtitle, children,
}: { label: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className="t-card-title text-ink">{label}</span>
        {subtitle && <span className="t-detail text-muted">{subtitle}</span>}
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
        <span className={`t-card-title ${tone}`}>{title}</span>
        <span className="t-detail text-muted">{subtitle}</span>
      </span>
      <Icon name="chevron.right" size={11} weight="semibold" className="shrink-0 text-muted" />
    </button>
  )
}

export function SettingsTab({ pool, setPool, members, currentUserId, onDirtyChange }: SettingsTabProps) {
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

  const [copiedKey, setCopiedKey] = useState<'code' | 'link' | null>(null)
  const [showStopConfirm, setShowStopConfirm] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)

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
    { value: 'open' as const, label: 'Open', desc: 'Scoring is live and members can play.' },
    { value: 'completed' as const, label: 'Completed', desc: 'Locked — nothing new is scored.' },
  ]

  const acceptingOptions = [
    { value: true as const, label: 'Accepting', desc: 'Anyone with the code can join.' },
    { value: false as const, label: 'Not accepting', desc: 'Nobody new can join, even with the code.' },
  ]

  /**
   * The admin's own entries in this pool. Drives whether the Stop Participating
   * row shows at all: with no entries the action is a no-op and the row would
   * only confuse. RN gates it the same way (`hasParticipation`).
   */
  const myEntryCount = useMemo(
    () => members.find((m) => m.user_id === currentUserId)?.entries?.length ?? 0,
    [members, currentUserId],
  )

  /**
   * Pulls the admin out of the competition without removing them from the pool —
   * they keep the admin role, this tab, banter, everything. Only their
   * pool_entries go, and with them the cascading predictions and scores.
   *
   * Routed through the API rather than a client-side delete on pool_entries:
   * three of the cascade children (bonus_scores, match_scores, player_scores)
   * have RLS on with no user-facing DELETE policy, so a client cascade is
   * rejected by those children and rolls the whole transaction back. The
   * endpoint uses the admin client to bypass RLS. Its header documents this at
   * length — it has existed for a while with no caller; this is the first.
   */
  async function performStopParticipating() {
    setStopping(true)
    try {
      const res = await fetch(`/api/pools/${pool.pool_id}/stop-participating`, { method: 'POST' })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error ?? 'Could not remove your entries')
      const n = body.removed_entries ?? 0
      setShowStopConfirm(false)
      showToast(
        n === 1
          ? 'Your entry was removed. You are still an admin.'
          : `${n} entries removed. You are still an admin.`,
        'success',
      )
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove your entries')
      setShowStopConfirm(false)
    } finally {
      setStopping(false)
    }
  }

  const inviteLink = typeof window === 'undefined' ? '' : `${window.location.origin}/join/${pool.pool_code}`

  // Rendered client-side on mount: `qrcode` is a Node-flavoured module and the
  // link needs window.location.origin, which does not exist during SSR.
  useEffect(() => {
    let cancelled = false
    if (!inviteLink) return
    import('qrcode')
      .then((m) => m.default.toDataURL(inviteLink, {
        width: 360,
        margin: 1,
        // Hard-coded, deliberately NOT tokens. `ink` flips to near-white in dark
        // mode, which would put a white code on the white QR plate and stop it
        // scanning. QR contrast has to stay dark-on-light whatever the theme —
        // the same reason the RN version hard-codes these two values.
        color: { dark: '#1B2340', light: '#FFFFFF' },
      }))
      .then((url) => { if (!cancelled) setQrDataUrl(url) })
      .catch(() => { /* the code below the QR is the fallback */ })
    return () => { cancelled = true }
  }, [inviteLink])

  function copyShare(kind: 'code' | 'link') {
    navigator.clipboard.writeText(kind === 'code' ? pool.pool_code : inviteLink)
    setCopiedKey(kind)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  const visibilityOptions = [
    { value: false as const, label: 'Public', desc: 'Listed in Discover, so people can find it without a code.' },
    { value: true as const, label: 'Private', desc: 'Hidden from Discover. People need the code.' },
  ]

  // Falls back to full_tournament, matching HowToPlayTab's own default, so a
  // pool with an unset or unrecognised mode still renders a description rather
  // than crashing on an undefined lookup.
  const modeInfo =
    POOL_MODE_INFO[pool.prediction_mode as PredictionMode] ?? POOL_MODE_INFO.full_tournament

  return (
    <div className="relative pb-20">
      {/* No page title. The tab strip above already names this section, and
          Settings was the only one of the fifteen tabs that repeated its own
          name in the body. */}
      {error && (
        <Alert variant="error" className="mb-4">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-danger-800 font-bold">
            x
          </button>
        </Alert>
      )}

      {/* Three blocks, not one grid. The full-width cards (Share & Invite,
          Danger Zone) sit directly in this column; the two-column regions are
          their own grids so each can align independently. A single grid with
          `items-start` could not do that — it switched off stretch for every
          card at once, which is what left them at ragged content heights. */}
      <div className="flex flex-col gap-4">

        {/* Share & Invite beside Pool Mode. One grid on default stretch, so the
            two match height without either carrying a fixed one. */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Share & Invite. The QR is inline rather than behind a modal so an
            admin can hold the screen up and let someone scan straight away; the
            code underneath is the spoken/typed fallback. Mirrors the RN card. */}
        <Card padding="sm" className="flex flex-col">
          <Caption>Share &amp; Invite</Caption>

          {/* Stacked on a phone, side-by-side from lg. Stacked it is ~400px
              tall, which on a two-column desktop grid left a dead half-row
              beside whatever card sat next to it; laid out wide it is short
              enough that every row below pairs evenly. */}
          <div className="flex flex-col lg:flex-row items-center lg:items-center gap-5 lg:gap-8">
            {/* Solid white plate regardless of theme — QR readers need a light
                quiet zone, and a themed surface would break scanning in dark. */}
            <div className="p-3 rounded-card bg-white shadow-card shrink-0">
              {qrDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qrDataUrl} alt={`QR code to join with pool code ${pool.pool_code}`}
                     width={180} height={180} className="block w-[180px] h-[180px]" />
              ) : (
                <div className="w-[180px] h-[180px] rounded-chip bg-mist animate-pulse" aria-hidden="true" />
              )}
            </div>

            <div className="flex-1 min-w-0 w-full flex flex-col items-center lg:items-start gap-3">
              <div className="flex flex-col items-center lg:items-start gap-0.5">
                {/* The code is the thing an admin reads aloud or holds up, so
                    it gets the emphasis. There is room to grow both: the card's
                    height is set by the 180px QR beside them, not by this
                    column. */}
                <span className="t-card-title text-ink">Pool Code</span>
                <span className="t-num t-num-extrabold text-[32px] leading-none text-ink tracking-[0.125em]">
                  {pool.pool_code}
                </span>
              </div>

              <div className="flex gap-2 w-full lg:max-w-sm">
                <ShareButton
                  label={copiedKey === 'code' ? 'Copied!' : 'Copy Code'}
                  icon={copiedKey === 'code' ? 'checkmark' : 'doc.on.doc'}
                  active={copiedKey === 'code'}
                  onClick={() => copyShare('code')}
                />
                <ShareButton
                  label={copiedKey === 'link' ? 'Copied!' : 'Copy Link'}
                  icon={copiedKey === 'link' ? 'checkmark' : 'link'}
                  active={copiedKey === 'link'}
                  onClick={() => copyShare('link')}
                />
              </div>
            </div>
          </div>
        </Card>

        {/* ── Pool Mode ──
            Read-only. The mode is fixed when the pool is created because it
            determines the shape of every prediction already stored, so this
            card explains the mode rather than offering to change it. */}
        <Card padding="sm" className="flex flex-col">
          <Caption
            trailing={
              <span className="inline-flex items-center px-2 py-0.5 rounded-full t-detail font-bold bg-primary-600/12 text-primary-800">
                {modeInfo.label}
              </span>
            }
          >
            Pool Mode
          </Caption>

          <div className="flex-1 flex flex-col gap-3">
            <p className="t-body text-ink">{modeInfo.summary}</p>

            <ul className="flex flex-col gap-2">
              {modeInfo.points.map((point) => (
                <li key={point} className="flex items-start gap-2">
                  <Icon
                    name="checkmark.circle.fill"
                    size={15}
                    weight="semibold"
                    className="shrink-0 mt-0.5 text-primary-700"
                  />
                  <span className="t-body text-ink">{point}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>

        </div>

        {/* The two detail cards. Grid's default `stretch` makes the pair equal
            to the taller of them, so neither carries a min-height. */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* ── Pool Information ── */}
        <Card padding="sm" className="flex flex-col">
          <Caption>Pool Information</Caption>

          <div className="flex-1 flex flex-col gap-4">
            <FieldRow label="Pool Name *">
              <Input
                type="text"
                value={poolName}
                onChange={(e) => setPoolName(e.target.value)}
                placeholder="Enter pool name"
              />
            </FieldRow>

            <FieldRow label="Description" className="flex-1">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe your pool..."
                rows={3}
                className="w-full flex-1 min-h-[4.5rem] resize-none px-3 py-2.5 rounded-chip bg-mist text-sm text-ink focus:ring-2 focus:ring-primary-600/40 focus:border-transparent text-ink"
              />
            </FieldRow>
        </div>
      </Card>

        {/* ── Prediction Deadline ── */}
        <Card padding="sm">
          {/* No mode pill here — the Pool Mode card above names the mode, and
              the info banner below already says this pool is progressive. */}
          <Caption>
            {pool.prediction_mode === 'progressive' ? 'Group Stage Deadline' : 'Prediction Deadline'}
          </Caption>

          {pool.prediction_mode === 'progressive' && (
            <Alert variant="info">
              This pool uses progressive predictions. Round-specific deadlines are managed in the <strong>Rounds</strong> tab. The deadline below applies to the initial group stage.
            </Alert>
          )}

          {currentDeadline && (
            <div className="mb-4">
              <p className="t-body text-muted">
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
                <p className="t-body text-muted">
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
              <label className="block t-body text-ink mb-1">
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
              <label className="block t-body text-ink mb-1">
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
            <QuickDeadlineButton label="Tournament Start" onClick={() => setQuickDeadline('tournament_start')} />
            <QuickDeadlineButton label="1 Day Before" onClick={() => setQuickDeadline('one_day_before')} />
            <QuickDeadlineButton label="1 Week Before" onClick={() => setQuickDeadline('one_week_before')} />
          </div>
        </Card>

        </div>

        {/* The six single-setting cards. `auto-rows-fr` equalises every row in
            this grid, so all six match rather than only matching their
            row-mate. The per-card min-height this replaces could only ever lift
            the short cards up to a floor — the two tallest (Prediction Entries,
            Entry Fees) stood above it and stayed uneven. */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:auto-rows-fr">

        {/* ── Status ── */}
        <Card padding="sm">
        <Caption>Status</Caption>
        <SegmentedPicker value={status} options={statusOptions} onChange={setStatus} />
        <p className="t-detail text-muted mt-2.5">
          {statusOptions.find(s => s.value === status)?.desc}
        </p>
      </Card>

      {/* ── New Members ── */}
      <Card padding="sm">
        <Caption>New Members</Caption>
        <SegmentedPicker value={acceptingMembers} options={acceptingOptions} onChange={setAcceptingMembers} />
        <p className="t-detail text-muted mt-2.5">
          {acceptingOptions.find(o => o.value === acceptingMembers)?.desc}
        </p>
      </Card>


        {/* ── Visibility ── */}
        <Card padding="sm">
          <Caption>Visibility</Caption>
          <SegmentedPicker value={isPrivate} options={visibilityOptions} onChange={setIsPrivate} />
          <p className="t-detail text-muted mt-2.5">
            {visibilityOptions.find(o => o.value === isPrivate)?.desc}
          </p>
        </Card>

        {/* ── Max Members ── */}
        <Card padding="sm">
          <Caption>Max Members</Caption>
          <SettingsRow
            label="Cap on total members"
            subtitle={!maxParticipants || maxParticipants === '0' ? 'No limit' : `${maxParticipants} max`}
          >
            <Stepper
              value={parseInt(maxParticipants) || 0}
              onChange={(v) => setMaxParticipants(String(v))}
            />
          </SettingsRow>
        </Card>

        {/* ── Prediction Entries ── */}
        <Card padding="sm">
          <Caption>Prediction Entries</Caption>
          <p className="t-body text-muted mb-4">
            Each entry is scored separately on the leaderboard.
          </p>

          <div className="space-y-4">
            <FieldRow label="Max Entries Per Member">
              <EntryCountPicker
                value={parseInt(maxEntries) || 1}
                onChange={(v) => setMaxEntries(String(v))}
              />
            </FieldRow>

            {parseInt(maxEntries) > 1 && (
              <Alert variant="info" className="text-xs">
                  Members will be able to create up to {maxEntries} entries (e.g. &quot;Serious&quot;, &quot;Fun&quot;). Each entry appears as its own row on the leaderboard.
                </Alert>
            )}
          </div>
        </Card>

        {/* ── Entry Fees ── */}
        <Card padding="sm">
          <Caption>Entry Fees</Caption>
          <p className="t-body text-muted mb-4">
            Leave blank for a free pool.
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
              {/* No fixed width: Select sizes itself to its longest option, and
                  the longest here ("CAD (C$)") does not fit the w-28 this used
                  to carry. shrink-0 keeps it at that width while Fee Amount
                  takes the rest. */}
              <FieldRow label="Currency" className="shrink-0">
                <Select
                  value={entryFeeCurrency}
                  onChange={(e) => setEntryFeeCurrency(e.target.value)}
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
                </Select>
              </FieldRow>
            </div>

            {entryFee && parseFloat(entryFee) > 0 && (
              <Alert variant="info" className="text-xs">
                  Each entry will cost {new Intl.NumberFormat(undefined, { style: 'currency', currency: entryFeeCurrency }).format(parseFloat(entryFee))}. Track payments in the <strong>Fees</strong> tab.
                </Alert>
            )}
          </div>
        </Card>

        </div>

        {/* ── Danger Zone ── */}
        <Card padding="sm" className="border border-danger-200">
          <Caption tone="text-danger-700">
            Danger Zone
          </Caption>

          {/*
            Delete Pool was removed here (decision 2026-07-25). It destroyed every
            member's predictions irreversibly on one tap. Archive replaces it and is
            reversible; genuine deletion is a support action run with service-role
            credentials. Do not re-add a delete control to this screen.
          */}
          {myEntryCount > 0 && (
            <DangerRow
              icon="person.badge.minus"
              title="Stop Participating"
              subtitle="Delete your entries; stay on as admin"
              tone="text-warning-800"
              onClick={() => setShowStopConfirm(true)}
            />
          )}

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
            <p className="t-body text-muted">You have unsaved changes</p>
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

      {/* Stop Participating confirmation. Destructive and irreversible — the
          entries and every cascading prediction and score go — so it names what
          is lost and how many entries, and says plainly that admin is kept. */}
      {showStopConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 animate-modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={(e) => { if (e.target === e.currentTarget && !stopping) setShowStopConfirm(false) }}
        >
          <div className="bg-surface rounded-t-sheet sm:rounded-card shadow-card-elevated overflow-hidden sm:max-w-md w-full sm:mx-4 p-4 sm:p-6 dark:shadow-none dark:border dark:border-border-default">
            <h3 className="t-section-header text-ink mb-3">Stop Participating</h3>

            <Alert variant="warning">
              <p className="font-bold mb-2">{pool.pool_name}</p>
              <ul className="space-y-1">
                <li>&#8226; Your {myEntryCount === 1 ? 'entry' : `${myEntryCount} entries`} will be removed from the leaderboard</li>
                <li>&#8226; Your predictions, standings and scores are deleted</li>
                <li>&#8226; You stay an admin and keep every other privilege</li>
                <li>&#8226; This cannot be undone</li>
              </ul>
            </Alert>

            <div className="flex gap-3 justify-end">
              <Button variant="gray" onClick={() => setShowStopConfirm(false)} disabled={stopping}>
                Cancel
              </Button>
              <Button
                variant="warning"
                onClick={() => void performStopParticipating()}
                loading={stopping}
                loadingText="Removing..."
              >
                Stop Participating
              </Button>
            </div>
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
            <h3 className="t-section-header text-ink mb-3">
              Archive Pool
            </h3>

            <p className="t-body text-ink mb-3">
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
