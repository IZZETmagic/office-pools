'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'

declare global {
  interface Navigator {
    setAppBadge?: (count?: number) => Promise<void>
    clearAppBadge?: () => Promise<void>
  }
}

type UseUnreadBanterOptions = {
  userId: string
  poolIds: string[]
}

type UseUnreadBanterReturn = {
  unreadCounts: Map<string, number>
  markAsRead: (poolId: string) => void
  /** The original last_read_at values fetched on mount — never overwritten by markAsRead */
  initialLastReadMap: Map<string, string>
}

export function useUnreadBanter({ userId, poolIds }: UseUnreadBanterOptions): UseUnreadBanterReturn {
  const [unreadCounts, setUnreadCounts] = useState<Map<string, number>>(new Map())
  const supabaseRef = useRef(createClient())
  const lastReadMapRef = useRef<Map<string, string>>(new Map())
  // Immutable copy of last_read_at values as fetched on mount — never overwritten by markAsRead
  const initialLastReadMapRef = useRef<Map<string, string>>(new Map())

  // Stable key for poolIds dependency
  const poolIdsKey = useMemo(() => [...poolIds].sort().join(','), [poolIds])

  // Fetch initial unread state
  useEffect(() => {
    if (!poolIds.length || !userId) return
    const supabase = supabaseRef.current

    async function fetchInitial() {
      // Get last_read_at for all user's pool memberships
      const { data: memberships } = await supabase
        .from('pool_members')
        .select('pool_id, last_read_at')
        .eq('user_id', userId)
        .in('pool_id', poolIds)

      if (!memberships) return

      const lastReadMap = new Map<string, string>()
      for (const m of memberships) {
        lastReadMap.set(m.pool_id, m.last_read_at ?? new Date(0).toISOString())
      }
      lastReadMapRef.current = lastReadMap
      // Store immutable copy for consumers (e.g. "New messages" divider)
      if (initialLastReadMapRef.current.size === 0) {
        initialLastReadMapRef.current = new Map(lastReadMap)
      }

      // Check each pool for messages newer than last_read_at
      const counts = new Map<string, number>()
      await Promise.all(
        poolIds.map(async (poolId) => {
          const lastRead = lastReadMap.get(poolId) ?? new Date(0).toISOString()
          const { count } = await supabase
            .from('pool_messages')
            .select('*', { count: 'exact', head: true })
            .eq('pool_id', poolId)
            .gt('created_at', lastRead)
            .neq('user_id', userId)

          if (count && count > 0) {
            counts.set(poolId, count)
          }
        })
      )
      setUnreadCounts(counts)
    }

    fetchInitial()
  }, [userId, poolIdsKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Subscribe to real-time inserts
  useEffect(() => {
    if (!poolIds.length || !userId) return
    const supabase = supabaseRef.current
    const channels: ReturnType<typeof supabase.channel>[] = []

    for (const poolId of poolIds) {
      const channel = supabase
        .channel(`unread-banter-${poolId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'pool_messages',
            filter: `pool_id=eq.${poolId}`,
          },
          (payload) => {
            const newMsg = payload.new as { user_id: string; pool_id: string }
            if (newMsg.user_id !== userId) {
              setUnreadCounts((prev) => {
                const next = new Map(prev)
                next.set(newMsg.pool_id, (prev.get(newMsg.pool_id) ?? 0) + 1)
                return next
              })
            }
          }
        )
        .subscribe()

      channels.push(channel)
    }

    return () => {
      for (const ch of channels) {
        supabase.removeChannel(ch)
      }
    }
  }, [userId, poolIdsKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync total unread count to PWA app icon badge (Badging API)
  useEffect(() => {
    if (!navigator.setAppBadge) return

    let total = 0
    for (const count of unreadCounts.values()) {
      total += count
    }

    if (total > 0) {
      navigator.setAppBadge(total).catch(() => {})
    } else {
      navigator.clearAppBadge?.().catch(() => {})
    }
  }, [unreadCounts])

  // Mark a pool as read
  const markAsRead = useCallback(
    (poolId: string) => {
      const now = new Date().toISOString()
      lastReadMapRef.current.set(poolId, now)

      setUnreadCounts((prev) => {
        if (!prev.has(poolId)) return prev
        const next = new Map(prev)
        next.delete(poolId)
        return next
      })

      // Persist to DB (fire-and-forget)
      supabaseRef.current
        .from('pool_members')
        .update({ last_read_at: now })
        .eq('user_id', userId)
        .eq('pool_id', poolId)
        .then()
    },
    [userId]
  )

  return { unreadCounts, markAsRead, initialLastReadMap: initialLastReadMapRef.current }
}
