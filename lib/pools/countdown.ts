// =============================================================
// Pool countdowns (2026-10-06)
// =============================================================
// Ryan asked for a countdown to a pool's start. Built as the plan agreed ("The reminders that are
// missing"):
//
//   pool_countdown        every member, ONCE, as soon as the pool's first deadline is a week or
//                         less away: when it starts, and what they still have to pick. The
//                         day-before message is the existing reminder (lock_reminder,
//                         lms_pick_reminder, table_deadline) — sent only to people with something
//                         left to pick, never a second countdown.
//   pool_countdown_admin  the pool's admin, ONCE, at the same point, if two people or fewer have
//                         joined — so they can share the code while it still matters.
//
// League pools only for now: the tournament modes are dormant, and get theirs when a tournament is
// next on the calendar. "Start" is pool_first_lock_at — the first deadline the pool's members
// face, in every mode. Queued hourly by the league-notices cron, keyed to the pool and that
// deadline (so a moved start counts down again), and composed at send time: a deadline that moved
// since, a member who left, or a pool that has filled up since, skips the row.
// =============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { poolCountdownAdminTemplate, poolCountdownTemplate } from '@/lib/email/templates'
import { enqueue, type Composed, type NoticeInsert, type OutboxRow } from '@/lib/notifications/outbox'
import { untilLock } from '@/lib/crews/notify'

const DAY_MS = 24 * 3_600_000
const WEEK_MS = 7 * DAY_MS
/** "Hardly anyone": the admin plus at most one other. */
export const FEW_MEMBERS = 2
const appUrl = () => process.env.NEXT_PUBLIC_APP_URL || 'https://sportpool.io'
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)

/** Inside the countdown's window: a week or less away, and more than a day (the reminders own the last day). */
export function inCountdownWindow(msToStart: number): boolean {
  return msToStart > DAY_MS && msToStart <= WEEK_MS
}

type PoolRow = {
  pool_id: string
  pool_name: string
  pool_code: string
  admin_user_id: string | null
  league_mode: string | null
  league_season_id: string | null
}

async function firstLockAt(admin: SupabaseClient, poolId: string): Promise<string | null> {
  const { data, error } = await admin.rpc('pool_first_lock_at', { p_pool_id: poolId })
  if (error) throw new Error(`pool_first_lock_at: ${error.message}`)
  return (data as string | null) ?? null
}

/** Queue the countdowns due now. Called hourly from the league-notices cron. */
export async function queuePoolCountdowns(admin: SupabaseClient, now: number): Promise<{ countdowns: number; adminNotices: number }> {
  const { data: pools, error } = await admin
    .from('pools')
    .select('pool_id, pool_name, pool_code, admin_user_id, league_mode, league_season_id')
    .eq('status', 'open')
    .is('archived_at', null)
  if (error) throw new Error(`pools: ${error.message}`)
  const notices: NoticeInsert[] = []
  let adminNotices = 0
  for (const pool of ((pools ?? []) as PoolRow[]).filter((p) => p.league_season_id && p.league_mode)) {
    const first = await firstLockAt(admin, pool.pool_id)
    if (!first || !inCountdownWindow(Date.parse(first) - now)) continue
    const { data: members, error: mErr } = await admin.from('pool_members').select('user_id').eq('pool_id', pool.pool_id)
    if (mErr) throw new Error(`pool_members: ${mErr.message}`)
    const userIds = ((members ?? []) as Array<{ user_id: string }>).map((m) => m.user_id)
    for (const userId of userIds) {
      notices.push({
        type: 'pool_countdown',
        userId,
        poolId: pool.pool_id,
        dedupKey: `pool_countdown:${pool.pool_id}:${first}:${userId}`,
        payload: { firstLockAt: first },
        deadlineAt: first,
      })
    }
    if (pool.admin_user_id && userIds.length <= FEW_MEMBERS) {
      adminNotices++
      notices.push({
        type: 'pool_countdown_admin',
        userId: pool.admin_user_id,
        poolId: pool.pool_id,
        dedupKey: `pool_countdown_admin:${pool.pool_id}:${first}`,
        payload: { firstLockAt: first },
        deadlineAt: first,
      })
    }
  }
  const queued = notices.length > 0 ? await enqueue(admin, notices) : []
  return { countdowns: queued.length - Math.min(adminNotices, queued.length), adminNotices: Math.min(adminNotices, queued.length) }
}

// =============================================================
// What each member still has to pick — read when the countdown is sent
// =============================================================

/** A sentence about this member's own picks for the first deadline, or null when they're all set. */
export async function stillToPick(
  admin: SupabaseClient,
  pool: PoolRow,
  userId: string,
  firstLock: string,
): Promise<string | null> {
  const { data: entries, error } = await admin
    .from('pool_entries')
    .select('entry_id')
    .eq('pool_id', pool.pool_id)
    .eq('user_id', userId)
    .is('retired_at', null)
  if (error) throw new Error(`pool_entries: ${error.message}`)
  const entryIds = ((entries ?? []) as Array<{ entry_id: string }>).map((e) => e.entry_id)
  if (entryIds.length === 0) return null

  if (pool.league_mode === 'table') {
    const { data: filed, error: tErr } = await admin.from('league_table_predictions').select('entry_id').in('entry_id', entryIds)
    if (tErr) throw new Error(`league_table_predictions: ${tErr.message}`)
    const done = new Set(((filed ?? []) as Array<{ entry_id: string }>).map((r) => r.entry_id))
    return entryIds.every((e) => done.has(e)) ? null : 'Your season table is not set yet.'
  }

  // pick'em, Showdown, Last Man Standing: the matchweek the pool starts with.
  const { data: mw, error: mwErr } = await admin
    .from('league_matchweeks')
    .select('matchweek_id, matchweek_number, label')
    .eq('season_id', pool.league_season_id as string)
    .eq('lock_at', firstLock)
    .order('matchweek_number', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (mwErr) throw new Error(`league_matchweeks: ${mwErr.message}`)
  if (!mw) return null
  const m = mw as { matchweek_id: string; matchweek_number: number; label: string | null }
  const name = m.label || `Matchweek ${m.matchweek_number}`

  if (pool.league_mode === 'last_man_standing') {
    const { data: picks, error: pErr } = await admin
      .from('league_lms_picks')
      .select('entry_id, club_id')
      .in('entry_id', entryIds)
      .eq('matchweek_number', m.matchweek_number)
    if (pErr) throw new Error(`league_lms_picks: ${pErr.message}`)
    const picked = new Set(((picks ?? []) as Array<{ entry_id: string; club_id: string | null }>).filter((p) => p.club_id).map((p) => p.entry_id))
    return entryIds.every((e) => picked.has(e)) ? null : `Your club for ${name} is not picked yet.`
  }

  const { data: fixtures, error: fErr } = await admin.from('league_fixtures').select('fixture_id').eq('matchweek_id', m.matchweek_id)
  if (fErr) throw new Error(`league_fixtures: ${fErr.message}`)
  const fixtureIds = ((fixtures ?? []) as Array<{ fixture_id: string }>).map((f) => f.fixture_id)
  if (fixtureIds.length === 0) return null
  const { data: picks, error: pErr } = await admin
    .from('league_predictions')
    .select('entry_id, fixture_id')
    .in('entry_id', entryIds)
    .in('fixture_id', fixtureIds)
  if (pErr) throw new Error(`league_predictions: ${pErr.message}`)
  const byEntry = new Map<string, number>()
  for (const p of (picks ?? []) as Array<{ entry_id: string }>) byEntry.set(p.entry_id, (byEntry.get(p.entry_id) ?? 0) + 1)
  // Phrased for the entry with the most left to pick — the one that matters.
  const left = Math.max(...entryIds.map((e) => fixtureIds.length - (byEntry.get(e) ?? 0)))
  return left <= 0 ? null : `You have ${left} ${left === 1 ? 'match' : 'matches'} to pick for ${name}.`
}

// =============================================================
// The composers
// =============================================================

async function loadPools(admin: SupabaseClient, rows: OutboxRow[]) {
  const ids = [...new Set(rows.map((r) => r.pool_id).filter((p): p is string => !!p))]
  const { data, error } = await admin
    .from('pools')
    .select('pool_id, pool_name, pool_code, admin_user_id, league_mode, league_season_id, archived_at')
    .in('pool_id', ids)
  if (error) throw new Error(`pools: ${error.message}`)
  return new Map(((data ?? []) as Array<PoolRow & { archived_at: string | null }>).map((p) => [p.pool_id, p]))
}

async function namesOf(admin: SupabaseClient, userIds: string[]) {
  const { data, error } = await admin.from('users').select('user_id, full_name, username').in('user_id', userIds)
  if (error) throw new Error(`users: ${error.message}`)
  return new Map(((data ?? []) as Array<{ user_id: string; full_name: string | null; username: string | null }>)
    .map((u) => [u.user_id, u.full_name || u.username || null]))
}

export async function composePoolCountdown(admin: SupabaseClient, rows: OutboxRow[]): Promise<Map<number, Composed>> {
  const out = new Map<number, Composed>()
  const pools = await loadPools(admin, rows)
  const names = await namesOf(admin, rows.map((r) => r.user_id).filter((u): u is string => !!u))
  const now = Date.now()
  for (const row of rows) {
    const pool = row.pool_id ? pools.get(row.pool_id) : undefined
    const queuedFor = str(row.payload.firstLockAt)
    if (!pool || pool.archived_at || !row.user_id || !queuedFor) { out.set(row.outbox_id, { skip: 'not_found' }); continue }
    // The start moved since this was queued: a countdown to the old date is wrong. The new date
    // gets its own row, keyed to it.
    const first = await firstLockAt(admin, pool.pool_id)
    if (!first || Date.parse(first) !== Date.parse(queuedFor)) { out.set(row.outbox_id, { skip: 'expired' }); continue }
    const { data: member } = await admin.from('pool_members').select('member_id').eq('pool_id', pool.pool_id).eq('user_id', row.user_id).maybeSingle()
    if (!member) { out.set(row.outbox_id, { skip: 'no_longer_true' }); continue }

    const toDo = await stillToPick(admin, pool, row.user_id, first)
    const startsIn = untilLock(first, now)
    const { subject, html } = poolCountdownTemplate({
      userName: names.get(row.user_id) || 'there',
      poolName: pool.pool_name,
      startsIn,
      deadline: first,
      toDo,
      poolUrl: `${appUrl()}/pools/${pool.pool_id}?tab=predictions`,
    })
    out.set(row.outbox_id, {
      emails: [{ key: 'countdown', subject, html, tags: [{ name: 'category', value: 'pool_countdown' }] }],
      push: {
        title: `${pool.pool_name} starts ${startsIn}`,
        body: toDo ?? "You're all set — everything is picked.",
        data: { poolId: pool.pool_id, tab: 'predictions' },
      },
    })
  }
  return out
}

export async function composePoolCountdownAdmin(admin: SupabaseClient, rows: OutboxRow[]): Promise<Map<number, Composed>> {
  const out = new Map<number, Composed>()
  const pools = await loadPools(admin, rows)
  const now = Date.now()
  for (const row of rows) {
    const pool = row.pool_id ? pools.get(row.pool_id) : undefined
    const queuedFor = str(row.payload.firstLockAt)
    if (!pool || pool.archived_at || !row.user_id || !queuedFor) { out.set(row.outbox_id, { skip: 'not_found' }); continue }
    if (pool.admin_user_id !== row.user_id) { out.set(row.outbox_id, { skip: 'no_longer_true' }); continue }
    const first = await firstLockAt(admin, pool.pool_id)
    if (!first || Date.parse(first) !== Date.parse(queuedFor)) { out.set(row.outbox_id, { skip: 'expired' }); continue }
    const { data: members, error } = await admin.from('pool_members').select('user_id').eq('pool_id', pool.pool_id)
    if (error) throw new Error(`pool_members: ${error.message}`)
    const others = ((members ?? []) as Array<{ user_id: string }>).map((m) => m.user_id).filter((u) => u !== row.user_id)
    // People joined since it was queued: "hardly anyone" is no longer true.
    if (others.length + 1 > FEW_MEMBERS) { out.set(row.outbox_id, { skip: 'no_longer_true' }); continue }
    const names = await namesOf(admin, [row.user_id, ...others])
    const startsIn = untilLock(first, now)
    const { subject, html } = poolCountdownAdminTemplate({
      userName: names.get(row.user_id) || 'there',
      poolName: pool.pool_name,
      startsIn,
      others: others.map((u) => names.get(u) || 'one other person'),
      poolCode: pool.pool_code,
      poolUrl: `${appUrl()}/pools/${pool.pool_id}`,
    })
    out.set(row.outbox_id, {
      emails: [{ key: 'countdown-admin', subject, html, tags: [{ name: 'category', value: 'pool_countdown' }] }],
      push: {
        title: `${pool.pool_name} starts ${startsIn}`,
        body: others.length === 0 ? `It's just you so far — share the code ${pool.pool_code}.` : `Only ${others.length + 1} of you so far — share the code ${pool.pool_code}.`,
        data: { poolId: pool.pool_id },
      },
    })
  }
  return out
}
