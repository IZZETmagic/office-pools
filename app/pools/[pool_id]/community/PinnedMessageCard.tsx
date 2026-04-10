'use client'

import { useState, useEffect, useRef } from 'react'
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
      <div className="bg-primary-50 dark:bg-primary-900/10 border border-primary-200 dark:border-primary-800 rounded-xl px-3.5 py-3">
        {/* Top row: badge + admin actions */}
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-primary-600 dark:text-primary-400">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
              <path d="M16.5 3.75V16.5L12 14.25 7.5 16.5V3.75m9 0H18A2.25 2.25 0 0120.25 6v12A2.25 2.25 0 0118 20.25H6A2.25 2.25 0 013.75 18V6A2.25 2.25 0 016 3.75h1.5m9 0h-9" />
            </svg>
            Pinned
          </span>

          {isAdmin && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => onEditPin(pinned)}
                className="p-1 text-primary-400 hover:text-primary-600 dark:hover:text-primary-300 rounded transition-colors"
                title="Edit pinned message"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                </svg>
              </button>
              <button
                onClick={handleRemove}
                className="p-1 text-primary-400 hover:text-danger-500 dark:hover:text-danger-400 rounded transition-colors"
                title="Remove pinned message"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* Title */}
        <p className="text-sm font-bold text-neutral-900 dark:text-neutral-100 leading-snug">
          {pinned.title}
        </p>

        {/* Description */}
        <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1 leading-relaxed">
          {pinned.description}
        </p>

        {/* CTA row */}
        <div className="flex items-center justify-between mt-2.5">
          {pinned.cta_type === 'share_bold_call' && (
            <button
              onClick={onShareBoldCall}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-primary-600 hover:bg-primary-700 active:scale-[0.98] rounded-lg px-3 py-1.5 transition-all"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
              </svg>
              Share My Bold Call
            </button>
          )}

          {sharedCallsCount > 0 && (
            <span className="text-[10px] text-primary-500 dark:text-primary-400 font-medium">
              {sharedCallsCount} call{sharedCallsCount !== 1 ? 's' : ''} shared
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
