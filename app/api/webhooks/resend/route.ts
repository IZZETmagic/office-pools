import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { verifyResendWebhook } from '@/lib/email/resendWebhook'
import { newerThanStored, topicChangesFrom, topicIdToKey } from '@/lib/email/preferences'

export const dynamic = 'force-dynamic'

// =============================================================
// POST /api/webhooks/resend — N1, question 5 (2026-10-05)
// =============================================================
// Mirrors `contact.topics.updated` into notification_preferences, so an
// unsubscribe made from an email's own footer — which happens in Resend, not
// in our app — reaches the preferences page. Every other event is ignored.
//
// ⚠ VERIFIED OR REFUSED. The Svix signature is checked (through the Resend
// SDK) against the RAW body before anything is parsed — a body re-serialised
// from JSON would not verify. With no RESEND_WEBHOOK_SECRET it answers 503,
// so an unconfigured deployment refuses everything instead of trusting it.
//
// ⚠ NEVER WRITES TO RESEND. The preferences route writes Resend, and Resend
// then fires this event; a handler that wrote back would echo for ever.
//
// ⚠ NEWER WINS. Svix retries out of order, so a change older than the stored
// row is dropped (lib/email/preferences.ts → newerThanStored).
//
// A transient failure answers 500 so Svix retries; a request that can never
// succeed (bad signature, no such member) answers without inviting a retry.
//
// SET UP, once: Resend → Webhooks → add https://sportpool.io/api/webhooks/resend
// for `contact.topics.updated`, and copy its signing secret into Vercel
// (Production) as RESEND_WEBHOOK_SECRET.
// =============================================================

export async function POST(request: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'RESEND_WEBHOOK_SECRET is not configured' }, { status: 503 })
  }

  const raw = await request.text()
  let event: unknown
  try {
    event = verifyResendWebhook(raw, request.headers, secret)
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const parsed = topicChangesFrom(event, topicIdToKey())
  if (!parsed) return NextResponse.json({ ok: true, ignored: true })
  if (parsed.changes.length === 0) return NextResponse.json({ ok: true, applied: 0 })

  const admin = createAdminClient()
  // Every stored address is lower-case and unique (checked 2026-10-05), and
  // topicChangesFrom lower-cases the event's, so this is an exact match.
  const { data: user, error: userErr } = await admin
    .from('users')
    .select('user_id')
    .eq('email', parsed.email)
    .maybeSingle()
  if (userErr) {
    console.error('[resend-webhook] member lookup failed:', userErr.message)
    return NextResponse.json({ error: 'lookup failed' }, { status: 500 })
  }
  if (!user) return NextResponse.json({ ok: true, ignored: true, reason: 'no member has this address' })

  const { data: stored, error: storedErr } = await admin
    .from('notification_preferences')
    .select('category, updated_at')
    .eq('user_id', user.user_id)
    .eq('channel', 'email')
    .in('category', parsed.changes.map((c) => c.key))
  if (storedErr) {
    console.error('[resend-webhook] stored-row read failed:', storedErr.message)
    return NextResponse.json({ error: 'read failed' }, { status: 500 })
  }

  const changes = newerThanStored(parsed.changes, parsed.at, stored ?? [])
  if (changes.length === 0) return NextResponse.json({ ok: true, applied: 0, reason: 'older than stored' })

  const updatedAt = parsed.at ?? new Date().toISOString()
  const { error } = await admin.from('notification_preferences').upsert(
    changes.map((c) => ({
      user_id: user.user_id,
      category: c.key,
      channel: 'email',
      enabled: c.enabled,
      updated_at: updatedAt,
    })),
    { onConflict: 'user_id,category,channel' },
  )
  if (error) {
    console.error('[resend-webhook] write failed:', error.message)
    return NextResponse.json({ error: 'write failed' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, applied: changes.length })
}
