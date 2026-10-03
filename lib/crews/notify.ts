// Crews — what we send, and when. Programme Decision 2 as amended 2026-10-02.
//
//   seat notice    one push + one email when a crew pool saves you a spot      (crew_seats.notified_at)
//   seat reminder  ONE push + email, about a day before picks lock, only if
//                  the spot is still open                                       (crew_seats.reminded_at)
//   invite         one push + email to an account, or one email to an address
//                  with no account, at the moment the captain adds them
//
// THE RULES THE COPY KEEPS
//   · From SportPool, in our plural "we" voice — never written as if a person wrote it.
//   · Seat notices and the reminder NEVER name the captain (Decision 2). The invite DOES name who
//     asked — "Dave asked us to invite you" — once, previewed to the captain first, never followed
//     up (the 2026-10-02 clarification: invitations name who asked; reminders never do).
//   · ONE reminder, and the email says so. Nothing ever tells anyone who HASN'T taken a spot.
//   · Lock times are RELATIVE ("in 3 days"): an email can't know the reader's timezone, and an
//     absolute time in the wrong zone is a promise we'd break.
//   · No personal data in any URL — the sign-up link carries no email address.
//
// Disclosure gate, as one tooltip: "When your crew starts a pool we save you a spot and tell you
// once; if it's still open about a day before picks lock we remind you once. That's all."
//
// The copy builders and selectors are PURE (tested in __tests__/notify.test.ts); the senders below
// claim a row before sending so a retry or an overlapping run never sends twice.

import type { createAdminClient } from '@/lib/supabase/server'
import { paragraph } from '@/lib/email/components'
import { sendEmail } from '@/lib/email/send'
import { brandedTemplate } from '@/lib/email/templates'
import { TOPICS } from '@/lib/email/topics'
import { sendPushToUser } from '@/lib/push/apns'
import { modeLabel } from './needs'

type Admin = ReturnType<typeof createAdminClient>

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://sportpool.io'

/** The reminder goes out when picks lock within this window — "about a day". */
export const REMINDER_WINDOW_MS = 24 * 3_600_000

// ── Words ───────────────────────────────────────────────────────────────────────────────────────

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** "in 3 days", "in about a day", "in 5 hours", "within the hour". Relative on purpose — see header. */
export function untilLock(firstLockAt: string, now: number): string {
  const ms = Date.parse(firstLockAt) - now
  const hours = ms / 3_600_000
  if (hours < 1) return 'within the hour'
  if (hours < 18) return `in ${Math.round(hours)} hours`
  if (hours < 36) return 'in about a day'
  return `in ${Math.round(hours / 24)} days`
}

export type SeatCopyInput = {
  crewName: string
  competition: string
  mode: string
  poolCode: string
  firstLockAt: string
}

export type Message = { push: { title: string; body: string }; email: { subject: string; html: string } }

export function seatNoticeCopy(i: SeatCopyInput, now: number): Message {
  const when = untilLock(i.firstLockAt, now)
  return {
    push: {
      title: 'Your spot’s saved',
      body: `${i.crewName} is playing the ${i.competition}. Take it any time before picks lock ${when}.`,
    },
    email: {
      subject: `Your spot’s saved — ${i.crewName}`,
      html: brandedTemplate({
        preheader: `${i.crewName} is playing the ${i.competition}, and we’ve kept you a place.`,
        heading: 'Your spot’s saved',
        body: `
          ${paragraph(`${esc(i.crewName)} is playing the <strong>${esc(i.competition)}</strong> (${esc(i.mode)}) on SportPool, and we’ve saved you a spot.`)}
          ${paragraph(`Picks lock ${when}. Take it with one tap — or leave it, and it quietly goes when picks lock. Nobody’s told either way.`)}
          ${paragraph(`<span style="color:#7B87A8;font-size:13px">You’re getting this because you’re in ${esc(i.crewName)}. We’ll remind you once before picks lock, and that’s all.</span>`)}
        `,
        ctaText: 'Take your spot',
        ctaUrl: `${APP_URL}/join/${encodeURIComponent(i.poolCode)}`,
      }),
    },
  }
}

export function seatReminderCopy(i: SeatCopyInput, now: number): Message {
  const when = untilLock(i.firstLockAt, now)
  return {
    push: {
      title: 'Your spot’s still saved',
      body: `${i.competition} picks lock ${when} — ${i.crewName} kept you a place.`,
    },
    email: {
      subject: `Picks lock ${when} — your spot’s still saved`,
      html: brandedTemplate({
        preheader: `${i.crewName} kept you a place in the ${i.competition}.`,
        heading: 'Your spot’s still saved',
        body: `
          ${paragraph(`Just once, as promised: ${esc(i.crewName)}’s <strong>${esc(i.competition)}</strong> pool locks ${when}, and your spot is still there.`)}
          ${paragraph(`Take it, or leave it — it goes quietly when picks lock. This is the only reminder we’ll send.`)}
        `,
        ctaText: 'Take your spot',
        ctaUrl: `${APP_URL}/join/${encodeURIComponent(i.poolCode)}`,
      }),
    },
  }
}

export type InviteCopyInput = { inviter: string; crewName: string; people: number }

/** To someone with an account: push + email. The answer (Join / No thanks) is in the app. */
export function inviteToAccountCopy(i: InviteCopyInput): Message {
  return {
    push: {
      title: `${i.inviter} added you to ${i.crewName}`,
      body: 'Join once and you’ll get a saved spot whenever they start a pool.',
    },
    email: {
      subject: `${i.inviter} added you to ${i.crewName}`,
      html: brandedTemplate({
        preheader: `Join once and you’ll get a saved spot whenever they start a pool.`,
        heading: `${esc(i.inviter)} added you to ${esc(i.crewName)}`,
        body: `
          ${paragraph(`${esc(i.inviter)} asked us to add you to <strong>${esc(i.crewName)}</strong> on SportPool — ${i.people === 1 ? 'a group' : `a group of ${i.people}`} that plays prediction pools together, season after season.`)}
          ${paragraph(`Join once and you’ll get a saved spot whenever any of them starts a pool. Not for you? Tap <strong>No thanks</strong> and they can’t add you again.`)}
          ${paragraph(`<span style="color:#7B87A8;font-size:13px">We sent this because ${esc(i.inviter)} asked us to. It’s the only email about this invite.</span>`)}
        `,
        ctaText: 'Open SportPool',
        ctaUrl: APP_URL,
      }),
    },
  }
}

/**
 * To an address with no account: ONE email. They land in the crew when they sign up with this
 * address and verify it, then tap Join once. ⚠ No email address in the link.
 */
export function inviteToEmailCopy(i: InviteCopyInput): { subject: string; html: string } {
  return {
    subject: `${i.inviter} asked us to invite you to ${i.crewName}`,
    html: brandedTemplate({
      preheader: `${i.inviter} wants you in ${i.crewName} on SportPool.`,
      heading: `You’re invited to ${esc(i.crewName)}`,
      body: `
        ${paragraph(`${esc(i.inviter)} asked us to invite you to <strong>${esc(i.crewName)}</strong> on SportPool, where groups of friends predict the football together, season after season.`)}
        ${paragraph(`Sign up with this email address and you’ll find the invite waiting — tap Join once and you’re in.`)}
        ${paragraph(`<span style="color:#7B87A8;font-size:13px">If you weren’t expecting this, you can ignore it — we won’t email you about it again.</span>`)}
      `,
      ctaText: 'Sign up',
      ctaUrl: `${APP_URL}/signup`,
      // Not a subscriber, so no notification-settings footer to point at.
      footer: 'none',
    }),
  }
}

/** What the captain is shown before pressing Invite — the email's own first line, verbatim. */
export function invitePreview(i: Pick<InviteCopyInput, 'inviter' | 'crewName'>): string {
  return `${i.inviter} asked us to invite you to ${i.crewName} on SportPool…`
}

// ── Who is due what (pure) ──────────────────────────────────────────────────────────────────────

export type SeatRow = {
  pool_id: string
  user_id: string
  resolution: string | null
  notified_at: string | null
  reminded_at: string | null
}

/** A seat is due its notice while it is open and nobody has told them. */
export function dueNotice(s: SeatRow, firstLockAt: string | null, now: number): boolean {
  return s.resolution === null && s.notified_at === null && !!firstLockAt && Date.parse(firstLockAt) > now
}

/**
 * A seat is due its one reminder once picks lock within a day, the notice went out, it is still open,
 * and it hasn't been reminded. A notice sent inside the window already said "in about a day", so a
 * seat noticed less than 12 hours ago is not reminded again straight after.
 */
export function dueReminder(s: SeatRow, firstLockAt: string | null, now: number): boolean {
  if (s.resolution !== null || s.notified_at === null || s.reminded_at !== null || !firstLockAt) return false
  const toLock = Date.parse(firstLockAt) - now
  if (toLock <= 0 || toLock > REMINDER_WINDOW_MS) return false
  return now - Date.parse(s.notified_at) >= 12 * 3_600_000
}

// ── Senders ─────────────────────────────────────────────────────────────────────────────────────

/**
 * ⚠⚠ THE SWITCH, AND IT DEFAULTS OFF. Crew messages send only once `sync_settings` holds
 * `crew_notices_enabled = true`. Off by default — the opposite of the league outbox — because these
 * reach people who never asked for anything yet (an invite emails an address the moment a captain
 * types it), and Ryan approves the wording before the first one goes. Flip it on with:
 *   insert into sync_settings (setting_key, setting_value) values ('crew_notices_enabled', 'true')
 *   on conflict (setting_key) do update set setting_value = excluded.setting_value;
 * …and off again by setting it to 'false'. No deploy either way.
 */
export async function crewNoticesEnabled(admin: Admin): Promise<boolean> {
  const { data } = await admin.from('sync_settings').select('setting_value').eq('setting_key', 'crew_notices_enabled').maybeSingle()
  const v = data?.setting_value as unknown
  return v === true || v === 'true'
}

async function poolFacts(admin: Admin, poolId: string) {
  const { data: p } = await admin
    .from('pools')
    .select('pool_id, pool_code, crew_id, prediction_mode, league_mode, league_season_id, tournament_id')
    .eq('pool_id', poolId)
    .maybeSingle()
  if (!p || !p.crew_id) return null
  const [{ data: crew }, { data: lock }, comp] = await Promise.all([
    admin.from('crews').select('name').eq('crew_id', p.crew_id).maybeSingle(),
    admin.rpc('pool_first_lock_at', { p_pool_id: poolId }),
    p.league_season_id
      ? admin.from('league_seasons').select('competition_name, season_label').eq('season_id', p.league_season_id).maybeSingle()
      : admin.from('tournaments').select('name').eq('tournament_id', p.tournament_id).maybeSingle(),
  ])
  const c = comp.data as { competition_name?: string; season_label?: string; name?: string } | null
  return {
    crewName: crew?.name ?? 'Your crew',
    competition: c?.competition_name ? `${c.competition_name} ${c.season_label ?? ''}`.trim() : c?.name ?? 'season',
    mode: modeLabel(p.prediction_mode, p.league_mode),
    poolCode: p.pool_code as string,
    firstLockAt: (lock as string | null) ?? null,
  }
}

async function deliver(admin: Admin, userId: string, msg: Message, data: Record<string, string>) {
  const { data: u } = await admin.from('users').select('email').eq('user_id', userId).maybeSingle()
  await Promise.allSettled([
    sendPushToUser(userId, { title: msg.push.title, body: msg.push.body, data }, 'POOL_ACTIVITY'),
    u?.email
      ? sendEmail({ to: u.email, subject: msg.email.subject, html: msg.email.html, topicId: TOPICS.POOL_ACTIVITY })
      : Promise.resolve(null),
  ])
}

/**
 * One cron tick: send every due seat notice, then every due reminder. Each row is CLAIMED first —
 * an UPDATE that only succeeds while the stamp is still NULL — so overlapping runs, retries and
 * redeploys never send the same message twice. A claimed row whose send fails is NOT retried: one
 * missed email is better than a crew getting two.
 */
export async function runCrewNotices(admin: Admin, now: number): Promise<{ notices: number; reminders: number }> {
  const { data: seats, error } = await admin
    .from('crew_seats')
    .select('pool_id, user_id, resolution, notified_at, reminded_at')
    .is('resolved_at', null)
    .is('reminded_at', null)
    .limit(500)
  if (error) throw new Error(`crew_seats: ${error.message}`)

  const facts = new Map<string, Awaited<ReturnType<typeof poolFacts>>>()
  let notices = 0
  let reminders = 0
  for (const s of (seats ?? []) as SeatRow[]) {
    if (!facts.has(s.pool_id)) facts.set(s.pool_id, await poolFacts(admin, s.pool_id))
    const f = facts.get(s.pool_id)
    if (!f || !f.firstLockAt) continue
    const input = { ...f, firstLockAt: f.firstLockAt }

    if (dueNotice(s, f.firstLockAt, now)) {
      const { data: claimed } = await admin
        .from('crew_seats')
        .update({ notified_at: new Date(now).toISOString() })
        .eq('pool_id', s.pool_id)
        .eq('user_id', s.user_id)
        .is('notified_at', null)
        .select('user_id')
      if (claimed && claimed.length) {
        await deliver(admin, s.user_id, seatNoticeCopy(input, now), { type: 'crew_seat', poolId: s.pool_id })
        notices++
      }
    } else if (dueReminder(s, f.firstLockAt, now)) {
      const { data: claimed } = await admin
        .from('crew_seats')
        .update({ reminded_at: new Date(now).toISOString() })
        .eq('pool_id', s.pool_id)
        .eq('user_id', s.user_id)
        .is('reminded_at', null)
        .select('user_id')
      if (claimed && claimed.length) {
        await deliver(admin, s.user_id, seatReminderCopy(input, now), { type: 'crew_seat', poolId: s.pool_id })
        reminders++
      }
    }
  }
  return { notices, reminders }
}

/**
 * The invite, sent once when the captain adds someone. An account gets a push and an email; an
 * address with no account gets one email. Best-effort: a failure is logged, never retried — the
 * Needs-you card is still there for an account, and nobody gets a second email.
 */
export async function sendInviteNotice(admin: Admin, inviteId: string): Promise<void> {
  if (!(await crewNoticesEnabled(admin))) return
  const { data: inv } = await admin
    .from('crew_invites')
    .select('crew_id, invited_by, invitee_user_id, invitee_email')
    .eq('invite_id', inviteId)
    .maybeSingle()
  if (!inv) return
  const [{ data: crew }, { data: inviter }, { count: people }] = await Promise.all([
    admin.from('crews').select('name').eq('crew_id', inv.crew_id).maybeSingle(),
    inv.invited_by
      ? admin.from('users').select('full_name, username').eq('user_id', inv.invited_by).maybeSingle()
      : Promise.resolve({ data: null as { full_name: string | null; username: string } | null }),
    admin.from('crew_members').select('user_id', { count: 'exact', head: true }).eq('crew_id', inv.crew_id).is('left_at', null),
  ])
  const input = {
    inviter: inviter?.full_name?.trim() || inviter?.username || 'Someone',
    crewName: crew?.name ?? 'a crew',
    people: people ?? 0,
  }
  try {
    if (inv.invitee_user_id) {
      await deliver(admin, inv.invitee_user_id, inviteToAccountCopy(input), { type: 'crew_invite', crewId: inv.crew_id })
    } else if (inv.invitee_email) {
      const m = inviteToEmailCopy(input)
      await sendEmail({ to: inv.invitee_email, subject: m.subject, html: m.html })
    }
  } catch (e) {
    console.error('[crews] invite notice failed:', e)
  }
}
