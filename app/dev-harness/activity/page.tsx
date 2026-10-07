'use client'

// Dev harness: the web Activity page (app/activity) with a sample feed, so it can be seen without
// signing in. The REAL ActivityPage renders; only its two calls are answered here — the feed route
// (two pages, so paging and the end marker show) and "seen". Every other request goes out as usual.
// Production never serves /dev-harness (see ./layout.tsx). Sample people and pools only.

import { useState } from 'react'
import { ActivityPage } from '@/app/activity/ActivityPage'
import type { FeedItem, FeedPage } from '@/lib/activity/feed'
import type { NeedItem } from '@/lib/activity/needsYou'

const now = Date.now()
const ago = (h: number) => new Date(now - h * 3_600_000).toISOString()
const ahead = (h: number) => new Date(now + h * 3_600_000).toISOString()
const SEEN = ago(30)

const row = (o: Partial<FeedItem> & Pick<FeedItem, 'activity_id' | 'activity_type' | 'title' | 'created_at'>): FeedItem => ({
  pool_id: 'p-pickem',
  body: null,
  icon: '',
  color_key: 'primary',
  metadata: null,
  is_read: o.created_at <= SEEN,
  link: { pathname: '/pool/[id]', params: { id: o.pool_id ?? 'p-pickem' } },
  ...o,
})

const NEEDS: NeedItem[] = [
  {
    id: 'need-pick-1', kind: 'pick', pool_id: 'p-pickem', pool_name: "Matchweek Pick'em", entry_id: 'e1',
    title: 'Pick Matchweek 7', subtitle: "Matchweek Pick'em · Pick'em", deadline_at: ahead(5), made: 3, total: 10, cta: 'Finish',
    link: { pathname: '/pool/[id]/pickem/[entryId]', params: { id: 'p-pickem', entryId: 'e1', mw: '7' } },
  },
  {
    id: 'need-lms-1', kind: 'lms', pool_id: 'p-lms', pool_name: 'Last Man Standing', entry_id: 'e2',
    title: 'Pick a club for Matchweek 7', subtitle: "Last Man Standing · you're still in", deadline_at: ahead(52), made: 0, total: 1, cta: 'Pick a club',
    link: { pathname: '/pool/[id]/survivor/[entryId]', params: { id: 'p-lms', entryId: 'e2' } },
  },
  {
    id: 'need-crew-invite-1', kind: 'crew_invite', pool_id: 'p-duels', pool_name: 'Showdown Duels', entry_id: '',
    title: 'Dave Okafor invited you to Office Five', subtitle: '5 people · they play Showdown Duels together', deadline_at: null,
    made: 0, total: 1, cta: '', link: null,
    actions: [{ id: 'decline', label: 'Not now', style: 'secondary' }, { id: 'join', label: 'Join', style: 'primary' }],
    crew: { crew_id: 'c1', name: 'Office Five', invite_id: 'inv1', people: 5 },
  },
]

const PAGE_ONE: FeedPage = {
  needs_you: NEEDS,
  seen_at: SEEN,
  next_before: ago(24 * 6),
  items: [
    row({
      activity_id: 'mention-1', activity_type: 'mention', title: 'Mia Lowe mentioned you', created_at: ago(2), color_key: 'primary',
      metadata: { pool_name: "Matchweek Pick'em", sender_name: 'Mia Lowe', sender_user_id: 'u-mia', message_preview: '@sam did you see the Villa score? That pick looks good now.' },
      link: { pathname: '/pool/[id]', params: { id: 'p-pickem', banter: 'open' } },
    }),
    row({
      activity_id: 'rank-1', activity_type: 'rank_change', title: 'Moved up to 3rd', body: 'Overtook Leo in Showdown Duels', created_at: ago(5),
      pool_id: 'p-duels', metadata: { pool_name: 'Showdown Duels', old_rank: 5, new_rank: 3, delta: 2 },
    }),
    row({
      activity_id: 'story-pk-6', activity_type: 'matchweek_story', title: '14 pts, up 2 to 3rd', created_at: ago(28), color_key: 'success',
      metadata: {
        pool_name: "Matchweek Pick'em", league_mode: 'pickem', matchweek_number: 6, entry_id: 'e1', entry_name: 'Sam', multi_entry: false,
        points: 14, tiers: { exact: 2, winner_gd: 1, winner: 3, miss: 4 }, rank: 3, rank_before: 5, entrants: 10,
        lines: [{ label: 'Arsenal 2–1 Chelsea', points: 5 }, { label: 'Spurs 0–0 Villa', points: 5 }], more_count: 4, more_points: 4,
        duel: null, lms: null,
      },
      link: { pathname: '/pool/[id]/pickem/[entryId]', params: { id: 'p-pickem', entryId: 'e1', mw: '6' } },
    }),
    row({
      activity_id: 'story-sd-6', activity_type: 'matchweek_story', title: 'You won your duel against Leo', created_at: ago(29), color_key: 'accent',
      pool_id: 'p-duels',
      metadata: {
        pool_name: 'Showdown Duels', league_mode: 'showdown', matchweek_number: 6, entry_id: 'e3', entry_name: 'Sam', multi_entry: false,
        points: 520, tiers: null, rank: 2, rank_before: 2, entrants: 10, lines: [], more_count: 0, more_points: 0,
        duel: { outcome: 'won', opponent_name: 'Leo Grant', my_accuracy: 20, their_accuracy: 14, duel_points: 500 }, lms: null,
      },
      body: 'Duel won · 2nd of 10',
      link: { pathname: '/pool/[id]/duel/[matchweek]', params: { id: 'p-duels', matchweek: '6' } },
    }),
    row({
      activity_id: 'story-lms-6', activity_type: 'matchweek_story', title: 'You survived with Brentford', created_at: ago(29.5), color_key: 'success',
      pool_id: 'p-lms',
      metadata: {
        pool_name: 'Last Man Standing', league_mode: 'last_man_standing', matchweek_number: 6, entry_id: 'e2', entry_name: 'Sam', multi_entry: false,
        points: null, tiers: null, rank: null, rank_before: null, entrants: null, lines: [], more_count: 0, more_points: 0, duel: null,
        lms: { result: 'survived', club_name: 'Brentford', round_number: 6, survivors_left: 6, round_entrants: 9, won_round: false },
      },
      body: '6 of 9 still in',
      link: { pathname: '/pool/[id]/survivor/[entryId]', params: { id: 'p-lms', entryId: 'e2' } },
    }),
    row({
      activity_id: 'adj-1', activity_type: 'points_adjusted', title: 'Your points were adjusted', created_at: ago(50), pool_id: 'p-office',
      color_key: 'success', metadata: { pool_name: 'Bermuda Office', adjustment: 3, reason: 'Late-fixture correction' },
    }),
    row({
      activity_id: 'joined-1', activity_type: 'pool_joined', title: 'Joined Showdown Duels', created_at: ago(80), pool_id: 'p-duels',
      metadata: { pool_name: 'Showdown Duels' },
    }),
  ],
}

const PAGE_TWO: FeedPage = {
  next_before: null,
  items: [
    row({
      activity_id: 'removed-1', activity_type: 'pool_removed', title: 'Removed from Friday Five-a-side', created_at: ago(24 * 9),
      pool_id: null, metadata: { pool_name: 'Friday Five-a-side' }, link: undefined,
    }),
    row({
      activity_id: 'submitted-1', activity_type: 'prediction_submitted', title: 'Predictions submitted', created_at: ago(24 * 12),
      pool_id: 'p-office', color_key: 'success', metadata: { pool_name: 'Bermuda Office', entry_name: 'Sam', match_count: 10 },
    }),
  ],
}

/**
 * `?first=empty`: page one holds nothing while older pages do — a member who sat out the latest
 * matchweeks. The page must load them rather than say "No activity yet" (lib/activity/feed.ts,
 * `feedView`).
 */
const EMPTY_FIRST: FeedPage = { needs_you: [], seen_at: SEEN, next_before: ago(1), items: [] }

function answer(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

/** Answer the feed and seen calls with the sample; pass everything else through. Installed once, before the page mounts. */
function installSampleFeed() {
  if (typeof window === 'undefined' || (window as unknown as { __sampleFeed?: boolean }).__sampleFeed) return
  ;(window as unknown as { __sampleFeed?: boolean }).__sampleFeed = true
  const real = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url.includes('/activity/seen')) return answer({ seen_at: new Date().toISOString() })
    if (url.includes('/api/users/') && url.includes('/activity')) {
      await new Promise((r) => setTimeout(r, 400))
      const before = new URL(url, window.location.origin).searchParams.get('before')
      if (new URLSearchParams(window.location.search).get('first') === 'empty') {
        if (!before) return answer(EMPTY_FIRST)
        if (before === EMPTY_FIRST.next_before) return answer({ ...PAGE_ONE, needs_you: [] })
      }
      return answer(before ? PAGE_TWO : PAGE_ONE)
    }
    return real(input, init)
  }
}

export default function ActivityHarness() {
  useState(installSampleFeed)
  return <ActivityPage userId="sample-member" isSuperAdmin={false} />
}
