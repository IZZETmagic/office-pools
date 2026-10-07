'use client'

// The web Activity page's cards — the web's versions of the app's (mobile/components/activity/),
// drawn from the same rows with the same words. The app's are left as they are.
//
//   ActivityRow      any history row: icon, title, body, a detail line by kind, the pool, the time
//   StoryCard        one settled matchweek in one league pool — expands to its details in place
//   MentionCard      someone @mentioned you in Banter: who, where, what they said
//   PickNeedCard     an open pick / LMS pick / table — the whole card opens where it is made
//
// The crew cards are the dashboard's own (components/crews/CrewNeedsStrip), answered the same way.

import Link from 'next/link'
import { useState, useSyncExternalStore, type ReactNode } from 'react'
import { Icon } from '@/components/ui/Icon'
import { DeadlinePill } from '@/components/crews/CrewNeedsStrip'
import type { FeedItem } from '@/lib/activity/feed'
import { readPoolName, relativeTime, resolveColorKey, resolveIcon, type ColorKey } from '@/lib/activity/look'
import type { NeedItem } from '@/lib/activity/needsYou'
import { avatarBackgroundFor, avatarIndexFor, groundInkFor } from '@/lib/design/avatarGradient'

const CHIP: Record<ColorKey, string> = {
  primary: 'bg-primary-50 text-primary-600',
  success: 'bg-success-50 text-success-600',
  warning: 'bg-warning-50 text-warning-600',
  error: 'bg-danger-50 text-danger-600',
  accent: 'bg-accent-50 text-accent-600',
}

/**
 * "5h ago" depends on now, which the server rendering this page does not share with the reader's
 * browser — so it is SUBSCRIBED: the server draws nothing, the browser fills it in after hydration
 * and keeps it current, a minute at a time.
 */
function useNow(): number | null {
  return useSyncExternalStore(subscribeMinute, currentMinute, () => null)
}
const MINUTE = 60_000
const currentMinute = () => Math.floor(Date.now() / MINUTE) * MINUTE
function subscribeMinute(notify: () => void) {
  const id = window.setInterval(notify, MINUTE / 4)
  return () => window.clearInterval(id)
}

function When({ iso }: { iso: string }) {
  const now = useNow()
  return (
    <time dateTime={iso} className="shrink-0 text-[11px] font-medium text-muted tabular-nums">
      {now === null ? '' : relativeTime(iso, now)}
    </time>
  )
}

/** New since the last visit — a dot beside the row, as in the app. */
function NewMark({ show }: { show: boolean }) {
  return (
    <span
      aria-label={show ? 'New' : undefined}
      className={`mt-3 h-2 w-2 shrink-0 rounded-full ${show ? 'bg-primary-600' : 'bg-transparent'}`}
    />
  )
}

function PoolChip({ name }: { name: string }) {
  return <span className="self-start rounded-pill bg-snow px-2 py-0.5 text-[10px] font-semibold text-muted">{name}</span>
}

/** A whole card that opens somewhere — or just the card, when it opens nothing. */
function Opens({ href, label, children, className }: { href: string | null; label?: string; children: ReactNode; className: string }) {
  if (!href) return <div className={className}>{children}</div>
  return (
    <Link href={href} aria-label={label} className={`${className} transition-colors hover:bg-surface-tertiary focus-visible:outline-2 focus-visible:outline-primary-600`}>
      {children}
    </Link>
  )
}

// ---- any history row ------------------------------------------

export function ActivityRow({ item, href }: { item: FeedItem; href: string | null }) {
  const pool = readPoolName(item)
  return (
    <Opens href={href} className="flex items-start gap-3 rounded-card bg-surface py-3.5 pr-4 pl-1">
      <NewMark show={!item.is_read} />
      <span className={`grid h-[38px] w-[38px] shrink-0 place-items-center rounded-full ${CHIP[resolveColorKey(item)]}`}>
        <Icon name={resolveIcon(item) as never} size={16} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start gap-2">
          <p className={`min-w-0 flex-1 text-sm text-ink line-clamp-2 ${item.is_read ? 'font-medium' : 'font-bold'}`}>{item.title}</p>
          <When iso={item.created_at} />
        </div>
        {item.body ? <p className="text-xs text-muted line-clamp-2">{item.body}</p> : null}
        <Detail item={item} />
        {pool ? <PoolChip name={pool} /> : null}
      </div>
    </Opens>
  )
}

/** The line under a row that only some kinds have — the numbers that make it worth reading. */
function Detail({ item }: { item: FeedItem }) {
  const m = (item.metadata ?? {}) as Record<string, unknown>
  switch (item.activity_type) {
    case 'rank_change': {
      if (typeof m.delta !== 'number') return null
      const up = m.delta > 0
      const abs = Math.abs(m.delta)
      return (
        <p className={`flex items-center gap-1.5 text-xs font-medium ${up ? 'text-success-600' : 'text-danger-600'}`}>
          <Icon name={up ? 'arrow.up' : 'arrow.down'} size={10} />
          {abs} position{abs === 1 ? '' : 's'}
          <span className="text-[11px] text-muted line-through">#{String(m.old_rank)}</span>
          <Icon name="arrow.right" size={8} className="text-muted" />
          <span className="text-[11px] font-bold text-ink">#{String(m.new_rank)}</span>
        </p>
      )
    }
    case 'points_adjusted': {
      if (typeof m.adjustment !== 'number') return null
      const up = m.adjustment > 0
      return (
        <p className="flex items-center gap-1.5 text-xs">
          <span className={`font-bold ${up ? 'text-success-600' : 'text-danger-600'}`}>{up ? '+' : ''}{m.adjustment} pts</span>
          {typeof m.reason === 'string' ? <span className="min-w-0 truncate font-medium text-muted">{m.reason}</span> : null}
        </p>
      )
    }
    case 'prediction_submitted': {
      if (!m.entry_name && m.match_count == null) return null
      return (
        <p className="flex items-center gap-1.5 text-xs">
          {typeof m.entry_name === 'string' ? <span className="font-semibold text-ink">{m.entry_name}</span> : null}
          {typeof m.match_count === 'number' ? <span className="font-medium text-muted">{m.match_count} matches</span> : null}
          <Icon name="checkmark.seal.fill" size={12} className="text-success-600" />
        </p>
      )
    }
    case 'prediction_result':
      return typeof m.outcome === 'string' ? (
        <p className="flex items-center gap-1.5">
          <Outcome outcome={m.outcome} />
          {typeof m.match_number === 'number' ? <span className="text-[11px] font-medium text-muted">Match {m.match_number}</span> : null}
        </p>
      ) : null
    case 'matchday_recap': {
      if (typeof m.points !== 'number') return null
      const tiers: Array<[number, string, string]> = [
        [Number(m.exact) || 0, 'Exact', 'bg-tier-exact/15 text-ink'],
        [Number(m.winner_gd) || 0, 'GD', 'bg-tier-winner-gd/15 text-ink'],
        [Number(m.winner) || 0, 'Winner', 'bg-tier-winner/15 text-ink'],
        [Number(m.miss) || 0, 'Miss', 'bg-mist text-muted'],
      ]
      return (
        <p className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="font-bold text-ink">+{m.points.toLocaleString('en-GB')} pts</span>
          {tiers.filter(([n]) => n > 0).map(([n, label, cls]) => (
            <span key={label} className={`rounded-pill px-2 py-0.5 text-[10px] font-bold ${cls}`}>{n} {label}</span>
          ))}
        </p>
      )
    }
    default:
      return null
  }
}

function Outcome({ outcome }: { outcome: string }) {
  const [label, cls] =
    outcome === 'exact' ? ['Exact', 'bg-tier-exact/15']
    : outcome === 'winner_gd' ? ['Winner + GD', 'bg-tier-winner-gd/15']
    : outcome === 'winner' ? ['Winner', 'bg-tier-winner/15']
    : ['Miss', 'bg-mist']
  return <span className={`rounded-pill px-2 py-0.5 text-[10px] font-bold text-ink ${cls}`}>{label}</span>
}

// ---- one settled matchweek ------------------------------------

type StoryMeta = {
  pool_name: string
  league_mode: 'pickem' | 'showdown' | 'last_man_standing' | 'table'
  tiers: { exact: number; winner_gd: number; winner: number; miss: number } | null
  rank: number | null
  entrants: number | null
  lines: Array<{ label: string; points: number }>
  more_count: number
  more_points: number
  duel: { opponent_name: string | null; my_accuracy: number | null; their_accuracy: number | null; duel_points: number } | null
  lms: { club_name: string; round_number: number; survivors_left: number; round_entrants: number } | null
}

const MODE_LABEL: Record<StoryMeta['league_mode'], string> = {
  pickem: "Pick'em",
  showdown: 'Showdown',
  last_man_standing: 'Last One Standing',
  table: 'Table',
}

const OPEN_LABEL: Record<StoryMeta['league_mode'], string> = {
  pickem: 'See your picks',
  showdown: 'See the duel',
  last_man_standing: 'See who is left',
  table: 'See your table',
}

/** The rows under "Details" — the app's own list. Empty means there is nothing to expand. */
function storyDetail(m: StoryMeta): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = []
  const plus = (n: number) => `+${n.toLocaleString('en-GB')}`
  if (m.duel) {
    if (m.duel.my_accuracy != null) rows.push({ label: 'Your accuracy', value: m.duel.my_accuracy.toLocaleString('en-GB') })
    if (m.duel.their_accuracy != null && m.duel.opponent_name) {
      rows.push({ label: `${m.duel.opponent_name}'s accuracy`, value: m.duel.their_accuracy.toLocaleString('en-GB') })
    }
    rows.push({ label: 'Duel points', value: plus(m.duel.duel_points) })
  }
  for (const l of m.lines ?? []) rows.push({ label: l.label, value: plus(l.points) })
  if (m.more_count > 0) rows.push({ label: `${m.more_count} more match${m.more_count === 1 ? '' : 'es'}`, value: plus(m.more_points) })
  if (m.lms) {
    rows.push({ label: 'Your pick', value: m.lms.club_name })
    rows.push({ label: `Still in round ${m.lms.round_number}`, value: `${m.lms.survivors_left} of ${m.lms.round_entrants}` })
  }
  if (m.rank != null && m.entrants != null) rows.push({ label: 'Standing after the week', value: `${m.rank} of ${m.entrants}` })
  return rows
}

export function StoryCard({ item, href }: { item: FeedItem; href: string | null }) {
  const [open, setOpen] = useState(false)
  const m = item.metadata as unknown as StoryMeta | null
  if (!m) return null
  const tiers = m.tiers
  const segments = tiers
    ? ([
        [tiers.exact, 'exact', 'bg-tier-exact'],
        [tiers.winner_gd, 'winner+GD', 'bg-tier-winner-gd'],
        [tiers.winner, 'winner', 'bg-tier-winner'],
        [tiers.miss, 'miss', 'bg-tier-miss'],
      ] as Array<[number, string, string]>).filter(([n]) => n > 0)
    : []
  const detail = storyDetail(m)
  const accent = item.color_key === 'success' ? 'text-success-600' : item.color_key === 'accent' ? 'text-tier-exact' : 'text-ink'

  return (
    <div className="relative flex flex-col gap-2.5 rounded-card bg-surface p-4">
      {!item.is_read ? <span aria-label="New" className="absolute top-5 left-1.5 h-1.5 w-1.5 rounded-full bg-primary-600" /> : null}
      <div className="flex items-start justify-between gap-2">
        {/* No matchweek here: the group heading above already says it. */}
        <p className="min-w-0 truncate text-[11px] font-bold tracking-[0.6px] text-muted uppercase">{m.pool_name}</p>
        <p className="shrink-0 text-[11px] font-medium text-muted">
          {MODE_LABEL[m.league_mode] ?? ''} · <When iso={item.created_at} />
        </p>
      </div>
      <p className={`text-base leading-snug font-bold ${accent}`}>{item.title}</p>
      {segments.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex h-2 gap-0.5 overflow-hidden rounded">
            {segments.map(([n, label, cls]) => <span key={label} className={cls} style={{ flex: n }} />)}
          </div>
          <div className="flex flex-wrap gap-2.5">
            {segments.map(([n, label, cls]) => (
              <span key={label} className="flex items-center gap-1 text-[11px] font-semibold text-muted">
                <span className={`h-2 w-2 rounded-sm ${cls}`} />
                {n} {label}
              </span>
            ))}
          </div>
        </div>
      ) : item.body ? (
        <p className="text-[13px] font-medium text-muted">{item.body}</p>
      ) : null}
      {open && detail.length > 0 ? (
        <dl className="flex flex-col gap-1.5 border-t border-mist pt-2.5">
          {detail.map((r, i) => (
            <div key={`${r.label}-${i}`} className="flex justify-between gap-2 text-[13px]">
              <dt className="min-w-0 truncate font-medium text-ink">{r.label}</dt>
              <dd className="font-bold text-ink tabular-nums">{r.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <div className="flex items-center justify-between">
        {detail.length > 0 ? (
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="text-xs font-bold text-primary-600 hover:underline">
            {open ? 'Hide' : 'Details'}
          </button>
        ) : <span />}
        {href ? (
          <Link href={href} className="flex items-center gap-0.5 text-xs font-bold text-primary-600 hover:underline">
            {OPEN_LABEL[m.league_mode] ?? 'Open'}
            <Icon name="chevron.right" size={11} />
          </Link>
        ) : null}
      </div>
    </div>
  )
}

// ---- a mention ------------------------------------------------

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : name.slice(0, 2)
  return letters.toUpperCase()
}

export function MentionCard({ item, href }: { item: FeedItem; href: string | null }) {
  const m = (item.metadata ?? {}) as { pool_name?: string; sender_name?: string; message_preview?: string; sender_user_id?: string }
  const sender = m.sender_name ?? 'Someone'
  // The colour the person has everywhere else: hashed from their user id.
  const idx = avatarIndexFor(m.sender_user_id ?? sender)
  return (
    <Opens
      href={href}
      label={`${sender} mentioned you in ${m.pool_name ?? 'a pool'}: ${m.message_preview ?? ''}`}
      className="relative flex gap-3 rounded-card bg-surface py-3.5 pr-4 pl-5"
    >
      {!item.is_read ? <span aria-label="New" className="absolute top-6 left-1.5 h-1.5 w-1.5 rounded-full bg-primary-600" /> : null}
      <span
        className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-full text-[13px] font-black"
        style={{ background: avatarBackgroundFor(idx), color: groundInkFor(idx) }}
        aria-hidden="true"
      >
        {initials(sender)}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-start gap-2">
          <p className={`min-w-0 flex-1 truncate text-sm text-ink ${item.is_read ? 'font-semibold' : 'font-bold'}`}>
            {sender} · {m.pool_name}
          </p>
          <When iso={item.created_at} />
        </div>
        {m.message_preview ? (
          <p className="rounded-lg rounded-tl-sm bg-mist px-2.5 py-2 text-[13px] font-medium text-ink line-clamp-3">{m.message_preview}</p>
        ) : null}
        {href ? <span className="text-xs font-bold text-primary-600">Reply in Banter</span> : null}
      </div>
    </Opens>
  )
}

// ---- an open pick ---------------------------------------------

export function PickNeedCard({ item, href }: { item: NeedItem; href: string | null }) {
  const progress = item.total > 1 ? item.made / item.total : null
  return (
    <Opens
      href={href}
      label={`${item.title}, ${item.subtitle}. ${item.cta}`}
      className="flex flex-col gap-2.5 rounded-card border-[1.5px] border-primary-600 bg-surface p-4"
    >
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="text-[15px] font-bold text-ink">{item.title}</p>
          <p className="truncate text-xs font-medium text-muted">{item.subtitle}</p>
        </div>
        {item.deadline_at !== null ? <DeadlinePill iso={item.deadline_at} /> : null}
      </div>
      {progress !== null ? (
        <div className="h-1.5 overflow-hidden rounded-full bg-mist">
          <div className="h-full bg-primary-600" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      ) : null}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted">{item.total > 1 ? `${item.made} of ${item.total} picked` : 'Not done yet'}</span>
        <span className="rounded-pill bg-primary-600 px-3 py-1.5 text-xs font-bold text-white">{item.cta}</span>
      </div>
    </Opens>
  )
}
