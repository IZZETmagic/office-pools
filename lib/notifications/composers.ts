// =============================================================
// Composers — what each kind of queued notification says (N3)
// =============================================================
// One composer per registry kind the outbox can send. A composer turns rows
// into messages AT SEND TIME, reading the world as it is then — so a member
// who has picked since a lock reminder was queued is skipped, not reminded.
//
// A kind with no composer here cannot be sent through the outbox: dispatch
// records such a row as failed at once rather than holding it.
//
// League notices compose from the same plan today's path sends from
// (lib/league/notify.ts), so the two cannot disagree about who a notice is for.
// =============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { planLeagueNotice, type LeagueOutboxKind } from '@/lib/league/notify'
import { composeCrewInvites, composeCrewSeats } from '@/lib/crews/notify'
import { composeMemberJoined, composePoolWelcome } from '@/lib/pools/joinNotices'
import { composeLmsPickOpen, composeLmsPickReminder } from '@/lib/league/lmsNotices'
import { composeMemberRemoved, composePointsAdjusted, composePoolArchived, composePoolRestored } from '@/lib/pools/adminNotices'
import { composeChatMention, composeChatMessage } from '@/lib/banter/chatNotices'
import type { Composed, Composer, OutboxRow } from './outbox'

/**
 * Why a plan declined, as a reason the outbox can record (a-z and
 * underscores). Matched on the words NoticeResult has always used.
 */
export function skipReason(skipped: string): string {
  if (skipped.startsWith('expired') || skipped === 'deadline already passed') return 'expired'
  if (skipped === 'pool is archived') return 'pool_archived'
  if (skipped === 'mode has no weekly fixture picks' || skipped === 'not a table pool') return 'wrong_mode'
  if (
    skipped === 'everyone has picked' ||
    skipped === 'everyone has filed a table' ||
    skipped === 'no active entries' ||
    skipped === 'matchweek has no fixtures'
  ) return 'no_longer_true'
  if (skipped.includes('not found') || skipped.includes('needs a matchweek') || skipped === 'pool has no table deadline') {
    return 'not_found'
  }
  return 'not_sendable'
}

function leagueComposer(kind: LeagueOutboxKind): Composer {
  return async (admin: SupabaseClient, rows: OutboxRow[]) => {
    const out = new Map<number, Composed>()
    // One plan per pool and matchweek, however many members' rows it covers.
    const groups = new Map<string, OutboxRow[]>()
    for (const row of rows) {
      const k = `${row.pool_id ?? ''}|${String(row.payload.matchweekId ?? '')}`
      groups.set(k, [...(groups.get(k) ?? []), row])
    }
    for (const group of groups.values()) {
      const poolId = group[0].pool_id
      const matchweekId = typeof group[0].payload.matchweekId === 'string' ? group[0].payload.matchweekId : null
      if (!poolId) {
        for (const row of group) out.set(row.outbox_id, { skip: 'not_found' })
        continue
      }
      const plan = await planLeagueNotice(admin, kind, poolId, matchweekId)
      if ('skipped' in plan) {
        for (const row of group) out.set(row.outbox_id, { skip: skipReason(plan.skipped) })
        continue
      }
      const byMember = new Map(plan.members.map((m) => [m.userId, m]))
      for (const row of group) {
        const member = row.user_id ? byMember.get(row.user_id) : undefined
        // In the plan when queued, not in it now: they picked, left, or the
        // entry retired. Whichever — the notice is no longer true for them.
        if (!member) {
          out.set(row.outbox_id, { skip: 'no_longer_true' })
          continue
        }
        out.set(row.outbox_id, {
          emails: member.emails.map(({ key, subject, html, tags }) => ({ key, subject, html, tags })),
          push: member.push ? plan.push : null,
        })
      }
    }
    return out
  }
}

export const COMPOSERS: Partial<Record<string, Composer>> = {
  matchweek_opened: leagueComposer('matchweek_opened'),
  lock_reminder: leagueComposer('lock_reminder'),
  matchweek_completed: leagueComposer('matchweek_completed'),
  table_deadline: leagueComposer('table_deadline'),
  // Crews (N3, 2026-10-05) — composed in lib/crews/notify.ts, beside the copy they send. The invite
  // to an ADDRESS is deliberately absent: it is sent where it is claimed, never queued (see there).
  crew_seat_saved: composeCrewSeats('crew_seat_saved'),
  crew_seat_reminder: composeCrewSeats('crew_seat_reminder'),
  crew_invite: composeCrewInvites,
  // The join notices (N3, 2026-10-06) — queued by the join itself, every way into a pool.
  pool_welcome: composePoolWelcome,
  member_joined: composeMemberJoined,
  // Last Man Standing (2026-10-06) — a missed pick knocks you out, so these exist at all.
  lms_pick_open: composeLmsPickOpen,
  lms_pick_reminder: composeLmsPickReminder,
  // An admin's actions (N3, 2026-10-06) — queued by the route that performs them.
  pool_archived: composePoolArchived,
  pool_restored: composePoolRestored,
  points_adjusted: composePointsAdjusted,
  member_removed: composeMemberRemoved,
  // Chat (N3, 2026-10-06) — built from the stored message, never from a request.
  chat_message: composeChatMessage,
  chat_mention: composeChatMention,
}
