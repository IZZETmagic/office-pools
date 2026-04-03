'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { useToast } from '@/components/ui/Toast'

type PoolInfo = {
  pool_id: string
  pool_name: string
  pool_code: string
  description: string | null
  status: string
  prediction_mode: string
}

type JoinPoolClientProps = {
  pool: PoolInfo
  memberCount: number
  isAlreadyMember: boolean
  username: string
  userId: string
}

const MODE_LABELS: Record<string, string> = {
  full_tournament: 'Full Tournament',
  progressive: 'Progressive',
  bracket_picker: 'Bracket Picker',
}

export function JoinPoolClient({ pool, memberCount, isAlreadyMember, username, userId }: JoinPoolClientProps) {
  const supabase = createClient()
  const router = useRouter()
  const { showToast } = useToast()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isOpen = pool.status === 'open'

  const handleJoin = async () => {
    setLoading(true)
    setError(null)

    // Insert membership
    const { data: memberData, error: insertError } = await supabase
      .from('pool_members')
      .insert({
        pool_id: pool.pool_id,
        user_id: userId,
        role: 'player',
      })
      .select('member_id')
      .single()

    if (insertError) {
      if (insertError.code === '23505') {
        setError('You are already a member of this pool!')
      } else {
        setError(insertError.message)
      }
      setLoading(false)
      return
    }

    // Auto-create first entry
    const { error: entryError } = await supabase
      .from('pool_entries')
      .insert({
        member_id: memberData.member_id,
        entry_name: username || 'Entry 1',
        entry_number: 1,
      })

    if (entryError) {
      console.error('Failed to create first entry:', entryError.message)
    }

    // Send welcome email (fire-and-forget)
    fetch('/api/notifications/pool-joined', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pool_id: pool.pool_id }),
    }).catch(() => {})

    showToast(`Joined "${pool.pool_name}"!`, 'success')
    router.push(`/pools/${pool.pool_id}`)
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-secondary px-4">
      <div className="max-w-md w-full">
        <div className="bg-surface rounded-2xl shadow-sm border border-neutral-100 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-br from-primary-600 to-primary-700 px-6 py-8 text-center text-white">
            <div className="text-4xl mb-3">&#9917;</div>
            <p className="text-primary-200 text-sm font-medium mb-1">You&apos;ve been invited to join</p>
            <h1 className="text-2xl font-bold">{pool.pool_name}</h1>
          </div>

          {/* Details */}
          <div className="px-6 py-5 space-y-4">
            {pool.description && (
              <p className="text-neutral-600 text-sm">{pool.description}</p>
            )}

            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1.5 text-neutral-500">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128H5.228A2 2 0 013 17.208V15a4.002 4.002 0 014.464-3.978A3 3 0 0112 13.5a3 3 0 014.536-2.478A4.002 4.002 0 0121 15v2.208a2 2 0 01-2.228 1.92M15 19.128H9" />
                </svg>
                <span>{memberCount} {memberCount === 1 ? 'member' : 'members'}</span>
              </div>
              <div className="flex items-center gap-1.5 text-neutral-500">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
                </svg>
                <span>{MODE_LABELS[pool.prediction_mode] || pool.prediction_mode}</span>
              </div>
            </div>

            {error && <Alert variant="error">{error}</Alert>}

            {/* Actions */}
            {isAlreadyMember ? (
              <div className="space-y-3">
                <Alert variant="success">You&apos;re already a member of this pool.</Alert>
                <Button
                  fullWidth
                  size="lg"
                  onClick={() => router.push(`/pools/${pool.pool_id}`)}
                >
                  Go to Pool
                </Button>
              </div>
            ) : !isOpen ? (
              <Alert variant="error">This pool is no longer accepting new members.</Alert>
            ) : (
              <Button
                fullWidth
                size="lg"
                onClick={handleJoin}
                loading={loading}
                loadingText="Joining..."
              >
                Join Pool
              </Button>
            )}
          </div>
        </div>

        {/* Footer link */}
        <p className="text-center mt-4">
          <a href="/pools" className="text-sm text-neutral-500 hover:underline">
            &larr; Browse all pools
          </a>
        </p>
      </div>
    </div>
  )
}
