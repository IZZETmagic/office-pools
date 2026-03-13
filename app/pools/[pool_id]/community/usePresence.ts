'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'

type PresenceUser = {
  user_id: string
  username: string
  full_name: string
  online_at: string
  is_typing: boolean
}

type UsePresenceReturn = {
  onlineUsers: PresenceUser[]
  typingUsers: PresenceUser[]
  setIsTyping: (typing: boolean) => void
}

export function usePresence(
  poolId: string,
  currentUser: { user_id: string; username: string; full_name: string },
): UsePresenceReturn {
  const [presenceState, setPresenceState] = useState<Map<string, PresenceUser>>(new Map())
  const channelRef = useRef<RealtimeChannel | null>(null)
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const supabaseRef = useRef(createClient())

  useEffect(() => {
    const supabase = supabaseRef.current
    const channel = supabase.channel(`pool-presence-${poolId}`, {
      config: { presence: { key: currentUser.user_id } },
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresenceUser>()
        const users = new Map<string, PresenceUser>()

        for (const [_key, presences] of Object.entries(state)) {
          if (presences.length > 0) {
            const p = presences[0] as unknown as PresenceUser
            if (p.user_id !== currentUser.user_id) {
              users.set(p.user_id, p)
            }
          }
        }

        setPresenceState(users)
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id: currentUser.user_id,
            username: currentUser.username,
            full_name: currentUser.full_name,
            online_at: new Date().toISOString(),
            is_typing: false,
          })
        }
      })

    channelRef.current = channel

    return () => {
      channel.untrack()
      supabase.removeChannel(channel)
      channelRef.current = null
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current)
      }
    }
  }, [poolId, currentUser.user_id, currentUser.username, currentUser.full_name])

  const setIsTyping = useCallback((typing: boolean) => {
    if (!channelRef.current) return

    channelRef.current.track({
      user_id: currentUser.user_id,
      username: currentUser.username,
      full_name: currentUser.full_name,
      online_at: new Date().toISOString(),
      is_typing: typing,
    })

    // Auto-reset typing after 3s
    if (typing) {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
      typingTimeoutRef.current = setTimeout(() => {
        if (channelRef.current) {
          channelRef.current.track({
            user_id: currentUser.user_id,
            username: currentUser.username,
            full_name: currentUser.full_name,
            online_at: new Date().toISOString(),
            is_typing: false,
          })
        }
      }, 3000)
    }
  }, [currentUser.user_id, currentUser.username, currentUser.full_name])

  const onlineUsers = Array.from(presenceState.values())
  const typingUsers = onlineUsers.filter(u => u.is_typing)

  return { onlineUsers, typingUsers, setIsTyping }
}
