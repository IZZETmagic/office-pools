'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Modal } from '@/components/ui/Modal'
import type { PinnedMessage } from './types'

type PinMessageModalProps = {
  poolId: string
  currentUserId: string
  existingPin?: PinnedMessage | null
  onClose: () => void
}

export function PinMessageModal({
  poolId,
  currentUserId,
  existingPin,
  onClose,
}: PinMessageModalProps) {
  const [title, setTitle] = useState(existingPin?.title ?? '')
  const [description, setDescription] = useState(existingPin?.description ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabaseRef = useRef(createClient())

  const isEditing = !!existingPin

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedTitle = title.trim()
    const trimmedDesc = description.trim()

    if (!trimmedTitle) {
      setError('Title is required')
      return
    }
    if (!trimmedDesc) {
      setError('Description is required')
      return
    }

    setSaving(true)
    setError(null)

    if (isEditing) {
      const { error: err } = await supabaseRef.current
        .from('pool_pinned_messages')
        .update({
          title: trimmedTitle,
          description: trimmedDesc,
          updated_at: new Date().toISOString(),
        })
        .eq('pinned_id', existingPin.pinned_id)

      if (err) {
        setError('Failed to update pinned message')
        setSaving(false)
        return
      }
    } else {
      // Upsert: deactivate any existing pin first, then insert
      await supabaseRef.current
        .from('pool_pinned_messages')
        .update({ is_active: false })
        .eq('pool_id', poolId)

      const { error: err } = await supabaseRef.current
        .from('pool_pinned_messages')
        .insert({
          pool_id: poolId,
          pinned_by: currentUserId,
          title: trimmedTitle,
          description: trimmedDesc,
          cta_type: 'share_bold_call',
          is_active: true,
        })

      if (err) {
        setError('Failed to create pinned message')
        setSaving(false)
        return
      }
    }

    setSaving(false)
    onClose()
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={isEditing ? 'Edit Pinned Message' : 'Pin a Message'}
      titleId="pin-message-title"
      size="sm"
    >
      {/* Form */}
      <form onSubmit={handleSubmit} className="px-4 sm:px-6 py-4 sm:py-5 space-y-4">
          <div>
            <label htmlFor="pin-title" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
              Title
            </label>
            <input
              id="pin-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder="e.g. Share your boldest prediction!"
              className="w-full text-sm bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-border-default rounded-xl px-3 py-2.5 text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-colors"
            />
          </div>

          <div>
            <label htmlFor="pin-desc" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
              Description
            </label>
            <textarea
              id="pin-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={1000}
              rows={3}
              placeholder="What should members share? e.g. Drop your most unexpected scoreline..."
              className="w-full text-sm bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-border-default rounded-xl px-3 py-2.5 text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-colors resize-none"
            />
          </div>

          {error && (
            <p className="text-xs text-danger-600 dark:text-danger-400">{error}</p>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 text-sm font-medium text-neutral-600 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-xl px-4 py-2.5 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !title.trim() || !description.trim()}
              className="flex-1 text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:pointer-events-none rounded-xl px-4 py-2.5 transition-all active:scale-[0.98]"
            >
              {saving ? 'Saving...' : isEditing ? 'Update' : 'Pin Message'}
            </button>
          </div>
      </form>
    </Modal>
  )
}
