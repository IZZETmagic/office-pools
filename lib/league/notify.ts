// =============================================================
// LEAGUE NOTIFICATIONS — turning an outbox row into an email and a push
// =============================================================
// Phase 6 (L-F). Producers queue three kinds of matchweek event (migrations
// 071/073/074); this is what sends them.
//
// ## The disclosure gate, which decided the shape of all three
//
// CLAUDE.md: a mechanic touching notifications must survive being explained in
// one sentence to the person receiving it.
//
//   matchweek_opened     "We tell you when a new matchweek opens so you can
//                         pick before it locks."
//   lock_reminder        "If you haven't picked yet, we remind you once before
//                         the deadline."
//   matchweek_completed  "When a matchweek finishes, we tell you how you did."
//
// The reminder passes BECAUSE of its two constraints, not despite them. Sending
// it to somebody who has already picked would be engagement bait carrying no
// information, and sending it twice would be nagging. "Only once" is enforced
// by `lock_reminder_sent_at` in the producer; "only to those who have not
// picked" is enforced HERE, because who has picked is a per-member fact while
// the queued row is per pool.
//
// Nothing in this file nudges. The results email reports what happened and
// stops; there is deliberately no "you've slipped to 4th, don't let them get
// away", which fails the gate on its face.
//
// ## Preferences are honoured
//
// Push goes through `sendPushToUsers(..., category)`, which filters on
// `push_notification_preferences`. Email carries a Resend `topicId` so an
// unsubscribe applies to the right stream rather than to everything.
// =============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { sendBatchEmails } from '@/lib/email/send'
import { TOPICS } from '@/lib/email/topics'
import {
  roundOpenTemplate,
  roundDeadlineReminderTemplate,
  leagueMatchweekResultTemplate,
} from '@/lib/email/templates'
import { sendPushToUsers } from '@/lib/push/apns'
import type { PushCategory } from '@/lib/push/categories'

export type LeagueNoticeKind = 'matchweek_opened' | 'lock_reminder' | 'matchweek_completed'

export type NoticeResult = { emails: number; pushes: number; skipped?: string }

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL || 'https://sportpool.io'

type MemberRow = {
  user_id: string
  users: { email: string | null; username: string | null; full_name: string | null } | null
  pool_entries: Array<{ entry_id: string; entry_name: string }> | null
}

/** Everything all three notices need, fetched once. */
async function context(admin: SupabaseClient, poolId: string, matchweekId: string) {
  const [{ data: pool }, { data: mw }] = await Promise.all([
    admin.from('pools').select('pool_name, archived_at').eq('pool_id', poolId).single(),
    admin
      .from('league_matchweeks')
      .select('matchweek_number, label, lock_at, fixture_count')
      .eq('matchweek_id', matchweekId)
      .single(),
  ])
  if (!pool || !mw) return null

  // Retired and detached entries are excluded the same way every other read
  // excludes them — see migrations 056/057. Somebody who stopped participating
  // should not be reminded to pick.
  const { data: members } = await admin
    .from('pool_members')
    .select('user_id, users!inner(email, username, full_name), pool_entries(entry_id, entry_name)')
    .eq('pool_id', poolId)
    .is('pool_entries.retired_at', null)

  return {
    poolName: (pool as { pool_name: string }).pool_name,
    archived: (pool as { archived_at: string | null }).archived_at !== null,
    matchweekName: (mw as { label: string | null; matchweek_number: number }).label
      || `Matchweek ${(mw as { matchweek_number: number }).matchweek_number}`,
    matchweekNumber: (mw as { matchweek_number: number }).matchweek_number,
    lockAt: (mw as { lock_at: string | null }).lock_at,
    fixtureCount: (mw as { fixture_count: number }).fixture_count,
    members: ((members ?? []) as unknown as MemberRow[]).filter((m) => m.users?.email),
    poolUrl: `${appUrl()}/pools/${poolId}?tab=predictions`,
  }
}

const displayName = (m: MemberRow) => m.users?.full_name || m.users?.username || 'there'

async function deliver(
  emails: Array<{ to: string; subject: string; html: string; topicId?: string; tags?: { name: string; value: string }[] }>,
  userIds: string[],
  push: { title: string; body: string; data?: Record<string, string> },
  category: PushCategory,
): Promise<NoticeResult> {
  // Email and push are independent: one failing must not suppress the other,
  // and neither failing may throw, because the caller marks the outbox row on
  // the strength of this returning.
  const [emailRes, pushRes] = await Promise.allSettled([
    emails.length > 0 ? sendBatchEmails(emails) : Promise.resolve(null),
    userIds.length > 0 ? sendPushToUsers(userIds, push, category) : Promise.resolve({ sent: 0, total: 0 }),
  ])
  if (emailRes.status === 'rejected') console.error('[league-notify] email failed:', emailRes.reason)
  if (pushRes.status === 'rejected') console.error('[league-notify] push failed:', pushRes.reason)

  return {
    emails: emailRes.status === 'fulfilled' && emailRes.value ? emails.length : 0,
    pushes: pushRes.status === 'fulfilled' ? (pushRes.value as { sent: number }).sent : 0,
  }
}

// =============================================================

/** "Matchweek 12 is open — ten games, closes Saturday 12:30." */
export async function notifyMatchweekOpened(
  admin: SupabaseClient,
  poolId: string,
  matchweekId: string,
): Promise<NoticeResult> {
  const ctx = await context(admin, poolId, matchweekId)
  if (!ctx) return { emails: 0, pushes: 0, skipped: 'pool or matchweek not found' }
  if (ctx.archived) return { emails: 0, pushes: 0, skipped: 'pool is archived' }

  const emails = ctx.members.map((m) => {
    const { subject, html } = roundOpenTemplate({
      userName: displayName(m),
      poolName: ctx.poolName,
      roundName: ctx.matchweekName,
      deadline: ctx.lockAt ?? new Date().toISOString(),
      matchCount: ctx.fixtureCount,
      poolUrl: ctx.poolUrl,
    })
    return {
      to: m.users!.email as string,
      subject,
      html,
      topicId: TOPICS.PREDICTIONS,
      tags: [{ name: 'category', value: 'league_matchweek_open' }],
    }
  })

  return deliver(
    emails,
    ctx.members.map((m) => m.user_id),
    {
      title: `${ctx.matchweekName} is open`,
      body: `${ctx.fixtureCount} games to predict in ${ctx.poolName}.`,
      data: { poolId, tab: 'predictions' },
    },
    'PREDICTIONS',
  )
}

/**
 * "You haven't picked yet, and it locks soon."
 *
 * ONLY to members with at least one entry that has not picked every fixture in
 * the matchweek. This is the constraint that lets the reminder exist at all.
 */
export async function notifyLockReminder(
  admin: SupabaseClient,
  poolId: string,
  matchweekId: string,
): Promise<NoticeResult> {
  const ctx = await context(admin, poolId, matchweekId)
  if (!ctx) return { emails: 0, pushes: 0, skipped: 'pool or matchweek not found' }
  if (ctx.archived) return { emails: 0, pushes: 0, skipped: 'pool is archived' }

  const { data: fixtures } = await admin
    .from('league_fixtures').select('fixture_id').eq('matchweek_id', matchweekId)
  const fixtureIds = ((fixtures ?? []) as Array<{ fixture_id: string }>).map((f) => f.fixture_id)
  if (fixtureIds.length === 0) return { emails: 0, pushes: 0, skipped: 'matchweek has no fixtures' }

  const entryIds = ctx.members.flatMap((m) => (m.pool_entries ?? []).map((e) => e.entry_id))
  if (entryIds.length === 0) return { emails: 0, pushes: 0, skipped: 'no active entries' }

  // How many of THIS matchweek's fixtures each entry has picked. Both depths
  // count: a Results pick is a row here exactly as a Scores pick is.
  const { data: picks } = await admin
    .from('league_predictions').select('entry_id, fixture_id')
    .in('entry_id', entryIds).in('fixture_id', fixtureIds)

  const pickedByEntry = new Map<string, number>()
  for (const p of (picks ?? []) as Array<{ entry_id: string }>) {
    pickedByEntry.set(p.entry_id, (pickedByEntry.get(p.entry_id) ?? 0) + 1)
  }

  const due = ctx.members
    .map((m) => ({
      member: m,
      unfinished: (m.pool_entries ?? [])
        .filter((e) => (pickedByEntry.get(e.entry_id) ?? 0) < fixtureIds.length)
        .map((e) => e.entry_name),
    }))
    .filter((r) => r.unfinished.length > 0)

  if (due.length === 0) {
    // Everybody is done. Not an error — the happy path, and worth returning
    // rather than sending nothing silently.
    return { emails: 0, pushes: 0, skipped: 'everyone has picked' }
  }

  const emails = due.map(({ member, unfinished }) => {
    const { subject, html } = roundDeadlineReminderTemplate({
      userName: displayName(member),
      poolName: ctx.poolName,
      roundName: ctx.matchweekName,
      deadline: ctx.lockAt ?? new Date().toISOString(),
      unsubmittedEntries: unfinished,
      poolUrl: ctx.poolUrl,
    })
    return {
      to: member.users!.email as string,
      subject,
      html,
      topicId: TOPICS.PREDICTIONS,
      tags: [{ name: 'category', value: 'league_lock_reminder' }],
    }
  })

  return deliver(
    emails,
    due.map((r) => r.member.user_id),
    {
      title: `${ctx.matchweekName} closes soon`,
      body: `You haven't picked yet in ${ctx.poolName}.`,
      data: { poolId, tab: 'predictions' },
    },
    'PREDICTIONS',
  )
}

/** "Matchweek 12 is scored — here is where you finished." */
export async function notifyMatchweekCompleted(
  admin: SupabaseClient,
  poolId: string,
  matchweekId: string,
): Promise<NoticeResult> {
  const ctx = await context(admin, poolId, matchweekId)
  if (!ctx) return { emails: 0, pushes: 0, skipped: 'pool or matchweek not found' }
  if (ctx.archived) return { emails: 0, pushes: 0, skipped: 'pool is archived' }

  const entryIds = ctx.members.flatMap((m) => (m.pool_entries ?? []).map((e) => e.entry_id))
  if (entryIds.length === 0) return { emails: 0, pushes: 0, skipped: 'no active entries' }

  const [{ data: weekScores }, { data: totals }] = await Promise.all([
    admin.from('league_match_scores')
      .select('entry_id, total_points')
      .in('entry_id', entryIds).eq('matchweek_number', ctx.matchweekNumber),
    admin.from('league_entry_totals')
      .select('entry_id, total_points, final_rank, previous_final_rank')
      .in('entry_id', entryIds),
  ])

  const weekByEntry = new Map<string, number>()
  for (const r of (weekScores ?? []) as Array<{ entry_id: string; total_points: number }>) {
    weekByEntry.set(r.entry_id, (weekByEntry.get(r.entry_id) ?? 0) + (r.total_points ?? 0))
  }
  const totalByEntry = new Map(
    ((totals ?? []) as Array<{ entry_id: string; total_points: number; final_rank: number | null; previous_final_rank: number | null }>)
      .map((t) => [t.entry_id, t]),
  )
  const memberCount = totalByEntry.size

  const emails = ctx.members.flatMap((m) =>
    (m.pool_entries ?? []).map((e) => {
      const t = totalByEntry.get(e.entry_id)
      const { subject, html } = leagueMatchweekResultTemplate({
        userName: displayName(m),
        poolName: ctx.poolName,
        matchweekName: ctx.matchweekName,
        pointsThisWeek: weekByEntry.get(e.entry_id) ?? 0,
        totalPoints: t?.total_points ?? 0,
        rank: t?.final_rank ?? null,
        previousRank: t?.previous_final_rank ?? null,
        memberCount,
        poolUrl: `${appUrl()}/pools/${poolId}?tab=leaderboard`,
      })
      return {
        to: m.users!.email as string,
        subject,
        html,
        topicId: TOPICS.MATCH_RESULTS,
        tags: [{ name: 'category', value: 'league_matchweek_result' }],
      }
    }),
  )

  return deliver(
    emails,
    ctx.members.map((m) => m.user_id),
    {
      title: `${ctx.matchweekName} is scored`,
      body: `See where you finished in ${ctx.poolName}.`,
      data: { poolId, tab: 'leaderboard' },
    },
    'MATCH_RESULTS',
  )
}

/** Dispatch by kind. Unknown kinds are reported, never silently dropped. */
export async function sendLeagueNotice(
  admin: SupabaseClient,
  kind: string,
  poolId: string,
  matchweekId: string,
): Promise<NoticeResult> {
  switch (kind) {
    case 'matchweek_opened':
      return notifyMatchweekOpened(admin, poolId, matchweekId)
    case 'lock_reminder':
      return notifyLockReminder(admin, poolId, matchweekId)
    case 'matchweek_completed':
      return notifyMatchweekCompleted(admin, poolId, matchweekId)
    default:
      return { emails: 0, pushes: 0, skipped: `no handler for kind '${kind}'` }
  }
}
