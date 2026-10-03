'use client'

// "Keep this group together?" → Save as a crew — the web twin of mobile's SaveCrewSheet.
//
// The pool's admin names the crew (the pool's own name is the suggestion) and saves; everyone who
// played becomes a member. Nobody is asked anything now — their yes comes later, when they take a
// saved spot (Decision 2).
//
// ⚠ It says, in words, that saving makes the pool PRIVATE. A crew pool is never listed in Discover
// (Decision 6 / migration 154), and 84 of the finished World Cup groups were Public — so this is a
// change to their pool, and the admin is told before they press Save, not after.

import { useState } from 'react'

import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { CREW_NAME_MAX } from '@/lib/crews/rules'

export function SaveCrewModal({
  target,
  onClose,
  onSaved,
}: {
  /** null = closed. */
  target: { poolId: string; suggestedName: string; people: number } | null
  onClose: () => void
  onSaved: (crewId: string) => void
}) {
  // ⚠ Starts from props and never re-syncs: the caller remounts this per pool (`key`), so opening it
  // for another pool is a fresh dialog with that pool's name, not this one's leftovers.
  const [name, setName] = useState(() => target?.suggestedName.slice(0, CREW_NAME_MAX) ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const trimmed = name.replace(/\s+/g, ' ').trim()
  const canSave = !!target && trimmed.length > 0 && !saving

  async function save() {
    if (!canSave || !target) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/crews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed, pool_id: target.poolId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || typeof data.crewId !== 'string') {
        setError(typeof data.error === 'string' ? data.error : 'We couldn’t save the crew. Please try again.')
        setSaving(false)
        return
      }
      onSaved(data.crewId)
    } catch {
      setError('We couldn’t save the crew. Please try again.')
      setSaving(false)
    }
  }

  return (
    <Modal isOpen={!!target} onClose={onClose} size="sm" titleId="save-crew-title">
      <form
        className="px-5 sm:px-6 pt-4 pb-6 flex flex-col gap-5 overflow-y-auto"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="w-14 h-14 rounded-card bg-primary-600/10 flex items-center justify-center">
            <Icon name="person.3.fill" size={26} className="text-primary-600" weight="semibold" />
          </div>
          <h2 id="save-crew-title" className="t-card-title text-ink">
            Keep this group together?
          </h2>
          {/* Word for word the app's SaveCrewSheet. */}
          <p className="t-body text-muted">
            Save these {target?.people ?? 0} as a crew. Next time any of you starts a pool, everyone gets a saved
            spot — nobody has to be chased.
          </p>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] font-black tracking-[0.6px] text-muted">CREW NAME</span>
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setError(null)
            }}
            maxLength={CREW_NAME_MAX}
            autoFocus
            autoComplete="off"
          />
        </label>

        <div className="flex gap-2.5 p-3 rounded-control bg-mist">
          <Icon name="lock.fill" size={14} className="text-muted mt-0.5 shrink-0" />
          <p className="text-[13px] leading-[18px] text-muted">
            Crew pools are private, so this pool won’t be listed in Discover. The competition’s over — nothing else
            about it changes.
          </p>
        </div>

        {error ? <p className="text-sm text-danger-700 bg-danger-50 rounded-control p-3 text-center">{error}</p> : null}

        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={!canSave} loading={saving} loadingText="Saving…">
            Save as a crew
          </Button>
        </div>
      </form>
    </Modal>
  )
}
