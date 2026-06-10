'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'

// App-wide presence. One provider in the root layout joins the
// `pool-presence-{poolId}` channel for every pool the signed-in user
// belongs to, so "online" means "has the app open anywhere" rather than
// "has this pool's Banter tab open". The payload also carries
// `active_pool_id` (derived from the route) so consumers can distinguish
// "in this pool right now" from "online elsewhere in the app".
//
// The provider is the single owner of channel.track() — the typing
// indicator rides the same presence payload, so routing all track calls
// through one place prevents an app-level heartbeat from clobbering a
// "typing…" state (and vice versa). Banter UI calls setIsTyping(poolId,
// bool) from context.
//
// Lifecycle: Page Visibility API. Hidden tab → untrack (so an overnight
// background tab doesn't show as online forever); visible → re-track.
//
// Cost: presence lives in Supabase's realtime layer (in-memory) — no
// Postgres IO. All channels multiplex over one websocket per tab.
// Anonymous visitors: getSession() reads local storage only, no network
// call, and the provider no-ops entirely.

export type PresenceUser = {
  user_id: string
  username: string
  full_name: string
  online_at: string
  is_typing: boolean
  active_pool_id: string | null
}

type Identity = {
  user_id: string
  username: string
  full_name: string
}

type PresenceContextValue = {
  onlineByPool: Map<string, PresenceUser[]>
  setIsTyping: (poolId: string, typing: boolean) => void
}

const PresenceContext = createContext<PresenceContextValue>({
  onlineByPool: new Map(),
  setIsTyping: () => {},
})

export function PresenceProvider({ children }: { children: ReactNode }) {
  const supabaseRef = useRef(createClient())
  const [identity, setIdentity] = useState<Identity | null>(null)
  const [poolIds, setPoolIds] = useState<string[]>([])
  const [onlineByPool, setOnlineByPool] = useState<Map<string, PresenceUser[]>>(new Map())

  const channelsRef = useRef<Map<string, RealtimeChannel>>(new Map())
  const typingRef = useRef<Map<string, boolean>>(new Map())
  const typingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const identityRef = useRef<Identity | null>(null)
  identityRef.current = identity

  // Current pool from the route — /pools/{id}/... → that pool, anywhere
  // else in the app → null ("online, not in a specific pool").
  const pathname = usePathname()
  const activePoolId = useMemo(() => {
    const m = pathname?.match(/^\/pools\/([^/]+)/)
    return m ? m[1] : null
  }, [pathname])
  const activePoolIdRef = useRef<string | null>(activePoolId)

  const buildPayload = useCallback((poolId: string): PresenceUser | null => {
    const id = identityRef.current
    if (!id) return null
    return {
      user_id: id.user_id,
      username: id.username,
      full_name: id.full_name,
      online_at: new Date().toISOString(),
      is_typing: typingRef.current.get(poolId) ?? false,
      active_pool_id: activePoolIdRef.current,
    }
  }, [])

  const trackAll = useCallback(() => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    for (const [poolId, channel] of channelsRef.current) {
      const payload = buildPayload(poolId)
      if (payload) void channel.track(payload)
    }
  }, [buildPayload])

  const untrackAll = useCallback(() => {
    for (const channel of channelsRef.current.values()) {
      void channel.untrack()
    }
  }, [])

  // ---- Identity + pool memberships (signed-in users only) ----
  useEffect(() => {
    const supabase = supabaseRef.current
    let cancelled = false

    async function load() {
      // Local-storage read — no network/DB cost on marketing pages.
      const { data: { session } } = await supabase.auth.getSession()
      if (!session || cancelled) return

      const { data: userData } = await supabase
        .from('users')
        .select('user_id, username, full_name')
        .eq('auth_user_id', session.user.id)
        .single()
      if (!userData || cancelled) return

      const { data: memberships } = await supabase
        .from('pool_members')
        .select('pool_id')
        .eq('user_id', userData.user_id)
      if (cancelled) return

      setIdentity({
        user_id: userData.user_id,
        username: userData.username ?? '',
        full_name: userData.full_name ?? '',
      })
      setPoolIds((memberships ?? []).map(m => m.pool_id))
    }

    void load()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') void load()
      if (event === 'SIGNED_OUT') {
        setIdentity(null)
        setPoolIds([])
      }
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  // ---- Channels: one per pool membership ----
  const poolIdsKey = poolIds.join(',')
  useEffect(() => {
    if (!identity || poolIds.length === 0) return
    const supabase = supabaseRef.current
    const channels = channelsRef.current

    for (const poolId of poolIds) {
      if (channels.has(poolId)) continue

      const channel = supabase.channel(`pool-presence-${poolId}`, {
        config: { presence: { key: identity.user_id } },
      })

      channel
        .on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState<PresenceUser>()
          const users: PresenceUser[] = []
          for (const presences of Object.values(state)) {
            if (presences.length > 0) {
              const p = presences[0] as unknown as PresenceUser
              // Exclude self — consumers add the current user back
              // (matches the original usePresence contract).
              if (p.user_id !== identity.user_id) users.push(p)
            }
          }
          setOnlineByPool(prev => {
            const next = new Map(prev)
            next.set(poolId, users)
            return next
          })
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            if (typeof document === 'undefined' || document.visibilityState === 'visible') {
              const payload = buildPayload(poolId)
              if (payload) void channel.track(payload)
            }
          }
        })

      channels.set(poolId, channel)
    }

    // Drop channels for pools we're no longer in.
    for (const [poolId, channel] of channels) {
      if (!poolIds.includes(poolId)) {
        void supabase.removeChannel(channel)
        channels.delete(poolId)
      }
    }

    return () => {
      for (const channel of channels.values()) {
        void supabase.removeChannel(channel)
      }
      channels.clear()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity, poolIdsKey, buildPayload])

  // ---- Re-track when the active pool changes (route navigation) ----
  useEffect(() => {
    if (activePoolIdRef.current === activePoolId) return
    activePoolIdRef.current = activePoolId
    trackAll()
  }, [activePoolId, trackAll])

  // ---- Page Visibility: hidden → offline, visible → online ----
  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        untrackAll()
      } else {
        trackAll()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [trackAll, untrackAll])

  // ---- Typing indicator (single track() owner — see header comment) ----
  const setIsTyping = useCallback((poolId: string, typing: boolean) => {
    const channel = channelsRef.current.get(poolId)
    if (!channel) return

    typingRef.current.set(poolId, typing)
    const payload = buildPayload(poolId)
    if (payload) void channel.track(payload)

    const timers = typingTimersRef.current
    const existing = timers.get(poolId)
    if (existing) clearTimeout(existing)

    // Auto-reset typing after 3s (mirrors the original usePresence).
    if (typing) {
      timers.set(poolId, setTimeout(() => {
        typingRef.current.set(poolId, false)
        const ch = channelsRef.current.get(poolId)
        const p = buildPayload(poolId)
        if (ch && p) void ch.track(p)
      }, 3000))
    }
  }, [buildPayload])

  useEffect(() => {
    const timers = typingTimersRef.current
    return () => {
      for (const t of timers.values()) clearTimeout(t)
    }
  }, [])

  const value = useMemo(
    () => ({ onlineByPool, setIsTyping }),
    [onlineByPool, setIsTyping]
  )

  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>
}

/**
 * Per-pool presence view for consumers (Banter tab, online strips).
 * Same return shape as the old `usePresence` hook so call sites stay
 * simple: onlineUsers excludes the current user; setIsTyping is curried
 * to this pool.
 */
export function usePoolPresence(poolId: string): {
  onlineUsers: PresenceUser[]
  typingUsers: PresenceUser[]
  setIsTyping: (typing: boolean) => void
} {
  const { onlineByPool, setIsTyping } = useContext(PresenceContext)
  const onlineUsers = onlineByPool.get(poolId) ?? EMPTY_USERS
  const typingUsers = useMemo(() => onlineUsers.filter(u => u.is_typing), [onlineUsers])
  const setIsTypingForPool = useCallback(
    (typing: boolean) => setIsTyping(poolId, typing),
    [setIsTyping, poolId]
  )
  return { onlineUsers, typingUsers, setIsTyping: setIsTypingForPool }
}

const EMPTY_USERS: PresenceUser[] = []
