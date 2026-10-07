'use client'

// The web Activity page's data — the web's counterpart of the app's useActivity (which is left as
// it is). It reads the SAME route the app does, with the same flags: ?v=2 for Needs you, the
// matchweek stories, links and paging; crews=1 for the crew cards the web can answer too.
//
// What it keeps from the app, deliberately:
//   * a refresh brings page one again but never collapses the pages already scrolled into;
//   * a Needs-you card leaves the moment it is done (Ryan, 2026-10-02) — settle/restore, with the
//     guard against a fetch that started before the click bringing it back;
//   * "seen" is the member's ONE timestamp, shared with the app: reading here marks it read there.
// What it leaves out: the XP rows the app builds on the phone (World Cup only, dormant).

import { useCallback, useEffect, useRef, useState } from 'react'
import { appendUnique, refreshPages, type FeedItem, type FeedPage } from '@/lib/activity/feed'
import { applyFetched, restore, settle, type Settled } from '@/lib/activity/needsState'
import type { NeedItem } from '@/lib/activity/needsYou'

/** A refresh within this long of the last one reuses it — the route costs ~1.5s on a busy account. */
export const REFRESH_AFTER_MS = 30_000

async function getPage(userId: string, before?: string | null): Promise<FeedPage> {
  const cursor = before ? `&before=${encodeURIComponent(before)}` : ''
  const res = await fetch(`/api/users/${encodeURIComponent(userId)}/activity?v=2&crews=1${cursor}`, { cache: 'no-store' })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `Couldn't load your activity (HTTP ${res.status})`)
  }
  return (await res.json()) as FeedPage
}

export function useActivityFeed(userId: string) {
  const [items, setItems] = useState<FeedItem[]>([])
  const [needs, setNeeds] = useState<NeedItem[]>([])
  const [seenAt, setSeenAt] = useState<string | null>(null)
  /** undefined: not fetched yet · null: the whole history is in · string: the next older page. */
  const [nextBefore, setNextBefore] = useState<string | null | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null)

  const itemsRef = useRef<FeedItem[]>([])
  itemsRef.current = items
  const needsRef = useRef<NeedItem[]>([])
  needsRef.current = needs
  const nextBeforeRef = useRef<string | null | undefined>(undefined)
  nextBeforeRef.current = nextBefore
  const settledRef = useRef<Settled>(new Map())
  const loadingMoreRef = useRef(false)
  const lastLoadRef = useRef(0)

  const load = useCallback(async () => {
    const startedAt = Date.now()
    lastLoadRef.current = startedAt
    setError(null)
    try {
      const page = await getPage(userId)
      const { items: merged, keptOlder } = refreshPages(itemsRef.current, page)
      setItems(merged)
      setNextBefore(keptOlder ? nextBeforeRef.current : page.next_before ?? null)
      setLoadMoreError(null)
      const applied = applyFetched(page.needs_you ?? [], settledRef.current, startedAt)
      settledRef.current = applied.settled
      setNeeds(applied.needs)
      // Never move the local stamp backwards: a fetch that started before markSeen landed would
      // otherwise bring the dot back.
      setSeenAt((prev) => (prev && page.seen_at && prev > page.seen_at ? prev : page.seen_at ?? null))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn\'t load your activity')
    } finally {
      setLoading(false)
    }
  }, [userId])

  /** The member is looking at the page: the dot clears now; the rows keep their marks until the next fetch. */
  const markSeen = useCallback(async () => {
    setSeenAt(new Date().toISOString())
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(userId)}/activity/seen`, { method: 'POST' })
      if (res.ok) {
        const body = (await res.json()) as { seen_at?: string }
        if (body.seen_at) setSeenAt(body.seen_at)
      }
    } catch {
      /* the dot comes back on the next visit — nothing else depends on this */
    }
  }, [userId])

  /** Open the page: fetch, THEN mark seen — so what is new on this visit keeps its mark while read. */
  useEffect(() => {
    let cancelled = false
    void (async () => {
      await load()
      if (!cancelled) await markSeen()
    })()
    return () => {
      cancelled = true
    }
  }, [load, markSeen])

  /** Coming back to the tab: refresh if it has gone stale, and mark seen again. */
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - lastLoadRef.current < REFRESH_AFTER_MS) return
      void load().then(markSeen)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [load, markSeen])

  const loadMore = useCallback(async () => {
    const cursor = nextBeforeRef.current
    if (!cursor || loadingMoreRef.current) return
    loadingMoreRef.current = true
    setLoadingMore(true)
    setLoadMoreError(null)
    try {
      const page = await getPage(userId, cursor)
      setItems((prev) => appendUnique(prev, page.items))
      setNextBefore(page.next_before ?? null)
    } catch (err) {
      setLoadMoreError(err instanceof Error ? err.message : 'Couldn\'t load more')
    } finally {
      loadingMoreRef.current = false
      setLoadingMore(false)
    }
  }, [userId])

  /** A Needs-you card is done — out NOW. Returns what left, for restoreNeeds if the action fails. */
  const settleNeeds = useCallback((match: (n: NeedItem) => boolean): NeedItem[] => {
    const r = settle(needsRef.current, match, settledRef.current, Date.now())
    if (r.removed.length === 0) return r.removed
    settledRef.current = r.settled
    needsRef.current = r.needs
    setNeeds(r.needs)
    return r.removed
  }, [])

  /** The action behind a settled card failed — back in its place. */
  const restoreNeeds = useCallback((back: NeedItem[]) => {
    const r = restore(needsRef.current, back, settledRef.current)
    settledRef.current = r.settled
    needsRef.current = r.needs
    setNeeds(r.needs)
  }, [])

  return {
    items,
    needs,
    seenAt,
    nextBefore,
    loading,
    error,
    loadingMore,
    loadMoreError,
    refresh: load,
    loadMore,
    settleNeeds,
    restoreNeeds,
  }
}
