// =============================================================
// Last Man Standing notices, and the matchweek's last call (2026-10-06)
// =============================================================
// Ryan, 2026-10-06, "Yes to both": reminders AT MOST TWICE — a day before the lock, then once in
// its last two hours, only to members who have not picked — and the Last Man Standing ones first.
//
// ⚠ WHY LMS FIRST. league_lms_settle judges an entry with no pick as not surviving: a missed pick
// knocks you out. Until now nothing told an LMS player to pick — the matchweek notices are
// allow-listed to pick'em and Showdown (migration 108), because they read the fixture picks LMS
// does not have. On 6 Oct, 9 of the 10 players still in the main LMS pool had no pick for a
// matchweek locking four days later.
//
// QUEUED, NOT SENT. queueLeagueReminders runs from the league-notices cron (hourly) and puts rows
// into notification_outbox, which sends them. Each row is keyed to the person, the matchweek and
// the window, so the hourly re-run queues nothing twice. ONE notice per person per tick — the most
// urgent that applies — so a player first seen inside the last two hours gets the last call alone,
// not three messages at once.
//
//   lms_pick_open      the matchweek is open and more than a day from locking
//   lms_pick_reminder  a day before the lock ('day'), and in its last two hours ('last')
//   lock_reminder      pick'em and Showdown: the LAST CALL, in the last two hours. Its day-before
//                      reminder is still the league outbox's (lib/league/notify.ts) until N3's
//                      cut-over, so between them a member hears at most twice.
//
// Composed at SEND time from the same plan: a pick made since queueing, an elimination, or the
// matchweek moving on, skips the row.
// =============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { lmsPickOpenTemplate, lmsPickReminderTemplate } from '@/lib/email/templates'
import { enqueue, type Composed, type NoticeInsert, type OutboxRow } from '@/lib/notifications/outbox'
import { leagueDedupKey, planLockReminder } from './notify'

const DAY_MS = 24 * 3_600_000
const LAST_CALL_MS = 2 * 3_600_000
const appUrl = () => process.env.NEXT_PUBLIC_APP_URL || 'https://sportpool.io'

export type ReminderWindow = 'open' | 'day' | 'last'

/** The one notice due now, from the time left to the lock — the most urgent that applies. */
export function windowFor(msToLock: number): ReminderWindow | null {
  if (msToLock <= 0) return null
  if (msToLock <= LAST_CALL_MS) return 'last'
  if (msToLock <= DAY_MS) return 'day'
  return 'open'
}

type OpenMatchweek = { matchweek_id: string; matchweek_number: number; label: string | null; lock_at: string | null }

/** Each season's open matchweek — the one that accepts picks (league_open_matchweek). */
async function openMatchweeks(admin: SupabaseClient, seasonIds: string[]): Promise<Map<string, OpenMatchweek>> {
  const out = new Map<string, OpenMatchweek>()
  for (const seasonId of seasonIds) {
    const { data: mwId, error } = await admin.rpc('league_open_matchweek', { p_season_id: seasonId })
    if (error) throw new Error(`league_open_matchweek: ${error.message}`)
    if (!mwId) continue
    const { data: mw, error: mwErr } = await admin
      .from('league_matchweeks')
      .select('matchweek_id, matchweek_number, label, lock_at')
      .eq('matchweek_id', mwId as string)
      .single()
    if (mwErr) throw new Error(`league_matchweeks: ${mwErr.message}`)
    if (mw) out.set(seasonId, mw as OpenMatchweek)
  }
  return out
}

const matchweekName = (mw: OpenMatchweek) => mw.label || `Matchweek ${mw.matchweek_number}`

// =============================================================
// Last Man Standing — who is still in and has not picked
// =============================================================

export type LmsPoolPlan = {
  poolId: string
  poolName: string
  matchweek: OpenMatchweek
  roundId: string
  /** Per member: their entries still in the round with no pick for the open matchweek. */
  unpicked: Map<string, Array<{ entryId: string; entryName: string }>>
  /** Per entry: the clubs it has already used this round — they cannot be picked again. */
  usedClubs: Map<string, string[]>
}

/** The plan for every running LMS pool given — or all of them. Read fresh each time it is asked. */
export async function planLms(admin: SupabaseClient, poolIds?: string[]): Promise<Map<string, LmsPoolPlan>> {
  let poolQuery = admin
    .from('pools')
    .select('pool_id, pool_name, league_season_id')
    .eq('league_mode', 'last_man_standing')
    .eq('status', 'open')
    .is('archived_at', null)
  if (poolIds) poolQuery = poolQuery.in('pool_id', poolIds)
  const { data: pools, error } = await poolQuery
  if (error) throw new Error(`pools: ${error.message}`)
  const out = new Map<string, LmsPoolPlan>()
  const poolRows = ((pools ?? []) as Array<{ pool_id: string; pool_name: string; league_season_id: string | null }>)
    .filter((p): p is { pool_id: string; pool_name: string; league_season_id: string } => p.league_season_id !== null)
  if (poolRows.length === 0) return out

  const open = await openMatchweeks(admin, [...new Set(poolRows.map((p) => p.league_season_id))])

  // The round in play: the newest one still running that has reached the open matchweek.
  const { data: rounds, error: roundErr } = await admin
    .from('league_lms_rounds')
    .select('round_id, pool_id, round_number, first_matchweek, last_matchweek')
    .in('pool_id', poolRows.map((p) => p.pool_id))
    .is('last_matchweek', null)
  if (roundErr) throw new Error(`league_lms_rounds: ${roundErr.message}`)

  for (const pool of poolRows) {
    const mw = open.get(pool.league_season_id)
    if (!mw) continue
    const round = ((rounds ?? []) as Array<{ round_id: string; pool_id: string; round_number: number; first_matchweek: number }>)
      .filter((r) => r.pool_id === pool.pool_id && r.first_matchweek <= mw.matchweek_number)
      .sort((a, b) => b.round_number - a.round_number)[0]
    if (!round) continue

    const [{ data: survivors, error: sErr }, { data: picks, error: pErr }] = await Promise.all([
      admin.from('league_lms_survivors').select('entry_id').eq('round_id', round.round_id).is('eliminated_matchweek', null),
      admin.from('league_lms_picks').select('entry_id, matchweek_number, club_id').eq('round_id', round.round_id),
    ])
    if (sErr) throw new Error(`league_lms_survivors: ${sErr.message}`)
    if (pErr) throw new Error(`league_lms_picks: ${pErr.message}`)

    const survivorIds = ((survivors ?? []) as Array<{ entry_id: string }>).map((s) => s.entry_id)
    if (survivorIds.length === 0) continue
    const pickRows = (picks ?? []) as Array<{ entry_id: string; matchweek_number: number; club_id: string | null }>
    const pickedNow = new Set(pickRows.filter((k) => k.matchweek_number === mw.matchweek_number && k.club_id).map((k) => k.entry_id))

    // A retired entry stopped competing — not reminded, as every league notice treats it (056/057).
    const { data: entries, error: eErr } = await admin
      .from('pool_entries')
      .select('entry_id, entry_name, member_id')
      .in('entry_id', survivorIds)
      .is('retired_at', null)
    if (eErr) throw new Error(`pool_entries: ${eErr.message}`)
    const entryRows = (entries ?? []) as Array<{ entry_id: string; entry_name: string; member_id: string }>
    const { data: members, error: mErr } = entryRows.length
      ? await admin.from('pool_members').select('member_id, user_id').in('member_id', [...new Set(entryRows.map((e) => e.member_id))])
      : { data: [] as Array<{ member_id: string; user_id: string }>, error: null }
    if (mErr) throw new Error(`pool_members: ${mErr.message}`)
    const userOf = new Map(((members ?? []) as Array<{ member_id: string; user_id: string }>).map((m) => [m.member_id, m.user_id]))

    const unpicked = new Map<string, Array<{ entryId: string; entryName: string }>>()
    for (const e of entryRows) {
      if (pickedNow.has(e.entry_id)) continue
      const userId = userOf.get(e.member_id)
      if (!userId) continue
      unpicked.set(userId, [...(unpicked.get(userId) ?? []), { entryId: e.entry_id, entryName: e.entry_name }])
    }

    const usedClubIds = [...new Set(pickRows.filter((k) => k.club_id && k.matchweek_number < mw.matchweek_number).map((k) => k.club_id as string))]
    const { data: clubs, error: cErr } = usedClubIds.length
      ? await admin.from('league_clubs').select('club_id, name').in('club_id', usedClubIds)
      : { data: [] as Array<{ club_id: string; name: string }>, error: null }
    if (cErr) throw new Error(`league_clubs: ${cErr.message}`)
    const clubName = new Map(((clubs ?? []) as Array<{ club_id: string; name: string }>).map((c) => [c.club_id, c.name]))
    const usedClubs = new Map<string, string[]>()
    for (const k of pickRows) {
      if (!k.club_id || k.matchweek_number >= mw.matchweek_number) continue
      usedClubs.set(k.entry_id, [...(usedClubs.get(k.entry_id) ?? []), clubName.get(k.club_id) ?? 'a club'])
    }

    out.set(pool.pool_id, { poolId: pool.pool_id, poolName: pool.pool_name, matchweek: mw, roundId: round.round_id, unpicked, usedClubs })
  }
  return out
}

// =============================================================
// The producer — called hourly from the league-notices cron
// =============================================================

export async function queueLeagueReminders(
  admin: SupabaseClient,
  now: number,
): Promise<{ lmsQueued: number; lastCallsQueued: number }> {
  const notices: NoticeInsert[] = []

  // Last Man Standing: open, a day before, the last call.
  for (const plan of (await planLms(admin)).values()) {
    if (!plan.matchweek.lock_at) continue
    const window = windowFor(Date.parse(plan.matchweek.lock_at) - now)
    if (!window) continue
    for (const userId of plan.unpicked.keys()) {
      notices.push({
        type: window === 'open' ? 'lms_pick_open' : 'lms_pick_reminder',
        userId,
        poolId: plan.poolId,
        dedupKey: window === 'open'
          ? `lms_pick_open:${plan.matchweek.matchweek_id}:${plan.poolId}:${userId}`
          : `lms_pick_reminder:${plan.matchweek.matchweek_id}:${plan.poolId}:${userId}:${window}`,
        payload: { matchweekId: plan.matchweek.matchweek_id, window },
        deadlineAt: plan.matchweek.lock_at,
      })
    }
  }
  const lmsQueued = notices.length

  // Pick'em and Showdown: the last call, in the matchweek's last two hours, to whoever has still
  // not picked every match — the same plan the day-before reminder sends from.
  const { data: pools, error } = await admin
    .from('pools')
    .select('pool_id, league_season_id')
    .in('league_mode', ['pickem', 'showdown'])
    .eq('status', 'open')
    .is('archived_at', null)
  if (error) throw new Error(`pools: ${error.message}`)
  const poolRows = ((pools ?? []) as Array<{ pool_id: string; league_season_id: string | null }>)
    .filter((p): p is { pool_id: string; league_season_id: string } => p.league_season_id !== null)
  const open = await openMatchweeks(admin, [...new Set(poolRows.map((p) => p.league_season_id))])
  for (const pool of poolRows) {
    const mw = open.get(pool.league_season_id)
    if (!mw?.lock_at || windowFor(Date.parse(mw.lock_at) - now) !== 'last') continue
    const plan = await planLockReminder(admin, pool.pool_id, mw.matchweek_id)
    if ('skipped' in plan) continue
    for (const m of plan.members) {
      notices.push({
        type: 'lock_reminder',
        userId: m.userId,
        poolId: pool.pool_id,
        dedupKey: `${leagueDedupKey('lock_reminder', pool.pool_id, mw.matchweek_id, m.userId, null)}:last`,
        payload: { matchweekId: mw.matchweek_id, window: 'last' },
        deadlineAt: mw.lock_at,
      })
    }
  }

  const queued = notices.length > 0 ? await enqueue(admin, notices) : []
  return { lmsQueued: Math.min(lmsQueued, queued.length), lastCallsQueued: Math.max(0, queued.length - lmsQueued) }
}

// =============================================================
// The composers — read again when the outbox sends
// =============================================================

function lmsComposer(kind: 'open' | 'reminder') {
  return async (admin: SupabaseClient, rows: OutboxRow[]): Promise<Map<number, Composed>> => {
    const out = new Map<number, Composed>()
    const plans = await planLms(admin, [...new Set(rows.map((r) => r.pool_id).filter((p): p is string => !!p))])
    for (const row of rows) {
      const plan = row.pool_id ? plans.get(row.pool_id) : undefined
      // The pool stopped running, or the matchweek moved on: what this row announces is over.
      if (!plan || plan.matchweek.matchweek_id !== row.payload.matchweekId || !plan.matchweek.lock_at) {
        out.set(row.outbox_id, { skip: 'expired' })
        continue
      }
      // Picked since it was queued, or knocked out: no longer true.
      const entries = row.user_id ? plan.unpicked.get(row.user_id) : undefined
      if (!entries || entries.length === 0) {
        out.set(row.outbox_id, { skip: 'no_longer_true' })
        continue
      }
      const name = matchweekName(plan.matchweek)
      const poolUrl = `${appUrl()}/pools/${plan.poolId}?tab=predictions`
      const { data: u } = await admin.from('users').select('full_name, username').eq('user_id', row.user_id as string).maybeSingle()
      const userName = (u as { full_name: string | null; username: string | null } | null)?.full_name
        || (u as { username: string | null } | null)?.username || 'there'
      const lastCall = row.payload.window === 'last'
      const mail = kind === 'open'
        ? lmsPickOpenTemplate({
            userName, poolName: plan.poolName, matchweekName: name, deadline: plan.matchweek.lock_at, poolUrl,
            entries: entries.map((e) => ({ entryName: e.entryName, usedClubs: plan.usedClubs.get(e.entryId) ?? [] })),
          })
        : lmsPickReminderTemplate({
            userName, poolName: plan.poolName, matchweekName: name, deadline: plan.matchweek.lock_at, poolUrl,
            unpickedEntries: entries.map((e) => e.entryName), lastCall,
          })
      out.set(row.outbox_id, {
        emails: [{ key: kind === 'open' ? 'open' : `reminder-${String(row.payload.window)}`, subject: mail.subject, html: mail.html, tags: [{ name: 'category', value: 'league_lms_pick' }] }],
        push: kind === 'open'
          ? { title: `${name}: pick your club`, body: `You're still in ${plan.poolName}. Pick before it locks.`, data: { poolId: plan.poolId, tab: 'predictions' } }
          : lastCall
            ? { title: `${name} locks soon`, body: `Still no pick in ${plan.poolName} — without one, you're out.`, data: { poolId: plan.poolId, tab: 'predictions' } }
            : { title: `No pick yet for ${name}`, body: `${plan.poolName} locks in about a day — without a pick, you're out.`, data: { poolId: plan.poolId, tab: 'predictions' } },
      })
    }
    return out
  }
}

export const composeLmsPickOpen = lmsComposer('open')
export const composeLmsPickReminder = lmsComposer('reminder')
