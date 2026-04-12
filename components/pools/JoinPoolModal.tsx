'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { useToast } from '@/components/ui/Toast'
import { Input } from '@/components/ui/Input'
import { FormField } from '@/components/ui/FormField'

type JoinPoolModalProps = {
  onClose: () => void
  onSuccess?: () => void
  /** Optional pre-filled pool code (e.g. from Discover tab) */
  initialCode?: string
  /** Optional pool name for confirmation mode (from Discover tab) */
  initialPoolName?: string
}

export function JoinPoolModal({ onClose, onSuccess, initialCode = '', initialPoolName = '' }: JoinPoolModalProps) {
  const router = useRouter()
  const { showToast } = useToast()

  const placeholderCode = useMemo(() => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let s = ''
    for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)]
    return s
  }, [])

  const [joinCode, setJoinCode] = useState(initialCode)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleJoinPool = async () => {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/pools/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pool_code: joinCode }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to join pool.')
        setLoading(false)
        return
      }

      // Send welcome email (fire-and-forget)
      fetch('/api/notifications/pool-joined', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pool_id: data.pool_id }),
      }).catch(() => {})

      setLoading(false)
      showToast(`Joined "${data.pool_name}"!`, 'success')
      setJoinCode('')
      onSuccess?.()
      onClose()
      router.refresh()
    } catch {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 modal-overlay animate-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="join-pool-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose()
      }}
    >
      <div className="bg-surface rounded-t-2xl sm:rounded-2xl shadow-xl sm:max-w-md w-full sm:mx-4 flex flex-col dark:shadow-none dark:border dark:border-border-default modal-panel animate-modal-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 pt-4 sm:pt-5 pb-3 border-b border-neutral-100">
          <h2 id="join-pool-title" className="text-lg font-bold text-neutral-900">
            {initialPoolName ? 'Join Pool' : 'Join a Pool'}
          </h2>
          <button
            onClick={() => !loading && onClose()}
            className="p-1.5 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 rounded-xl transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="px-4 sm:px-6 py-4 sm:py-5">
          {initialPoolName ? (
            <>
              <p className="text-sm text-neutral-600 mb-1">Would you like to join</p>
              <p className="text-base font-semibold text-neutral-900">{initialPoolName}?</p>
            </>
          ) : (
            <>
              <p className="text-sm text-neutral-600 mb-4">Enter the pool code shared with you to join.</p>

              <FormField label="Pool Code">
                <Input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder={`e.g. ${placeholderCode}`}
                />
              </FormField>
            </>
          )}

          {error && <Alert variant="error" className="mt-3">{error}</Alert>}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-4 sm:px-6 pb-4 sm:pb-5">
          <Button
            variant="gray"
            onClick={onClose}
            disabled={loading}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            onClick={handleJoinPool}
            disabled={loading || !joinCode}
            loading={loading}
            loadingText="Joining..."
            className="flex-1"
          >
            Join Pool
          </Button>
        </div>
      </div>
    </div>
  )
}
