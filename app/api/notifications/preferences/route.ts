import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { syncContactToResend } from '@/lib/email/contacts'
import { TOPICS, TOPIC_KEYS, type TopicKey } from '@/lib/email/topics'

const RESEND_API_KEY = process.env.RESEND_API_KEY!

// Build a reverse map: topicId -> topicKey (e.g. "abc123" -> "POOL_ACTIVITY")
function buildTopicIdToKeyMap(): Map<string, TopicKey> {
  const map = new Map<string, TopicKey>()
  for (const key of TOPIC_KEYS) {
    const topicId = TOPICS[key]
    if (topicId) map.set(topicId, key)
  }
  return map
}

// GET - Fetch user's real notification preferences from Resend
export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, userData } = auth.data

  // Fetch additional user fields needed for Resend contact sync
  const { data: userProfile } = await supabase
    .from('users')
    .select('email, username, full_name')
    .eq('user_id', userData.user_id)
    .single()

  if (!userProfile) return NextResponse.json({ error: 'User profile not found' }, { status: 404 })

  // Ensure contact exists in Resend
  const nameParts = (userProfile.full_name || '').split(' ')
  await syncContactToResend({
    email: userProfile.email,
    firstName: nameParts[0] || userProfile.username,
    lastName: nameParts.slice(1).join(' ') || undefined,
  })

  try {
    // Fetch real topic subscriptions from Resend REST API
    const res = await fetch(
      `https://api.resend.com/contacts/${encodeURIComponent(userProfile.email)}/topics?limit=100`,
      {
        headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
      }
    )

    // Default: all opted in
    const preferences: Record<string, boolean> = {}
    for (const key of TOPIC_KEYS) {
      preferences[key] = true
    }

    if (res.ok) {
      const body = await res.json()
      const topicIdToKey = buildTopicIdToKeyMap()

      // Update preferences with real subscription status from Resend
      for (const topic of body.data || []) {
        const key = topicIdToKey.get(topic.id)
        if (key) {
          preferences[key] = topic.subscription === 'opt_in'
        }
      }
    }

    return NextResponse.json({ preferences })
  } catch (err) {
    console.error('[Preferences] Failed to fetch from Resend:', err)
    // Return defaults on error
    const preferences: Record<string, boolean> = {}
    for (const key of TOPIC_KEYS) {
      preferences[key] = true
    }
    return NextResponse.json({ preferences })
  }
}

// PATCH - Update a notification preference in Resend
export async function PATCH(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, userData: authUserData } = auth.data

  // Fetch email needed for Resend API
  const { data: userEmail } = await supabase
    .from('users')
    .select('email')
    .eq('user_id', authUserData.user_id)
    .single()

  if (!userEmail) return NextResponse.json({ error: 'User not found' }, { status: 404 })

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
      `https://api.resend.com/contacts/${encodeURIComponent(userEmail.email)}/topics`,
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

    return NextResponse.json({ updated: true, topicKey, enabled })
  } catch (err) {
    console.error('[Preferences] Failed to update:', err)
    return NextResponse.json({ error: 'Failed to update preference' }, { status: 500 })
  }
}
