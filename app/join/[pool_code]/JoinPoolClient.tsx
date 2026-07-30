'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { Icon } from '@/components/ui/Icon'
import { useToast } from '@/components/ui/Toast'
import { poolJoinability } from '@/lib/poolStatus'
import { getModeLongName } from '@/lib/design/poolMode'

type PoolInfo = {
  pool_id: string
  pool_name: string
  pool_code: string
  description: string | null
  status: string
  accepting_members: boolean | null
  prediction_mode: string
  brand_name: string | null
  brand_emoji: string | null
  brand_color: string | null
  brand_accent: string | null
  brand_logo_url: string | null
}

type JoinPoolClientProps = {
  pool: PoolInfo
  memberCount: number
  isAlreadyMember: boolean
}

export function JoinPoolClient({ pool, memberCount, isAlreadyMember }: JoinPoolClientProps) {
  const router = useRouter()
  const { showToast } = useToast()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Mirrors the server-side gate in /api/pools/join so the button state and the
  // API refusal always agree, including which reason is shown.
  const { canJoin, reason: blockedReason } = poolJoinability(pool)

  const handleJoin = async () => {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/pools/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pool_id: pool.pool_id }),
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

      showToast(`Joined "${pool.pool_name}"!`, 'success')
      router.push(`/pools/${pool.pool_id}`)
      router.refresh()
    } catch {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-secondary px-4">
      <div className="max-w-md w-full">
        <div className="bg-surface rounded-card shadow-card border border-border-subtle overflow-hidden">
          {/* Header */}
          <div
            className={`px-6 py-8 text-center text-white ${!pool.brand_color ? 'bg-gradient-to-br from-primary-600 to-primary-700' : ''}`}
            style={pool.brand_color ? { background: `linear-gradient(135deg, ${pool.brand_color} 0%, ${pool.brand_color}dd 100%)` } : undefined}
          >
            <div className="mb-3">
              {pool.brand_logo_url ? (
                <img src={pool.brand_logo_url} alt={pool.brand_name || ''} className="w-16 h-16 rounded-control object-cover mx-auto" />
              ) : (
                <span className="text-4xl">{pool.brand_emoji || '\u26BD'}</span>
              )}
            </div>
            <p className="t-caption text-white/60 mb-2">You&apos;ve been invited to join</p>
            <h1 className="t-section-header text-white">{pool.pool_name}</h1>
          </div>

          {/* Details */}
          <div className="px-6 py-5 space-y-4">
            {pool.description && (
              <p className="t-body text-muted">{pool.description}</p>
            )}

            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1.5 text-muted">
                <Icon name="person.3.fill" size={16} weight="semibold" />
                <span>{memberCount} {memberCount === 1 ? 'member' : 'members'}</span>
              </div>
              <div className="flex items-center gap-1.5 text-muted">
                <Icon name="ticket.fill" size={16} weight="semibold" />
                <span>{getModeLongName(pool.prediction_mode)}</span>
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
            ) : !canJoin ? (
              <Alert variant="error">{blockedReason}</Alert>
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
          <a href="/pools" className="text-sm text-muted hover:underline">
            &larr; Browse all pools
          </a>
        </p>
      </div>
    </div>
  )
}
