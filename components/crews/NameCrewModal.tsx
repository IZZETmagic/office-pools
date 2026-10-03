'use client'

// Name a crew — "New crew" on Profile → Crews, and "Rename" on the crew page. The app uses its
// PromptDialog for both; this is the web's one dialog for the same job.
//
// Mount it only while it is open (`{open && <NameCrewModal …/>}`): its state starts from props and
// never re-syncs, so each opening is a fresh field.

import { useState } from 'react'

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { errorText } from '@/lib/crews/client'
import { CREW_NAME_MAX } from '@/lib/crews/rules'

export function NameCrewModal({
  title,
  description,
  initialName = '',
  placeholder,
  confirmLabel,
  onClose,
  onSubmit,
}: {
  title: string
  description: string
  initialName?: string
  placeholder?: string
  confirmLabel: string
  onClose: () => void
  /** Throws to keep the dialog open with the server's sentence. */
  onSubmit: (name: string) => Promise<void>
}) {
  const [name, setName] = useState(initialName)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const trimmed = name.replace(/\s+/g, ' ').trim()

  async function submit() {
    if (!trimmed || busy) return
    setBusy(true)
    setError(null)
    try {
      await onSubmit(trimmed)
    } catch (e) {
      setError(errorText(e))
      setBusy(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} size="sm" titleId="name-crew-title">
      <form
        className="px-5 sm:px-6 pt-4 pb-6 flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <div className="flex flex-col gap-1.5">
          <h2 id="name-crew-title" className="t-card-title text-ink">
            {title}
          </h2>
          <p className="t-body text-muted">{description}</p>
        </div>
        <Input
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setError(null)
          }}
          placeholder={placeholder}
          maxLength={CREW_NAME_MAX}
          autoFocus
          autoComplete="off"
          aria-label="Crew name"
        />
        {error ? <p className="text-sm text-danger-700 bg-danger-50 rounded-control p-3 text-center">{error}</p> : null}
        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={!trimmed} loading={busy}>
            {confirmLabel}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
