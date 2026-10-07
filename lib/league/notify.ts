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
//   table_deadline       "If you haven't put your table in order yet, we remind
//                         you once before it closes."
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
// Push goes through `sendPushToUsers(..., kind)`, which looks up the kind's
// switch in the registry and filters on `push_notification_preferences`. Email carries a Resend `topicId` so an
// unsubscribe applies to the right stream rather than to everything.
// =============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { sendBatchEmails } from '@/lib/email/send'
import { TOPICS } from '@/lib/email/topics'
import {
  roundOpenTemplate,
  roundDeadlineReminderTemplate,
  leagueMatchweekResultTemplate,
  leagueTableDeadlineTemplate,
  leagueTableDeadlineMovedTemplate,
} from '@/lib/email/templates'
import { sendPushToUsers } from '@/lib/push/apns'
import type { NotificationTypeKey } from '@/lib/notifications/registry'
import { enqueue } from '@/lib/notifications/outbox'

export type LeagueNoticeKind =
  | 'matchweek_opened'
  | 'lock_reminder'
  | 'matchweek_completed'
  /** POOL-level, not matchweek-level — see notifyTableDeadline. */
  | 'table_deadline'

export type NoticeResult = { emails: number; pushes: number; skipped?: string }

// =============================================================
// PLAN, THEN SEND (N3, 2026-10-05)
// =============================================================
// Each notice is two steps: a PLAN — who gets what, read from the world now —
// and a send. Today's path sends the plan at once (`fromPlan`). The outbox
// path (lib/notifications) queues one row per member from the SAME plan, and
// its composer re-plans at send time, so the two paths cannot disagree about
// who a notice is for. While they run side by side, the outbox's rows are
// shadow rows: composed and gated, never sent.
// =============================================================

/** One member's share of a planned notice. */
export type PlannedMember = {
  userId: string
  /** Usually one; the matchweek result sends one per entry. `key` names each within the member's row. */
  emails: Array<{
    key: string
    to: string
    subject: string
    html: string
    topicId?: string
    tags: { name: string; value: string }[]
  }>
  push: boolean
}

export type LeaguePlan =
  /** The notice is not sent, and why — the same words NoticeResult has always carried. */
  | { skipped: string }
  | {
      members: PlannedMember[]
      push: { title: string; body: string; data?: Record<string, string> }
      /** The registry kind — its switch decides who may be pushed. */
      kind: NotificationTypeKey
      /** What Decision 16 measures the notice against: the deadline it is about, or when its event happened. */
      deadlineAt: string | null
      eventAt: string | null
    }

/** Today's path: send a plan at once. */
async function fromPlan(plan: LeaguePlan, poolId: string): Promise<NoticeResult> {
  if ('skipped' in plan) return { emails: 0, pushes: 0, skipped: plan.skipped }
  return deliver(
    plan.members.flatMap((m) => m.emails.map((e) => ({
      to: e.to, subject: e.subject, html: e.html, topicId: e.topicId, tags: e.tags,
      // For the delivery record: who it was for, so the cut-over can compare recipients.
      kind: plan.kind, userId: m.userId, poolId,
    }))),
    plan.members.filter((m) => m.push).map((m) => m.userId),
    plan.push,
    plan.kind,
    poolId,
  )
}

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL || 'https://sportpool.io'

type MemberRow = {
  user_id: string
  users: { email: string | null; username: string | null; full_name: string | null } | null
  pool_entries: Array<{ entry_id: string; entry_name: string }> | null
}

// =============================================================
// NO BACKFILLS — Decision 16
// =============================================================
// A notice is sent only while it is still TRUE and still TIMELY. The outbox
// already guarantees nothing is sent twice; that is a different promise. A row
// that sat unsent — a paused consumer, an unscheduled cron, the kill switch —
// is not a duplicate, so de-duplication waves it straight through.
//
// That is not hypothetical. On 2026-09-19 at 21:52 the newly scheduled consumer
// drained a backlog in seven seconds and sent 17 matchweek recaps to seven
// pools, between 5 and 19 days late, several to the same people at once.
//
// So each notice is checked against the WORLD at send time, never against the
// queue: "it is open" and "it locks soon" are false once the matchweek has
// locked, and a result stays true forever but stops being news. A notice that
// fails is skipped with an `expired:` reason — still marked done, still logged,
// countable — rather than sent late.
// =============================================================

const hasLocked = (lockAt: string | null) =>
  lockAt !== null && new Date(lockAt).getTime() <= Date.now()

/**
 * How long a matchweek result is still news.
 *
 * Measured 2026-10-05 against all 68 recaps ever queued: every one that went out
 * on time did so inside 24 hours of the matchweek being scored, and every late
 * one was at least 5 days late — nothing fell between. 48 hours blocks the whole
 * late group and none of the on-time one, with a day of margin on each side.
 */
const RECAP_FRESH_FOR_MS = 48 * 60 * 60 * 1000

/** Everything all three notices need, fetched once. */
async function context(admin: SupabaseClient, poolId: string, matchweekId: string) {
  const [{ data: pool }, { data: mw }] = await Promise.all([
    admin.from('pools').select('pool_name, archived_at, league_mode').eq('pool_id', poolId).single(),
    admin
      .from('league_matchweeks')
      .select('matchweek_number, label, lock_at, fixture_count, ranks_snapshot_at')
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
    /**
     * Does this pool's mode actually have weekly fixture picks?
     *
     * ⚠ ALL THREE MATCHWEEK NOTICES ARE MEANINGLESS WITHOUT IT. They were
     * written against migration 073, before Decision 9's four modes existed,
     * and they decide who to chase by reading `league_predictions` — where a
     * Table entry and a Last Man Standing entry both have ZERO rows by design.
     * So every member of those pools reads as "hasn't picked", every week, and
     * nothing they do can clear it.
     *
     * Migration 108 stops such a row being QUEUED. This is the send-time
     * re-check, and it is not redundant: a row queued before 108 can still be
     * sitting in the outbox, and these consumers are reachable by hand from the
     * super-admin surface. Same posture `notifyTableDeadline` already takes.
     *
     * An ALLOWLIST, matching 108 exactly — a mode added later inherits nothing
     * until somebody decides it should.
     */
    hasFixturePicks: ['pickem', 'showdown'].includes(
      (pool as { league_mode: string | null }).league_mode ?? '',
    ),
    matchweekName: (mw as { label: string | null; matchweek_number: number }).label
      || `Matchweek ${(mw as { matchweek_number: number }).matchweek_number}`,
    matchweekNumber: (mw as { matchweek_number: number }).matchweek_number,
    lockAt: (mw as { lock_at: string | null }).lock_at,
    /** When the matchweek became fully played AND fully scored — the moment its result became news. */
    snapshotAt: (mw as { ranks_snapshot_at: string | null }).ranks_snapshot_at,
    fixtureCount: (mw as { fixture_count: number }).fixture_count,
    members: ((members ?? []) as unknown as MemberRow[]).filter((m) => m.users?.email),
    poolUrl: `${appUrl()}/pools/${poolId}?tab=predictions`,
  }
}

const displayName = (m: MemberRow) => m.users?.full_name || m.users?.username || 'there'

async function deliver(
  emails: Array<{
    to: string; subject: string; html: string; topicId?: string; tags?: { name: string; value: string }[]
    kind?: NotificationTypeKey; userId?: string; poolId?: string
  }>,
  userIds: string[],
  push: { title: string; body: string; data?: Record<string, string> },
  kind: NotificationTypeKey,
  poolId: string,
): Promise<NoticeResult> {
  // Email and push are independent: one failing must not suppress the other,
  // and neither failing may throw, because the caller marks the outbox row on
  // the strength of this returning.
  const [emailRes, pushRes] = await Promise.allSettled([
    emails.length > 0 ? sendBatchEmails(emails) : Promise.resolve(null),
    userIds.length > 0 ? sendPushToUsers(userIds, push, kind, { poolId }) : Promise.resolve({ sent: 0, total: 0 }),
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
  return fromPlan(await planMatchweekOpened(admin, poolId, matchweekId), poolId)
}

export async function planMatchweekOpened(
  admin: SupabaseClient,
  poolId: string,
  matchweekId: string,
): Promise<LeaguePlan> {
  const ctx = await context(admin, poolId, matchweekId)
  if (!ctx) return { skipped: 'pool or matchweek not found' }
  if (ctx.archived) return { skipped: 'pool is archived' }
  if (!ctx.hasFixturePicks) return { skipped: 'mode has no weekly fixture picks' }
  // "A new matchweek is open" is false once it has locked.
  if (hasLocked(ctx.lockAt)) return { skipped: 'expired: the matchweek has already locked' }

  return {
    members: ctx.members.map((m) => {
      const { subject, html } = roundOpenTemplate({
        userName: displayName(m),
        poolName: ctx.poolName,
        roundName: ctx.matchweekName,
        deadline: ctx.lockAt ?? new Date().toISOString(),
        matchCount: ctx.fixtureCount,
        poolUrl: ctx.poolUrl,
      })
      return {
        userId: m.user_id,
        emails: [{
          key: 'open',
          to: m.users!.email as string,
          subject,
          html,
          topicId: TOPICS.PREDICTIONS,
          tags: [{ name: 'category', value: 'league_matchweek_open' }],
        }],
        push: true,
      }
    }),
    push: {
      title: `${ctx.matchweekName} is open`,
      body: `${ctx.fixtureCount} games to predict in ${ctx.poolName}.`,
      data: { poolId, tab: 'predictions' },
    },
    kind: 'matchweek_opened',
    deadlineAt: ctx.lockAt,
    eventAt: null,
  }
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
  return fromPlan(await planLockReminder(admin, poolId, matchweekId), poolId)
}

export async function planLockReminder(
  admin: SupabaseClient,
  poolId: string,
  matchweekId: string,
): Promise<LeaguePlan> {
  const ctx = await context(admin, poolId, matchweekId)
  if (!ctx) return { skipped: 'pool or matchweek not found' }
  if (ctx.archived) return { skipped: 'pool is archived' }
  if (!ctx.hasFixturePicks) return { skipped: 'mode has no weekly fixture picks' }
  // "Picks lock soon" is false once they have locked.
  if (hasLocked(ctx.lockAt)) return { skipped: 'expired: the matchweek has already locked' }

  const { data: fixtures } = await admin
    .from('league_fixtures').select('fixture_id').eq('matchweek_id', matchweekId)
  const fixtureIds = ((fixtures ?? []) as Array<{ fixture_id: string }>).map((f) => f.fixture_id)
  if (fixtureIds.length === 0) return { skipped: 'matchweek has no fixtures' }

  const entryIds = ctx.members.flatMap((m) => (m.pool_entries ?? []).map((e) => e.entry_id))
  if (entryIds.length === 0) return { skipped: 'no active entries' }

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
    return { skipped: 'everyone has picked' }
  }

  return {
    members: due.map(({ member, unfinished }) => {
      const { subject, html } = roundDeadlineReminderTemplate({
        userName: displayName(member),
        poolName: ctx.poolName,
        roundName: ctx.matchweekName,
        deadline: ctx.lockAt ?? new Date().toISOString(),
        unsubmittedEntries: unfinished,
        poolUrl: ctx.poolUrl,
      })
      return {
        userId: member.user_id,
        emails: [{
          key: 'reminder',
          to: member.users!.email as string,
          subject,
          html,
          topicId: TOPICS.PREDICTIONS,
          tags: [{ name: 'category', value: 'league_lock_reminder' }],
        }],
        push: true,
      }
    }),
    push: {
      title: `${ctx.matchweekName} closes soon`,
      body: `You haven't picked yet in ${ctx.poolName}.`,
      data: { poolId, tab: 'predictions' },
    },
    kind: 'lock_reminder',
    deadlineAt: ctx.lockAt,
    eventAt: null,
  }
}

/** "Matchweek 12 is scored — here is where you finished." */
export async function notifyMatchweekCompleted(
  admin: SupabaseClient,
  poolId: string,
  matchweekId: string,
): Promise<NoticeResult> {
  return fromPlan(await planMatchweekCompleted(admin, poolId, matchweekId), poolId)
}

export async function planMatchweekCompleted(
  admin: SupabaseClient,
  poolId: string,
  matchweekId: string,
): Promise<LeaguePlan> {
  const ctx = await context(admin, poolId, matchweekId)
  if (!ctx) return { skipped: 'pool or matchweek not found' }
  if (ctx.archived) return { skipped: 'pool is archived' }
  if (!ctx.hasFixturePicks) return { skipped: 'mode has no weekly fixture picks' }
  // A result stays true forever but stops being news. Aged from when the
  // matchweek was SCORED, not from when the row was queued, so a stale event
  // that gets re-queued is still caught. A missing stamp fails closed: the
  // snapshot is what produces this event, so its absence means something is
  // wrong, and a late recap is the outcome Decision 16 exists to prevent.
  if (!ctx.snapshotAt) {
    return { skipped: 'expired: no scored time, so freshness cannot be established' }
  }
  if (Date.now() - new Date(ctx.snapshotAt).getTime() > RECAP_FRESH_FOR_MS) {
    return { skipped: 'expired: the matchweek was scored more than 48 hours ago' }
  }

  const entryIds = ctx.members.flatMap((m) => (m.pool_entries ?? []).map((e) => e.entry_id))
  if (entryIds.length === 0) return { skipped: 'no active entries' }

  const [{ data: weekScores }, { data: totals }] = await Promise.all([
    admin.from('league_match_scores')
      .select('entry_id, total_points')
      .in('entry_id', entryIds).eq('matchweek_number', ctx.matchweekNumber),
    admin.from('league_entry_totals')
      // ⚠ duel_points IS PART OF THE SEASON TOTAL. `total_points` is the
      // picking half; the engine ranks on `(total_points + duel_points)` and
      // stores the sum nowhere. Without this column the Showdown recap told a
      // member "you're 1st with 800 points" while another sat 2nd on 900.
      .select('entry_id, total_points, duel_points, final_rank, previous_final_rank')
      .in('entry_id', entryIds),
  ])

  const weekByEntry = new Map<string, number>()
  for (const r of (weekScores ?? []) as Array<{ entry_id: string; total_points: number }>) {
    weekByEntry.set(r.entry_id, (weekByEntry.get(r.entry_id) ?? 0) + (r.total_points ?? 0))
  }
  const totalByEntry = new Map(
    ((totals ?? []) as Array<{ entry_id: string; total_points: number; duel_points: number | null; final_rank: number | null; previous_final_rank: number | null }>)
      .map((t) => [t.entry_id, t]),
  )
  const memberCount = totalByEntry.size

  return {
    // One email per ENTRY, one push per member — as it has always been.
    members: ctx.members.map((m) => ({
      userId: m.user_id,
      emails: (m.pool_entries ?? []).map((e) => {
        const t = totalByEntry.get(e.entry_id)
        const { subject, html } = leagueMatchweekResultTemplate({
          userName: displayName(m),
          poolName: ctx.poolName,
          matchweekName: ctx.matchweekName,
          pointsThisWeek: weekByEntry.get(e.entry_id) ?? 0,
          // Picks + duels — the sum the engine performs in its ORDER BY and
          // keeps in no column. See the select above.
          totalPoints: (t?.total_points ?? 0) + (t?.duel_points ?? 0),
          rank: t?.final_rank ?? null,
          previousRank: t?.previous_final_rank ?? null,
          memberCount,
          poolUrl: `${appUrl()}/pools/${poolId}?tab=leaderboard`,
        })
        return {
          key: `result-${e.entry_id}`,
          to: m.users!.email as string,
          subject,
          html,
          topicId: TOPICS.MATCH_RESULTS,
          tags: [{ name: 'category', value: 'league_matchweek_result' }],
        }
      }),
      push: true,
    })),
    push: {
      title: `${ctx.matchweekName} is scored`,
      body: `See where you finished in ${ctx.poolName}.`,
      data: { poolId, tab: 'leaderboard' },
    },
    kind: 'matchweek_completed',
    deadlineAt: null,
    eventAt: ctx.snapshotAt,
  }
}

/** Dispatch by kind. Unknown kinds are reported, never silently dropped. */
/**
 * "Your table closes on Friday, and you haven't ordered it yet."
 *
 * ⚠ POOL-LEVEL, unlike the other three. There is no matchweek behind a table
 * deadline — it is one date on `pools.league_table_lock_at` — which is why
 * migration 099 had to add a third target shape to the outbox before this kind
 * could be written at all.
 *
 * ONLY to members with at least one entry that has no table. That constraint is
 * what lets the reminder exist under the disclosure gate: telling somebody who
 * has already predicted that they might not have predicted is engagement bait
 * carrying no information. Sending once is the producer's job
 * (`table_deadline_reminder_sent_at`); sending to the right people is this
 * function's, because who has filed a table is a per-member fact.
 */
export async function notifyTableDeadline(
  admin: SupabaseClient,
  poolId: string,
): Promise<NoticeResult> {
  return fromPlan(await planTableDeadline(admin, poolId), poolId)
}

export async function planTableDeadline(
  admin: SupabaseClient,
  poolId: string,
): Promise<LeaguePlan> {
  const { data: pool } = await admin
    .from('pools')
    .select('pool_name, archived_at, league_mode, league_table_lock_at, league_season_id')
    .eq('pool_id', poolId)
    .single()
  if (!pool) return { skipped: 'pool not found' }

  const p = pool as {
    pool_name: string; archived_at: string | null; league_mode: string | null
    league_table_lock_at: string | null; league_season_id: string | null
  }
  if (p.archived_at !== null) return { skipped: 'pool is archived' }
  if (p.league_mode !== 'table') return { skipped: 'not a table pool' }
  if (!p.league_table_lock_at) return { skipped: 'pool has no table deadline' }

  // Re-checked at SEND time, not just at queue time. A row can sit in the outbox
  // across a failed drain, and mailing "closes soon" about a deadline that has
  // already gone would be worse than staying quiet — nothing can be done about
  // it, and migration 098 will not reopen it.
  if (new Date(p.league_table_lock_at) <= new Date()) {
    return { skipped: 'deadline already passed' }
  }

  // Same retired/detached exclusion as the matchweek notices — migrations
  // 056/057. Somebody who stopped participating should not be chased.
  const { data: members } = await admin
    .from('pool_members')
    .select('user_id, users!inner(email, username, full_name), pool_entries(entry_id, entry_name)')
    .eq('pool_id', poolId)
    .is('pool_entries.retired_at', null)

  const roster = ((members ?? []) as unknown as MemberRow[]).filter((m) => m.users?.email)
  const entryIds = roster.flatMap((m) => (m.pool_entries ?? []).map((e) => e.entry_id))
  if (entryIds.length === 0) return { skipped: 'no active entries' }

  // WHO HAS FILED A TABLE. One row per club, so presence of ANY row is the
  // answer — a half-finished order is not possible through the UI, which writes
  // all twenty positions in one upsert.
  const { data: filed } = await admin
    .from('league_table_predictions')
    .select('entry_id')
    .in('entry_id', entryIds)

  const hasTable = new Set(((filed ?? []) as Array<{ entry_id: string }>).map((r) => r.entry_id))

  const due = roster
    .map((m) => ({
      member: m,
      missing: (m.pool_entries ?? []).filter((e) => !hasTable.has(e.entry_id)).map((e) => e.entry_name),
    }))
    .filter((r) => r.missing.length > 0)

  if (due.length === 0) {
    // The happy path, and worth naming rather than sending nothing silently.
    return { skipped: 'everyone has filed a table' }
  }

  // How many clubs they are being asked to order. Read rather than assumed —
  // twenty is England; the Bundesliga is eighteen.
  const { count: clubCount } = await admin
    .from('league_clubs')
    .select('*', { count: 'exact', head: true })
    .eq('season_id', p.league_season_id ?? '')

  const poolUrl = `${appUrl()}/pools/${poolId}`
  return {
    members: due.map(({ member, missing }) => {
      const { subject, html } = leagueTableDeadlineTemplate({
        userName: displayName(member),
        poolName: p.pool_name,
        deadline: p.league_table_lock_at as string,
        unpredictedEntries: missing,
        clubCount: clubCount ?? 20,
        poolUrl,
      })
      return {
        userId: member.user_id,
        emails: [{
          key: 'table',
          to: member.users!.email as string,
          subject,
          html,
          topicId: TOPICS.PREDICTIONS,
          tags: [{ name: 'category', value: 'league_table_deadline' }],
        }],
        push: true,
      }
    }),
    push: {
      title: `Your table closes soon`,
      body: `You haven't ordered the clubs yet in ${p.pool_name}.`,
      data: { poolId, tab: 'predictions' },
    },
    kind: 'table_deadline',
    deadlineAt: p.league_table_lock_at,
    eventAt: null,
  }
}

/**
 * "The table deadline moved, and everyone's table is open again."
 *
 * ⚠ THE ONLY THING THAT MAKES AN EXTENSION FAIR. A table pool contains one
 * decision, so moving its deadline is not an administrative tidy-up — it hands
 * back the whole game. If it happened quietly, the members who filed on time
 * would be the only ones who never learned they could revise, which inverts the
 * thing entirely: being organised would cost you.
 *
 * So this goes to EVERY member, not only the stragglers, and the copy says as
 * much. It is also why it is sent from the server route that performs the move
 * rather than from the browser: the previous deadline-changed call was a
 * fire-and-forget `fetch(...).catch(() => {})` in SettingsTab, so closing the
 * tab moved a deadline nobody was told about.
 *
 * Not an outbox kind. The outbox exists for things a cron discovers; this is
 * caused by a person pressing a button and belongs in the same request, where
 * its failure can be reported to the person who caused it.
 */
export async function notifyTableDeadlineMoved(
  admin: SupabaseClient,
  poolId: string,
  opts: { newDeadline: string; wasReopened: boolean },
): Promise<NoticeResult> {
  const { data: pool } = await admin
    .from('pools')
    .select('pool_name, archived_at, league_mode')
    .eq('pool_id', poolId)
    .single()
  if (!pool) return { emails: 0, pushes: 0, skipped: 'pool not found' }

  const p = pool as { pool_name: string; archived_at: string | null; league_mode: string | null }
  if (p.archived_at !== null) return { emails: 0, pushes: 0, skipped: 'pool is archived' }
  if (p.league_mode !== 'table') return { emails: 0, pushes: 0, skipped: 'not a table pool' }

  // Same retired/detached exclusion as every other league notice — migrations
  // 056/057. Somebody who stopped participating is not owed the news.
  const { data: members } = await admin
    .from('pool_members')
    .select('user_id, users!inner(email, username, full_name), pool_entries(entry_id, entry_name)')
    .eq('pool_id', poolId)
    .is('pool_entries.retired_at', null)

  const roster = ((members ?? []) as unknown as MemberRow[]).filter((m) => m.users?.email)
  if (roster.length === 0) return { emails: 0, pushes: 0, skipped: 'no members to tell' }

  const entryIds = roster.flatMap((m) => (m.pool_entries ?? []).map((e) => e.entry_id))
  const { data: filed } = entryIds.length
    ? await admin.from('league_table_predictions').select('entry_id').in('entry_id', entryIds)
    : { data: [] as Array<{ entry_id: string }> }
  const hasTable = new Set(((filed ?? []) as Array<{ entry_id: string }>).map((r) => r.entry_id))

  const poolUrl = `${appUrl()}/pools/${poolId}`
  const emails = roster.map((m) => {
    // "Has an entry with no table" — the copy changes, the recipient list does
    // not. Everybody is told; only the sentence about what to do differs.
    const hasUnfiledEntry = (m.pool_entries ?? []).some((e) => !hasTable.has(e.entry_id))
    const { subject, html } = leagueTableDeadlineMovedTemplate({
      userName: displayName(m),
      poolName: p.pool_name,
      deadline: opts.newDeadline,
      hasUnfiledEntry,
      wasReopened: opts.wasReopened,
      poolUrl,
    })
    return {
      to: m.users!.email as string,
      subject,
      html,
      topicId: TOPICS.PREDICTIONS,
      tags: [{ name: 'category', value: 'league_table_deadline_moved' }],
      kind: 'table_deadline_moved' as const,
      userId: m.user_id,
      poolId,
    }
  })

  return deliver(
    emails,
    roster.map((m) => m.user_id),
    {
      title: opts.wasReopened ? 'Your table is open again' : 'Table deadline moved',
      body: opts.wasReopened
        ? `${p.pool_name}: everyone can change their table until the new deadline.`
        : `${p.pool_name}: the table prediction now closes at a new time.`,
      data: { poolId, tab: 'predictions' },
    },
    'table_deadline_moved',
    poolId,
  )
}

/** The plan for any queued league notice. Unknown kinds are reported, never silently dropped. */
export async function planLeagueNotice(
  admin: SupabaseClient,
  kind: string,
  poolId: string,
  matchweekId: string | null,
): Promise<LeaguePlan> {
  // POOL-level kinds first: they legitimately arrive with no matchweek, and the
  // outbox constraint (migration 099) guarantees the pairing is right.
  if (kind === 'table_deadline') return planTableDeadline(admin, poolId)

  // Everything else is matchweek-level. A missing matchweek here is a malformed
  // row, and saying so is better than passing an empty string into a query that
  // would simply find nothing and look like "everyone has picked".
  if (!matchweekId) return { skipped: `'${kind}' needs a matchweek and the row has none` }

  switch (kind) {
    case 'matchweek_opened':
      return planMatchweekOpened(admin, poolId, matchweekId)
    case 'lock_reminder':
      return planLockReminder(admin, poolId, matchweekId)
    case 'matchweek_completed':
      return planMatchweekCompleted(admin, poolId, matchweekId)
    default:
      return { skipped: `no handler for kind '${kind}'` }
  }
}

/**
 * Send a queued league notice.
 *
 * With `shadow`, the same plan is ALSO queued into the notification outbox as
 * shadow rows — one per member — which the outbox composes and gates without
 * sending. That is N3's side-by-side run: the send below is unchanged, and a
 * failure to queue the shadow is logged and never touches it.
 */
export async function sendLeagueNotice(
  admin: SupabaseClient,
  kind: string,
  poolId: string,
  matchweekId: string | null,
  opts: { shadow?: boolean } = {},
): Promise<NoticeResult> {
  const plan = await planLeagueNotice(admin, kind, poolId, matchweekId)
  const result = await fromPlan(plan, poolId)
  if (opts.shadow && !('skipped' in plan) && isLeagueOutboxKind(kind)) {
    try {
      await enqueue(admin, plan.members.map((m) => ({
        type: kind,
        userId: m.userId,
        poolId,
        shadow: true,
        dedupKey: leagueDedupKey(kind, poolId, matchweekId, m.userId, plan.deadlineAt),
        payload: { matchweekId },
        deadlineAt: plan.deadlineAt,
        ...(plan.eventAt ? { eventAt: plan.eventAt } : {}),
      })))
    } catch (err) {
      console.error(`[league-notify] shadow enqueue failed for ${kind} in ${poolId} (the send was unaffected):`,
        err instanceof Error ? err.message : err)
    }
  }
  return result
}

/** The league notices the outbox knows how to compose. */
export const LEAGUE_OUTBOX_KINDS = ['matchweek_opened', 'lock_reminder', 'matchweek_completed', 'table_deadline'] as const
export type LeagueOutboxKind = (typeof LEAGUE_OUTBOX_KINDS)[number]
export const isLeagueOutboxKind = (kind: string): kind is LeagueOutboxKind =>
  (LEAGUE_OUTBOX_KINDS as readonly string[]).includes(kind)

/**
 * One member's row for one notice. A table deadline carries its date, so a
 * moved deadline that is reminded again is a new row, not a duplicate.
 */
export function leagueDedupKey(
  kind: LeagueOutboxKind,
  poolId: string,
  matchweekId: string | null,
  userId: string,
  deadlineAt: string | null,
): string {
  return kind === 'table_deadline'
    ? `${kind}:${poolId}:${deadlineAt ?? 'none'}:${userId}`
    : `${kind}:${matchweekId ?? 'none'}:${poolId}:${userId}`
}
