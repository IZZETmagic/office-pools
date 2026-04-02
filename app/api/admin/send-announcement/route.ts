import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth'
import { sendBatchEmails } from '@/lib/email/send'
import { allTeamsAnnouncementTemplate } from '@/lib/email/templates'
import { TOPICS } from '@/lib/email/topics'

// =============================================================
// POST /api/admin/send-announcement
// Sends the "All 48 teams confirmed" announcement to all users.
// Super admin only.
// =============================================================
export async function POST(request: NextRequest) {
  // 1. Authenticate — super admin only
  const auth = await requireSuperAdmin()
  if (auth.error) return auth.error
  const { supabase, userData } = auth.data

  // 1b. Check idempotency key
  let body: { idempotency_key?: string } = {}
  try {
    body = await request.json()
  } catch {
    // No body is fine — but idempotency_key is required
  }

  if (!body.idempotency_key) {
    return NextResponse.json({ error: 'idempotency_key is required' }, { status: 400 })
  }

  const { data: existing } = await supabase
    .from('sent_announcements')
    .select('id')
    .eq('idempotency_key', body.idempotency_key)
    .single()

  if (existing) {
    return NextResponse.json(
      { error: 'Announcement already sent with this idempotency key' },
      { status: 409 }
    )
  }

  // Insert the idempotency record before sending
  const { error: insertError } = await supabase
    .from('sent_announcements')
    .insert({ idempotency_key: body.idempotency_key, sent_by: userData.user_id })

  if (insertError) {
    // Unique constraint violation means a concurrent request beat us
    if (insertError.code === '23505') {
      return NextResponse.json(
        { error: 'Announcement already sent with this idempotency key' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: 'Failed to record announcement' }, { status: 500 })
  }

  // 2. Fetch all teams grouped by group_letter
  const { data: teams, error: teamsError } = await supabase
    .from('teams')
    .select('country_name, group_letter')
    .eq('tournament_id', '00000000-0000-0000-0000-000000000001')
    .order('group_letter')
    .order('country_name')

  if (teamsError || !teams) {
    return NextResponse.json({ error: 'Failed to fetch teams' }, { status: 500 })
  }

  // Build groups array
  const groupMap = new Map<string, string[]>()
  for (const t of teams) {
    const existing = groupMap.get(t.group_letter) || []
    existing.push(t.country_name)
    groupMap.set(t.group_letter, existing)
  }
  const groups = Array.from(groupMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([letter, teamNames]) => ({ letter, teams: teamNames }))

  // 3. Calculate days until kickoff (June 11, 2026)
  const kickoff = new Date('2026-06-11T00:00:00Z')
  const now = new Date()
  const daysUntilKickoff = Math.ceil((kickoff.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

  // 4. Fetch all users with email notifications
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('user_id, full_name, username, email')
    .not('email', 'is', null)

  if (usersError || !users) {
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
  }

  const dashboardUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://sportpool.io'

  // 5. Build email batch
  const emails = users
    .filter((u) => u.email)
    .map((u) => {
      const { subject, html } = allTeamsAnnouncementTemplate({
        userName: u.full_name || u.username || 'there',
        groups,
        daysUntilKickoff,
        dashboardUrl: `${dashboardUrl}/dashboard`,
      })
      return {
        to: u.email!,
        subject,
        html,
        topicId: TOPICS.POOL_ACTIVITY,
        tags: [{ name: 'type', value: 'all-teams-announcement' }],
      }
    })

  if (emails.length === 0) {
    return NextResponse.json({ message: 'No users to email' })
  }

  // 6. Send in batches of 100 (Resend batch limit)
  const BATCH_SIZE = 100
  let totalSent = 0
  const errors: unknown[] = []

  for (let i = 0; i < emails.length; i += BATCH_SIZE) {
    const batch = emails.slice(i, i + BATCH_SIZE)
    const result = await sendBatchEmails(batch)
    if (result.success) {
      totalSent += batch.length
    } else {
      errors.push(result.error)
    }
  }

  return NextResponse.json({
    message: `Announcement sent to ${totalSent} of ${emails.length} users`,
    totalSent,
    totalUsers: emails.length,
    daysUntilKickoff,
    ...(errors.length > 0 ? { errors } : {}),
  })
}
