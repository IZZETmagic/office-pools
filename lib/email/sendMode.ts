import type { NotificationTypeKey } from '@/lib/notifications/registry'
// =============================================================
// Admin email sends — SAFE BY DEFAULT
// =============================================================
// A send to a segment can reach every user. So an admin send route sends only
// when the caller says so in exactly one way: `dry_run: false`, the boolean.
// Anything else — the flag left out, `true`, the string "false", 0 — is a
// PREVIEW: recipients are counted, the first email is rendered, nothing leaves.
//
// Before 2026-10-05, send-template and send-pending-reminders read
// `if (body.dry_run)`, so a body that simply forgot the field sent to the whole
// segment. notify-round-open was already the other way round
// (`dryRun !== false`); this makes the three agree.
//
// A TEST send outranks both: one copy of the first rendered email, to the admin
// who asked, and nothing recorded — so it can never reach a member and never
// spends the idempotency key the real send needs. Ryan asked for exactly this:
// "are we retriggering them just to me?" Until now the answer was no.
// =============================================================

export type SendMode = 'test' | 'preview' | 'send'

export function resolveSendMode(body: { dry_run?: unknown; test_send?: unknown }): SendMode {
  if (body.test_send === true) return 'test'
  if (body.dry_run === false) return 'send'
  return 'preview'
}

type Email = {
  to: string
  subject: string
  html: string
  kind: NotificationTypeKey
  userId?: string | null
  poolId?: string | null
  tags?: { name: string; value: string }[]
}

/**
 * The copy a test send delivers: the first recipient's email exactly as they
 * would receive it, addressed to the admin instead.
 *
 * ⚠ SENT AS A DIRECT EMAIL, deliberately: always delivered, so no topic and no
 * switch. A topic routes through the admin's OWN Resend subscription, and a
 * switch is the admin's own choice — either way an admin who had turned it off
 * would get a test that silently never arrives, worse than no test. And no
 * member: the record must not say the member was emailed. The cost is
 * cosmetic: the footer's unsubscribe link renders without a topic.
 */
export function testEmailFor(first: Email, adminEmail: string): Email {
  return {
    to: adminEmail,
    subject: `[TEST] ${first.subject}`,
    html: first.html,
    kind: 'direct_email',
    userId: null,
    tags: [{ name: 'category', value: 'test_send' }],
  }
}
