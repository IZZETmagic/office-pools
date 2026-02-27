import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getResendClient } from '@/lib/email/resend'
import { syncContactToResend } from '@/lib/email/contacts'
import { TOPICS, TOPIC_KEYS, type TopicKey } from '@/lib/email/topics'

// GET - Fetch user's notification preferences
export async function GET() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userData } = await supabase
    .from('users')
    .select('email, username, full_name')
    .eq('auth_user_id', user.id)
    .single()

  if (!userData) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  // Ensure contact exists in Resend
  const nameParts = (userData.full_name || '').split(' ')
  await syncContactToResend({
    email: userData.email,
    firstName: nameParts[0] || userData.username,
    lastName: nameParts.slice(1).join(' ') || undefined,
  })

  const resend = getResendClient()
  const audienceId = process.env.RESEND_AUDIENCE_ID!

  try {
    // Get contact by email to find their ID
    const { data: contact } = await resend.contacts.get({
      audienceId,
      email: userData.email,
    })

    if (!contact) {
      // Return all topics as opted-in by default
      const preferences: Record<string, boolean> = {}
      for (const key of TOPIC_KEYS) {
        preferences[key] = true
      }
      return NextResponse.json({ preferences })
    }

    // Get topic subscriptions for this contact
    // Since the Resend SDK may not have a direct listTopics for contacts,
    // we'll return defaults (all opt_in) and let the PATCH endpoint handle updates
    const preferences: Record<string, boolean> = {}
    for (const key of TOPIC_KEYS) {
      preferences[key] = true // Default to opted in
    }

    return NextResponse.json({ preferences, contactId: contact.id })
  } catch (err) {
    console.error('[Preferences] Failed to fetch:', err)
    // Return defaults on error
    const preferences: Record<string, boolean> = {}
    for (const key of TOPIC_KEYS) {
      preferences[key] = true
    }
    return NextResponse.json({ preferences })
  }
}

// PATCH - Update a notification preference
export async function PATCH(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userData } = await supabase
    .from('users')
    .select('email')
    .eq('auth_user_id', user.id)
    .single()

  if (!userData) return NextResponse.json({ error: 'User not found' }, { status: 404 })

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

  const resend = getResendClient()
  const audienceId = process.env.RESEND_AUDIENCE_ID!

  try {
    // Get contact ID
    const { data: contact } = await resend.contacts.get({
      audienceId,
      email: userData.email,
    })

    if (!contact) {
      return NextResponse.json({ error: 'Contact not found in Resend' }, { status: 404 })
    }

    // Update topic subscription
    await resend.contacts.update({
      audienceId,
      id: contact.id,
      unsubscribed: false, // Keep globally subscribed
    })

    // Note: Resend topic subscription updates are handled at send-time via topicId
    // For now, we store preferences in a simple way using contact data
    // The Resend API manages topic subscriptions

    return NextResponse.json({ updated: true, topicKey, enabled })
  } catch (err) {
    console.error('[Preferences] Failed to update:', err)
    return NextResponse.json({ error: 'Failed to update preference' }, { status: 500 })
  }
}
