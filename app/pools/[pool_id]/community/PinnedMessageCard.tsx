'use client'

import { useState, useEffect, useRef } from 'react'
import { Icon } from '@/components/ui/Icon'
import { createClient } from '@/lib/supabase/client'
import type { PinnedMessage } from './types'

type PinnedMessageCardProps = {
  poolId: string
  isAdmin: boolean
  onShareBoldCall: () => void
  onEditPin: (pinned: PinnedMessage) => void
  sharedCallsCount: number
}

export function PinnedMessageCard({
  poolId,
  isAdmin,
  onShareBoldCall,
  onEditPin,
  sharedCallsCount,
}: PinnedMessageCardProps) {
  const [pinned, setPinned] = useState<PinnedMessage | null>(null)
  const [loading, setLoading] = useState(true)
  const supabaseRef = useRef(createClient())

  // Load pinned message
  useEffect(() => {
    const load = async () => {
      const { data } = await supabaseRef.current
        .from('pool_pinned_messages')
        .select('*')
        .eq('pool_id', poolId)
        .eq('is_active', true)
        .maybeSingle()

      if (data) setPinned(data as PinnedMessage)
      setLoading(false)
    }
    load()
  }, [poolId])

  // Realtime subscription for pinned changes
  useEffect(() => {
    const supabase = supabaseRef.current
    const channel = supabase
      .channel(`pool-pinned-${poolId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pool_pinned_messages',
          filter: `pool_id=eq.${poolId}`,
        },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            setPinned(null)
          } else {
            const updated = payload.new as PinnedMessage
            if (updated.is_active) {
              setPinned(updated)
            } else {
              setPinned(null)
            }
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [poolId])

  if (loading || !pinned) return null

  const handleRemove = async () => {
    await supabaseRef.current
      .from('pool_pinned_messages')
      .update({ is_active: false })
      .eq('pinned_id', pinned.pinned_id)
  }

  return (
    <div className="sticky top-0 z-10 mx-1 mb-3">
      <div className="bg-primary-50 dark:bg-primary-900/10 border border-primary-200 dark:border-primary-800 rounded-control px-3.5 py-3">
        {/* Top row: badge + admin actions */}
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-primary-800">
            <Icon name="bookmark.fill" size={12} />
            Pinned
          </span>

          {isAdmin && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => onEditPin(pinned)}
                className="p-1 text-primary-400 hover:text-primary-600 dark:hover:text-primary-300 rounded transition-colors"
                title="Edit pinned message"
              >
                <Icon name="pencil" size={14} />
              </button>
              <button
                onClick={handleRemove}
                className="p-1 text-primary-400 hover:text-danger-500 dark:hover:text-danger-400 rounded transition-colors"
                title="Remove pinned message"
              >
                <Icon name="xmark" size={14} />
              </button>
            </div>
          )}
        </div>

        {/* Title */}
        <p className="text-sm font-bold text-ink leading-snug">
          {pinned.title}
        </p>

        {/* Description */}
        <p className="text-xs text-muted mt-1 leading-relaxed">
          {pinned.description}
        </p>

        {/* CTA row */}
        <div className="flex items-center justify-between mt-2.5">
          {pinned.cta_type === 'share_bold_call' && (
            <button
              onClick={onShareBoldCall}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-primary-600 hover:bg-primary-700 active:scale-[0.98] rounded-chip px-3 py-1.5 transition-all"
            >
              <Icon name="ellipsis" size={14} />
              Share My Bold Call
            </button>
          )}

          {sharedCallsCount > 0 && (
            <span className="text-[10px] text-primary-800 font-medium">
              {sharedCallsCount} call{sharedCallsCount !== 1 ? 's' : ''} shared
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
