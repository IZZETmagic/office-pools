import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { syncContactToResend } from '@/lib/email/contacts'
import { TOPICS, TOPIC_KEYS, type TopicKey } from '@/lib/email/topics'
import { emailPreferencesFrom } from '@/lib/email/preferences'
import { createAdminClient } from '@/lib/supabase/server'
import { withPerfLogging } from '@/lib/api-perf'

const RESEND_API_KEY = process.env.RESEND_API_KEY!

// GET — a member's email preferences, read from Postgres (N1, 2026-10-05).
//
// Until now this asked Resend over the network on every page load. Postgres
// holds the same answer — the PATCH below writes Resend first and then here,
// and POST /api/webhooks/resend mirrors unsubscribes made from an email's own
// footer — so the page no longer waits on Resend. See lib/email/preferences.ts.
//
// ⚠ A failed read is an ERROR, not a page of defaults. Answering "subscribed
// to everything" on an error would show somebody who left as still signed up.
async function handleGET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, userData } = auth.data

  const { data: rows, error } = await supabase
    .from('notification_preferences')
    .select('category, channel, enabled')
    .eq('user_id', userData.user_id)
    .eq('channel', 'email')

  if (error) {
    console.error('[Preferences] Failed to read from Postgres:', error.message)
    return NextResponse.json({ error: 'Could not load your preferences' }, { status: 500 })
  }
  return NextResponse.json({ preferences: emailPreferencesFrom(rows ?? []) })
}

// PATCH - Update a notification preference in Resend
async function handlePATCH(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, userData: authUserData } = auth.data

  // Fetch profile needed for Resend contact sync + topics PATCH
  const { data: userProfile } = await supabase
    .from('users')
    .select('email, username, full_name')
    .eq('user_id', authUserData.user_id)
    .single()

  if (!userProfile) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  // Ensure the Resend contact exists before issuing the topics PATCH.
  // Without this, users whose contact was never synced (e.g. signed up
  // before topics shipped, or PATCH fires before GET) get a 4xx from
  // Resend that surfaces here as a 500. syncContactToResend is idempotent.
  const nameParts = (userProfile.full_name || '').split(' ')
  await syncContactToResend({
    email: userProfile.email,
    firstName: nameParts[0] || userProfile.username,
    lastName: nameParts.slice(1).join(' ') || undefined,
  })

  const { topicKey, enabled } = await request.json() as {
    topicKey: TopicKey
    enabled: boolean
  }

  if (!topicKey || !TOPIC_KEYS.includes(topicKey)) {
    return NextResponse.json({ error: 'Invalid topicKey' }, { status: 400 })
  }

  const topicId = TOPICS[topicKey]
  if (!topicId) {
    return NextResponse.json({ error: 'Topic not configured' }, { status: 500 })
  }

  try {
    // Update topic subscription via Resend REST API
    const res = await fetch(
      `https://api.resend.com/contacts/${encodeURIComponent(userProfile.email)}/topics`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify([
          {
            id: topicId,
            subscription: enabled ? 'opt_in' : 'opt_out',
          },
        ]),
      }
    )

    if (!res.ok) {
      const errorBody = await res.text()
      console.error('[Preferences] Resend API error:', res.status, errorBody)
      return NextResponse.json({ error: 'Failed to update preference in Resend' }, { status: 500 })
    }

    // Mirror into Postgres — AFTER Resend, so a change can never land here and
    // not where email is enforced. Members have no write grant on this table
    // (migration 168), so it goes through the admin client. If the mirror
    // fails, Resend still holds the change and its contact.topics.updated
    // webhook repairs this row — so the member is told it worked, because it did.
    const { error: mirrorErr } = await createAdminClient()
      .from('notification_preferences')
      .upsert(
        {
          user_id: authUserData.user_id,
          category: topicKey,
          channel: 'email',
          enabled,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,category,channel' },
      )
    if (mirrorErr) {
      console.error('[Preferences] Resend updated; Postgres mirror failed, webhook will repair:', mirrorErr.message)
    }

    return NextResponse.json({ updated: true, topicKey, enabled })
  } catch (err) {
    console.error('[Preferences] Failed to update:', err)
    return NextResponse.json({ error: 'Failed to update preference' }, { status: 500 })
  }
}

export const GET = withPerfLogging('/api/notifications/preferences', handleGET)
export const PATCH = withPerfLogging('/api/notifications/preferences', handlePATCH)
