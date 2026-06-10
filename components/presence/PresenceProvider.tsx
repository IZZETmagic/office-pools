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

// Heartbeat-based presence.
//
// Online status is NOT tracked over websockets. Earlier versions used
// Supabase realtime presence channels and hit a parade of mobile-Safari
// lifecycle bugs (suspended pages, zombie sockets that report open while
// the connection is dead, throttled reconnect timers). Heartbeats have
// no connection state to corrupt: while the tab is visible this client
// upserts its own `user_presence` row every HEARTBEAT_MS, and a beat
// that dies in a bad network moment is simply superseded by the next
// one. Hiding the tab writes is_active=false (instant offline);
// last_seen_at staleness (ONLINE_WINDOW_MS) catches dirty deaths —
// crashes, force-quits, network drops — where no offline beat ran.
//
// Reading is plain polling: while a Banter view has registered interest
// in a pool, the provider refetches that pool's member presence every
// POLL_MS and on tab-visible. No subscription to go stale on the viewer
// side either.
//
// The ONLY remaining websocket use is the typing indicator — transient,
// cosmetic, and rejoined fresh whenever a Banter view mounts, so socket
// staleness can't strand anything important.
//
// Writes go straight to PostgREST under RLS (users can only upsert
// their own row) — a serverless API route would add an invocation per
// beat for no benefit.

const HEARTBEAT_MS = 25_000
const ONLINE_WINDOW_MS = 60_000
const POLL_MS = 10_000
const TYPING_RESET_MS = 3_000

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
  typingByPool: Map<string, PresenceUser[]>
  registerInterest: (poolId: string) => () => void
  setIsTyping: (poolId: string, typing: boolean) => void
}

const PresenceContext = createContext<PresenceContextValue>({
  onlineByPool: new Map(),
  typingByPool: new Map(),
  registerInterest: () => () => {},
  setIsTyping: () => {},
})

export function PresenceProvider({ children }: { children: ReactNode }) {
  const supabaseRef = useRef(createClient())
  const [identity, setIdentity] = useState<Identity | null>(null)
  const identityRef = useRef<Identity | null>(null)
  identityRef.current = identity
  // Access token mirrored into a ref so the offline beat can run
  // synchronously from pagehide/visibilitychange handlers (no room for
  // an async getSession there — the page may be tearing down).
  const accessTokenRef = useRef<string | null>(null)

  const shouldBeOnlineRef = useRef(
    typeof document === 'undefined' ? true : document.visibilityState === 'visible'
  )

  // Current pool from the route — /pools/{id}/... → that pool, anywhere
  // else in the app → null ("online, not in a specific pool").
  const pathname = usePathname()
  const activePoolId = useMemo(() => {
    const m = pathname?.match(/^\/pools\/([^/]+)/)
    return m ? m[1] : null
  }, [pathname])
  const activePoolIdRef = useRef<string | null>(activePoolId)

  // ---- Identity (signed-in users only) ----
  useEffect(() => {
    const supabase = supabaseRef.current
    let cancelled = false

    async function load() {
      // Local-storage read — no network/DB cost on marketing pages.
      const { data: { session } } = await supabase.auth.getSession()
      if (!session || cancelled) return
      accessTokenRef.current = session.access_token

      const { data: userData } = await supabase
        .from('users')
        .select('user_id, username, full_name')
        .eq('auth_user_id', session.user.id)
        .single()
      if (!userData || cancelled) return

      setIdentity({
        user_id: userData.user_id,
        username: userData.username ?? '',
        full_name: userData.full_name ?? '',
      })
    }

    void load()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      accessTokenRef.current = session?.access_token ?? null
      if (event === 'SIGNED_IN') void load()
      if (event === 'SIGNED_OUT') setIdentity(null)
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  // ---- Heartbeat publisher ----
  const sendHeartbeat = useCallback(() => {
    const id = identityRef.current
    if (!id || !shouldBeOnlineRef.current) return
    void supabaseRef.current
      .from('user_presence')
      .upsert({
        user_id: id.user_id,
        last_seen_at: new Date().toISOString(),
        active_pool_id: activePoolIdRef.current,
        is_active: true,
        platform: 'web',
      })
      .then(({ error }) => {
        // Non-fatal: a dropped beat is superseded by the next one.
        if (error) console.warn('[presence] heartbeat failed:', error.message)
      })
  }, [])

  // Best-effort instant-offline write. keepalive lets the request
  // outlive the page on tab close; if it's lost anyway, the staleness
  // window marks us offline within ONLINE_WINDOW_MS.
  const sendOfflineBeat = useCallback(() => {
    const id = identityRef.current
    const token = accessTokenRef.current
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!id || !token || !url || !anonKey) return
    void fetch(`${url}/rest/v1/user_presence?on_conflict=user_id`, {
      method: 'POST',
      keepalive: true,
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify([{
        user_id: id.user_id,
        last_seen_at: new Date().toISOString(),
        active_pool_id: activePoolIdRef.current,
        is_active: false,
        platform: 'web',
      }]),
    }).catch(() => {})
  }, [])

  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current)
    sendHeartbeat()
    heartbeatTimerRef.current = setInterval(sendHeartbeat, HEARTBEAT_MS)
  }, [sendHeartbeat])
  const stopHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current)
      heartbeatTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!identity) return
    if (shouldBeOnlineRef.current) startHeartbeat()
    return stopHeartbeat
  }, [identity, startHeartbeat, stopHeartbeat])

  // Beat immediately when the active pool changes so the green/amber
  // distinction follows navigation without waiting for the next beat.
  useEffect(() => {
    if (activePoolIdRef.current === activePoolId) return
    activePoolIdRef.current = activePoolId
    sendHeartbeat()
  }, [activePoolId, sendHeartbeat])

  // ---- Viewer: interest-registered polling ----
  const interestCountsRef = useRef<Map<string, number>>(new Map())
  const [interestedPools, setInterestedPools] = useState<string[]>([])
  const [onlineByPool, setOnlineByPool] = useState<Map<string, PresenceUser[]>>(new Map())

  const registerInterest = useCallback((poolId: string) => {
    const counts = interestCountsRef.current
    counts.set(poolId, (counts.get(poolId) ?? 0) + 1)
    setInterestedPools(prev => (prev.includes(poolId) ? prev : [...prev, poolId]))
    return () => {
      const next = (counts.get(poolId) ?? 1) - 1
      if (next <= 0) {
        counts.delete(poolId)
        setInterestedPools(prev => prev.filter(p => p !== poolId))
      } else {
        counts.set(poolId, next)
      }
    }
  }, [])

  // poolId → member user_id → display identity. Built as a side effect
  // of polling; lets the postgres_changes fast-path (below) resolve an
  // incoming presence row to "which interested pools show this user,
  // and under what name" without an extra query per event.
  const rosterRef = useRef<Map<string, Map<string, { username: string; full_name: string }>>>(new Map())

  const fetchPoolPresence = useCallback(async (poolId: string) => {
    const supabase = supabaseRef.current
    const { data, error } = await supabase
      .from('pool_members')
      .select('user_id, users!inner(user_id, username, full_name, user_presence(last_seen_at, active_pool_id, is_active))')
      .eq('pool_id', poolId)
    if (error || !data) return

    const cutoff = Date.now() - ONLINE_WINDOW_MS
    const selfId = identityRef.current?.user_id
    const online: PresenceUser[] = []
    const roster = new Map<string, { username: string; full_name: string }>()
    for (const row of data as any[]) {
      const user = Array.isArray(row.users) ? row.users[0] : row.users
      if (!user) continue
      roster.set(user.user_id, {
        username: user.username ?? '',
        full_name: user.full_name ?? '',
      })
      const presence = Array.isArray(user.user_presence) ? user.user_presence[0] : user.user_presence
      if (!presence?.is_active) continue
      if (Date.parse(presence.last_seen_at) < cutoff) continue
      // Exclude self — consumers add the current user back (same
      // contract as the old channel-based presence).
      if (user.user_id === selfId) continue
      online.push({
        user_id: user.user_id,
        username: user.username ?? '',
        full_name: user.full_name ?? '',
        online_at: presence.last_seen_at,
        is_typing: false,
        active_pool_id: presence.active_pool_id ?? null,
      })
    }
    rosterRef.current.set(poolId, roster)
    setOnlineByPool(prev => {
      const next = new Map(prev)
      next.set(poolId, online)
      return next
    })
  }, [])

  const interestedPoolsKey = interestedPools.join(',')
  const fetchAllInterested = useCallback(() => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    for (const poolId of interestCountsRef.current.keys()) {
      void fetchPoolPresence(poolId)
    }
  }, [fetchPoolPresence])

  useEffect(() => {
    if (interestedPools.length === 0) return
    fetchAllInterested()
    const timer = setInterval(fetchAllInterested, POLL_MS)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interestedPoolsKey, fetchAllInterested])

  // ---- Realtime fast-path: presence rows pushed from the database ----
  // Sub-second dot updates layered ON TOP of the polling floor. This is
  // not the old peer-presence-channel problem coming back: the database
  // is the source of truth and these events are just notifications of
  // committed writes (RLS-gated to rows this user can read). If the
  // socket goes stale the only consequence is latency degrading to the
  // POLL_MS floor — the data on screen can never be wrong because of a
  // dead socket.
  useEffect(() => {
    if (!identity || interestedPools.length === 0) return
    const supabase = supabaseRef.current

    const channel = supabase
      .channel('user-presence-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_presence' },
        (payload) => {
          const row = payload.new as {
            user_id?: string
            last_seen_at?: string
            active_pool_id?: string | null
            is_active?: boolean
          } | null
          if (!row?.user_id || !row.last_seen_at) return
          if (row.user_id === identityRef.current?.user_id) return

          const fresh =
            !!row.is_active && Date.parse(row.last_seen_at) > Date.now() - ONLINE_WINDOW_MS

          setOnlineByPool(prev => {
            let changed = false
            const next = new Map(prev)
            // A user can appear in several interested pools; update each
            // roster the event's user belongs to.
            for (const poolId of interestCountsRef.current.keys()) {
              const member = rosterRef.current.get(poolId)?.get(row.user_id!)
              if (!member) continue
              const list = next.get(poolId) ?? []
              const idx = list.findIndex(u => u.user_id === row.user_id)
              if (fresh) {
                const entry: PresenceUser = {
                  user_id: row.user_id!,
                  username: member.username,
                  full_name: member.full_name,
                  online_at: row.last_seen_at!,
                  is_typing: false,
                  active_pool_id: row.active_pool_id ?? null,
                }
                next.set(poolId, idx >= 0 ? list.map((u, i) => (i === idx ? entry : u)) : [...list, entry])
                changed = true
              } else if (idx >= 0) {
                next.set(poolId, list.filter(u => u.user_id !== row.user_id))
                changed = true
              }
            }
            return changed ? next : prev
          })
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity, interestedPoolsKey])

  // ---- Tab lifecycle ----
  useEffect(() => {
    const resume = () => {
      shouldBeOnlineRef.current = true
      if (identityRef.current) startHeartbeat()
      fetchAllInterested()
    }
    const hide = () => {
      shouldBeOnlineRef.current = false
      stopHeartbeat()
      sendOfflineBeat()
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        hide()
      } else {
        resume()
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('focus', resume)
    window.addEventListener('pageshow', resume)
    window.addEventListener('pagehide', sendOfflineBeat)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('focus', resume)
      window.removeEventListener('pageshow', resume)
      window.removeEventListener('pagehide', sendOfflineBeat)
    }
  }, [startHeartbeat, stopHeartbeat, sendOfflineBeat, fetchAllInterested])

  // ---- Typing indicator (the one remaining websocket use) ----
  // Channels join lazily while a Banter view is mounted and carry ONLY
  // typing state. They rejoin fresh on every mount, so a stale socket
  // can at worst delay a "typing…" hint, never online status.
  const typingChannelsRef = useRef<Map<string, RealtimeChannel>>(new Map())
  const typingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const [typingByPool, setTypingByPool] = useState<Map<string, PresenceUser[]>>(new Map())

  useEffect(() => {
    if (!identity || interestedPools.length === 0) return
    const supabase = supabaseRef.current
    const channels = typingChannelsRef.current

    for (const poolId of interestedPools) {
      if (channels.has(poolId)) continue
      const channel = supabase.channel(`pool-typing-${poolId}`, {
        config: { presence: { key: identity.user_id } },
      })
      channel
        .on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState<PresenceUser>()
          const typing: PresenceUser[] = []
          for (const presences of Object.values(state)) {
            if (presences.length > 0) {
              const p = presences[0] as unknown as PresenceUser
              if (p.is_typing && p.user_id !== identityRef.current?.user_id) typing.push(p)
            }
          }
          setTypingByPool(prev => {
            const next = new Map(prev)
            next.set(poolId, typing)
            return next
          })
        })
        .subscribe()
      channels.set(poolId, channel)
    }

    for (const [poolId, channel] of channels) {
      if (!interestedPools.includes(poolId)) {
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
  }, [identity, interestedPoolsKey])

  const setIsTyping = useCallback((poolId: string, typing: boolean) => {
    const channel = typingChannelsRef.current.get(poolId)
    const id = identityRef.current
    if (!channel || !id) return

    const track = (isTyping: boolean) => {
      void channel.track({
        user_id: id.user_id,
        username: id.username,
        full_name: id.full_name,
        online_at: new Date().toISOString(),
        is_typing: isTyping,
        active_pool_id: activePoolIdRef.current,
      })
    }
    track(typing)

    const timers = typingTimersRef.current
    const existing = timers.get(poolId)
    if (existing) clearTimeout(existing)
    if (typing) {
      timers.set(poolId, setTimeout(() => track(false), TYPING_RESET_MS))
    }
  }, [])

  useEffect(() => {
    const timers = typingTimersRef.current
    return () => {
      for (const t of timers.values()) clearTimeout(t)
    }
  }, [])

  const value = useMemo(
    () => ({ onlineByPool, typingByPool, registerInterest, setIsTyping }),
    [onlineByPool, typingByPool, registerInterest, setIsTyping]
  )

  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>
}

/**
 * Per-pool presence view for consumers (Banter tab, online strips).
 * Registers polling interest for the pool while mounted. Same return
 * shape as the old channel-based hook: onlineUsers excludes the current
 * user; setIsTyping is curried to this pool.
 */
export function usePoolPresence(poolId: string): {
  onlineUsers: PresenceUser[]
  typingUsers: PresenceUser[]
  setIsTyping: (typing: boolean) => void
} {
  const { onlineByPool, typingByPool, registerInterest, setIsTyping } = useContext(PresenceContext)

  useEffect(() => registerInterest(poolId), [registerInterest, poolId])

  const online = onlineByPool.get(poolId) ?? EMPTY_USERS
  const typingUsers = typingByPool.get(poolId) ?? EMPTY_USERS
  const onlineUsers = useMemo(() => {
    if (typingUsers.length === 0) return online
    const typingIds = new Set(typingUsers.map(u => u.user_id))
    return online.map(u => (typingIds.has(u.user_id) ? { ...u, is_typing: true } : u))
  }, [online, typingUsers])

  const setIsTypingForPool = useCallback(
    (typing: boolean) => setIsTyping(poolId, typing),
    [setIsTyping, poolId]
  )
  return { onlineUsers, typingUsers, setIsTyping: setIsTypingForPool }
}

const EMPTY_USERS: PresenceUser[] = []
