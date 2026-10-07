'use client'

// The web Activity page — the web's version of the app's Activity tab (Ryan, 2026-10-07: "make an
// activity page for the web like the react native app"; the app's tab is left as it is).
//
//   Needs you      open decisions only, never filtered, gone the moment they're done
//   [chips]        All · Results · Rank · Mentions — sticky, as in the app
//   Today …        the history in day groups (matchweek stories by matchweek), newest first,
//                  paged as the member scrolls, ending in "That's everything since you joined"
//
// The same route as the app, so the same rows; opening the page marks them seen for both.

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppHeader } from '@/components/ui/AppHeader'
import { Icon } from '@/components/ui/Icon'
import { useToast } from '@/components/ui/Toast'
import { CrewNeedCard } from '@/components/crews/CrewNeedsStrip'
import { SaveCrewModal } from '@/components/crews/SaveCrewModal'
import { FILTER_EMPTY, FILTERS, feedView, groupByDay, matchesFilter, shouldFillMore, unreadMentions, webHref, type FeedFilter, type FeedItem } from '@/lib/activity/feed'
import type { NeedAction, NeedItem } from '@/lib/activity/needsYou'
import { crewActionPlan } from '@/lib/crews/needActions'
import { ActivityRow, MentionCard, PickNeedCard, StoryCard } from './cards'
import { useActivityFeed } from './useActivityFeed'

const isCrewNeed = (n: NeedItem) => n.kind === 'crew_seat' || n.kind === 'crew_invite' || n.kind === 'crew_save'

export function ActivityPage({ userId, isSuperAdmin }: { userId: string; isSuperAdmin: boolean }) {
  const router = useRouter()
  const { showToast } = useToast()
  const feed = useActivityFeed(userId)
  const { items, needs, seenAt, nextBefore, loading, error, loadingMore, loadMoreError, loadMore, refresh, settleNeeds, restoreNeeds } = feed
  const [filter, setFilter] = useState<FeedFilter>('all')
  const [busy, setBusy] = useState<string | null>(null)
  const [saving, setSaving] = useState<{ need: NeedItem; poolId: string; suggestedName: string; people: number } | null>(null)

  const filtered = useMemo(() => items.filter((i) => matchesFilter(i, filter)), [items, filter])
  const groups = useMemo(() => groupByDay(filtered), [filtered])
  const mentionsNew = useMemo(() => unreadMentions(items, seenAt), [items, seenAt])

  // A list with too little on it — any chip, All included — pulls older pages until it has enough,
  // the history ends, or it has tried FILL_PAGES times. ⚠ All too: see `shouldFillMore`.
  const fillPagesRef = useRef(0)
  useEffect(() => {
    fillPagesRef.current = 0
  }, [filter])
  useEffect(() => {
    if (!shouldFillMore({ rows: filtered.length, nextBefore, loadingMore, loadMoreError, pagesTried: fillPagesRef.current })) return
    fillPagesRef.current += 1
    void loadMore()
  }, [filter, filtered.length, nextBefore, loadingMore, loadMoreError, loadMore])

  // The next page loads as the bottom comes into view.
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !nextBefore || loadMoreError) return
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) void loadMore()
    }, { rootMargin: '600px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [nextBefore, loadMoreError, loadMore, items.length])

  /**
   * A crew card's button. The card leaves the moment it is pressed (Ryan, 2026-10-02); a refusal
   * puts it back with the server's reason. "Save as crew" waits: it opens the dialog, and the card
   * leaves when the crew is actually saved.
   */
  const onCrewAction = useCallback(
    async (item: NeedItem, action: NeedAction) => {
      if (busy) return
      const plan = crewActionPlan(item, action.id)
      if (plan.kind === 'none') return
      if (plan.kind === 'open-save') {
        setSaving({ need: item, poolId: item.pool_id, suggestedName: item.crew?.name ?? item.pool_name, people: item.crew?.people ?? 0 })
        return
      }
      setBusy(`${item.id}:${action.id}`)
      const removed = settleNeeds((n) => n.id === item.id)
      const putBack = (message: string) => {
        restoreNeeds(removed)
        showToast(message, 'error')
      }
      try {
        const res = await fetch(plan.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(plan.body) })
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: unknown }
          putBack(typeof data.error === 'string' ? data.error : 'That didn’t work. Please try again.')
          return
        }
        if (plan.then === 'refresh') void refresh()
        else router.push(plan.then.goTo)
      } catch {
        putBack('That didn’t work. Please try again.')
      } finally {
        setBusy(null)
      }
    },
    [busy, settleNeeds, restoreNeeds, showToast, refresh, router],
  )

  // ⚠ Not "no rows → empty": page one can be empty while older pages are not (see feedView).
  const view = feedView({ loading, error, rows: items.length, needs: needs.length, nextBefore })
  const subtitle = needs.length > 0
    ? `${needs.length} thing${needs.length === 1 ? '' : 's'} need${needs.length === 1 ? 's' : ''} you`
    : 'Don’t miss a beat'

  return (
    <div className="min-h-screen bg-surface-secondary">
      {/* Not sticky here: the chips are what stays in reach, as in the app. */}
      <AppHeader isSuperAdmin={isSuperAdmin} sticky={false} />
      <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
        <header className="mb-4 flex flex-col gap-1">
          <h1 className="text-2xl font-black text-ink">
            Your <span className="text-primary-600">Feed</span>
          </h1>
          <p className="text-sm font-medium text-muted">{subtitle}</p>
        </header>

        {view === 'loading' ? (
          <Loading />
        ) : view === 'problem' ? (
          <Problem message={error ?? 'Something went wrong.'} onRetry={() => void refresh()} />
        ) : view === 'empty' ? (
          <Empty />
        ) : (
          <>
            {needs.length > 0 ? (
              <section aria-labelledby="needs-you" className="mb-5 flex flex-col gap-2.5">
                <GroupHeading id="needs-you" text={`Needs you · ${needs.length}`} />
                {needs.map((n) =>
                  isCrewNeed(n) ? (
                    <CrewNeedCard key={n.id} item={n} busy={busy} onAction={onCrewAction} />
                  ) : (
                    <PickNeedCard key={n.id} item={n} href={webHref(n.link)} />
                  ),
                )}
              </section>
            ) : null}

            <nav aria-label="Filter your feed" className="sticky top-0 z-10 -mx-4 mb-1 flex gap-1.5 overflow-x-auto bg-surface-secondary px-4 py-2 sm:-mx-6 sm:px-6">
              {FILTERS.map((f) => {
                const active = f.key === filter
                const label = f.key === 'mentions' && mentionsNew > 0 ? `${f.label} · ${mentionsNew}` : f.label
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setFilter(f.key)}
                    aria-pressed={active}
                    className={`shrink-0 rounded-pill px-3.5 py-1.5 text-xs font-bold transition-colors ${
                      active ? 'bg-ink text-snow' : 'bg-surface text-muted hover:text-ink'
                    }`}
                  >
                    {label}
                  </button>
                )
              })}
            </nav>

            {groups.length === 0 && nextBefore === null ? (
              <p className="px-4 py-10 text-center text-sm font-medium text-muted">{FILTER_EMPTY[filter]}</p>
            ) : (
              groups.map((g) => (
                <section key={g.key} aria-label={g.label} className="flex flex-col gap-2.5 pb-1">
                  <GroupHeading text={g.label} />
                  {g.items.map((it) => <HistoryRow key={it.activity_id} item={it} />)}
                </section>
              ))
            )}

            <div ref={sentinelRef} />
            <Footer
              loadingMore={loadingMore}
              error={loadMoreError}
              atEnd={nextBefore === null && items.length > 0}
              onRetry={() => void loadMore()}
            />
          </>
        )}
      </main>

      <SaveCrewModal
        key={saving?.poolId ?? 'closed'}
        target={saving ? { poolId: saving.poolId, suggestedName: saving.suggestedName, people: saving.people } : null}
        onClose={() => setSaving(null)}
        onSaved={(crewId) => {
          const need = saving?.need
          setSaving(null)
          if (need) settleNeeds((n) => n.id === need.id)
          showToast('Crew saved.', 'success')
          router.push(`/crews/${encodeURIComponent(crewId)}`)
        }}
      />
    </div>
  )
}

function HistoryRow({ item }: { item: FeedItem }) {
  const href = webHref(item.link)
  if (item.activity_type === 'mention') return <MentionCard item={item} href={href} />
  if (item.activity_type === 'matchweek_story') return <StoryCard item={item} href={href} />
  return <ActivityRow item={item} href={href} />
}

/**
 * A group heading. "Matchweek 5 · Sun 20 Sep" splits into a bold heading and a quieter date, so
 * the matchweek reads first; a plain day ("Friday 25 Sep") is just the heading.
 */
function GroupHeading({ text, id }: { text: string; id?: string }) {
  const [head, ...rest] = text.split(' · ')
  const tail = rest.join(' · ')
  return (
    <h2 id={id} className="mt-4 ml-1 flex items-baseline gap-2">
      <span className="text-xl font-black text-ink">{head}</span>
      {tail ? <span className="text-sm font-semibold text-muted">{tail}</span> : null}
    </h2>
  )
}

/** The bottom: a spinner while the next page loads, a retry if it failed, and an end once it's all in. */
function Footer({ loadingMore, error, atEnd, onRetry }: { loadingMore: boolean; error: string | null; atEnd: boolean; onRetry: () => void }) {
  if (loadingMore) return <p className="py-6 text-center text-sm font-medium text-muted" role="status">Loading older activity…</p>
  if (error) {
    return (
      <p className="py-6 text-center text-sm font-semibold text-muted">
        Couldn’t load more ·{' '}
        <button type="button" onClick={onRetry} className="font-bold text-primary-600 hover:underline">Try again</button>
      </p>
    )
  }
  // The end marker is the point of the disclosure gate: the feed is a finite record, not a stream.
  if (atEnd) return <p className="py-6 text-center text-sm font-medium text-muted">That’s everything since you joined</p>
  return null
}

function Loading() {
  return (
    <div className="flex flex-col gap-2.5" aria-busy="true" aria-label="Loading your feed">
      {[0, 1, 2, 3].map((i) => <div key={i} className="h-20 animate-pulse rounded-card bg-surface" />)}
    </div>
  )
}

function Empty() {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <Icon name="bell.slash" size={40} className="text-silver" />
      <p className="text-lg font-bold text-ink">No activity yet</p>
      <p className="max-w-sm text-sm text-muted">Your feed will light up as you play: picks to make, results, rank moves and mentions.</p>
    </div>
  )
}

function Problem({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <Icon name="exclamationmark.triangle" size={40} className="text-silver" />
      <p className="text-lg font-bold text-ink">Couldn’t load your feed</p>
      <p className="max-w-sm text-sm text-muted">{message}</p>
      <button type="button" onClick={onRetry} className="rounded-pill bg-primary-600 px-4 py-2 text-sm font-bold text-white hover:bg-primary-700">
        Try again
      </button>
    </div>
  )
}
