import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { sendBatchEmails } from '@/lib/email/send'
import { pendingPredictionsReminderTemplate } from '@/lib/email/templates'
import { TOPICS } from '@/lib/email/topics'
import { ROUND_LABELS, ROUND_MATCH_STAGES, type RoundKey } from '@/lib/tournament'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://sportpool.io'

// =============================================================
// POST /api/admin/send-pending-reminders
// Sends a reminder email to every user who has at least one pool
// with outstanding (unsubmitted) predictions. Aggregates all
// pending pools into a single email per user.
// Super admin only.
// =============================================================
export async function POST(request: NextRequest) {
  // 1. Authenticate
  const auth = await requireSuperAdmin()
  if (auth.error) return auth.error

  // 1b. Idempotency
  let body: { idempotency_key?: string; dry_run?: boolean } = {}
  try {
    body = await request.json()
  } catch {
    // no body
  }

  if (!body.idempotency_key) {
    return NextResponse.json({ error: 'idempotency_key is required' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data: existing } = await supabase
    .from('sent_announcements')
    .select('id')
    .eq('idempotency_key', body.idempotency_key)
    .single()

  if (existing) {
    return NextResponse.json(
      { error: 'Reminder already sent with this idempotency key' },
      { status: 409 }
    )
  }

  // 2. Gather pending predictions across both pool modes
  type PendingPool = {
    poolName: string
    predictionsLeft: number
    totalPredictions: number
    deadline: string
    daysLeft: number
    poolUrl: string
  }

  // Map: userId -> { email, firstName, pools[] }
  const userPending = new Map<
    string,
    { email: string; firstName: string; pools: PendingPool[] }
  >()

  const now = new Date()

  // --- Full-tournament mode pools ---
  const { data: fullPools } = await supabase
    .from('pools')
    .select('pool_id, pool_name, tournament_id, prediction_deadline')
    .not('prediction_deadline', 'is', null)
    .gt('prediction_deadline', now.toISOString())
    .eq('prediction_mode', 'full_tournament')

  for (const pool of fullPools ?? []) {
    // Get total match count
    const { count: totalMatches } = await supabase
      .from('matches')
      .select('*', { count: 'exact', head: true })
      .eq('tournament_id', pool.tournament_id)

    // Get unsubmitted entries
    const { data: entries } = await supabase
      .from('pool_entries')
      .select(`
        entry_id,
        pool_members!inner(
          user_id,
          users!inner(email, full_name, username)
        )
      `)
      .eq('pool_members.pool_id', pool.pool_id)
      .eq('has_submitted_predictions', false)
      .eq('predictions_locked', false)

    if (!entries || entries.length === 0) continue

    const deadline = new Date(pool.prediction_deadline)
    const daysLeft = Math.max(0, Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))

    for (const entry of entries) {
      const member = entry.pool_members as any
      const user = member.users
      if (!user?.email) continue

      // Count how many predictions the user has already made
      const { count: madeCount } = await supabase
        .from('predictions')
        .select('*', { count: 'exact', head: true })
        .eq('entry_id', entry.entry_id)

      const total = totalMatches ?? 0
      const made = madeCount ?? 0
      const left = Math.max(0, total - made)

      const userId = member.user_id as string
      const firstName = extractFirstName(user.full_name, user.username)

      if (!userPending.has(userId)) {
        userPending.set(userId, { email: user.email, firstName, pools: [] })
      }

      userPending.get(userId)!.pools.push({
        poolName: pool.pool_name,
        predictionsLeft: left,
        totalPredictions: total,
        deadline: pool.prediction_deadline,
        daysLeft,
        poolUrl: `${APP_URL}/pools/${pool.pool_id}?tab=predictions`,
      })
    }
  }

  // --- Progressive mode pools (open rounds) ---
  const { data: openRounds } = await supabase
    .from('pool_round_states')
    .select('id, pool_id, round_key, deadline')
    .eq('state', 'open')
    .not('deadline', 'is', null)
    .gt('deadline', now.toISOString())

  for (const round of openRounds ?? []) {
    const roundKey = round.round_key as RoundKey
    const roundName = ROUND_LABELS[roundKey] ?? roundKey
    const stages = ROUND_MATCH_STAGES[roundKey] ?? []

    // Get pool info
    const { data: pool } = await supabase
      .from('pools')
      .select('pool_id, pool_name, tournament_id')
      .eq('pool_id', round.pool_id)
      .single()

    if (!pool) continue

    // Get match IDs and count for this round
    const { data: roundMatches } = await supabase
      .from('matches')
      .select('match_id')
      .eq('tournament_id', pool.tournament_id)
      .in('stage', stages)

    const totalRoundMatches = roundMatches?.length ?? 0
    if (totalRoundMatches === 0) continue

    const matchIds = roundMatches!.map((m) => m.match_id)

    // Get all entries for this pool
    const { data: entries } = await supabase
      .from('pool_entries')
      .select(`
        entry_id,
        member_id,
        pool_members!inner(
          user_id,
          pool_id,
          users!inner(email, full_name, username)
        )
      `)
      .eq('pool_members.pool_id', round.pool_id)
      .eq('predictions_locked', false)

    if (!entries || entries.length === 0) continue

    const deadline = new Date(round.deadline!)
    const daysLeft = Math.max(0, Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))

    for (const entry of entries) {
      // Check if already submitted for this round
      const { data: sub } = await supabase
        .from('entry_round_submissions')
        .select('has_submitted')
        .eq('entry_id', entry.entry_id)
        .eq('round_key', roundKey)
        .maybeSingle()

      if (sub?.has_submitted) continue

      // Count predictions made for this round
      const { count: madeCount } = await supabase
        .from('predictions')
        .select('*', { count: 'exact', head: true })
        .eq('entry_id', entry.entry_id)
        .in('match_id', matchIds)

      const made = madeCount ?? 0
      const left = Math.max(0, totalRoundMatches - made)

      const member = entry.pool_members as any
      const user = member.users
      if (!user?.email) continue

      const userId = member.user_id as string
      const firstName = extractFirstName(user.full_name, user.username)

      if (!userPending.has(userId)) {
        userPending.set(userId, { email: user.email, firstName, pools: [] })
      }

      userPending.get(userId)!.pools.push({
        poolName: `${pool.pool_name} — ${roundName}`,
        predictionsLeft: left,
        totalPredictions: totalRoundMatches,
        deadline: round.deadline!,
        daysLeft,
        poolUrl: `${APP_URL}/pools/${pool.pool_id}?tab=predictions`,
      })
    }
  }

  // 3. Build emails (one per user, aggregating all pending pools)
  const emails: Array<{
    to: string
    subject: string
    html: string
    topicId: string
    tags: { name: string; value: string }[]
  }> = []

  for (const [, userData] of userPending) {
    if (userData.pools.length === 0) continue

    // Sort pools by days left (most urgent first)
    userData.pools.sort((a, b) => a.daysLeft - b.daysLeft)

    const { subject, html } = pendingPredictionsReminderTemplate({
      firstName: userData.firstName,
      pools: userData.pools,
    })

    emails.push({
      to: userData.email,
      subject,
      html,
      topicId: TOPICS.PREDICTIONS,
      tags: [{ name: 'category', value: 'pending-predictions-reminder' }],
    })
  }

  if (emails.length === 0) {
    return NextResponse.json({
      message: 'No users have pending predictions',
      totalEmails: 0,
    })
  }

  // 3b. Dry run mode — return preview without sending
  if (body.dry_run) {
    return NextResponse.json({
      dry_run: true,
      totalEmails: emails.length,
      preview: emails.slice(0, 5).map((e) => ({
        to: e.to,
        subject: e.subject,
      })),
    })
  }

  // 4. Record idempotency key
  const { error: insertError } = await supabase
    .from('sent_announcements')
    .insert({
      idempotency_key: body.idempotency_key,
      sent_by: auth.data.userData.user_id,
    })

  if (insertError) {
    if (insertError.code === '23505') {
      return NextResponse.json(
        { error: 'Reminder already sent with this idempotency key' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: 'Failed to record reminder' }, { status: 500 })
  }

  // 5. Send in batches of 100
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
    message: `Pending prediction reminders sent to ${totalSent} of ${emails.length} users`,
    totalSent,
    totalEmails: emails.length,
    ...(errors.length > 0 ? { errors } : {}),
  })
}

/** Extract first name from full_name, falling back to username or 'there' */
function extractFirstName(fullName?: string | null, username?: string | null): string {
  if (fullName) {
    const first = fullName.trim().split(/\s+/)[0]
    if (first) return first
  }
  return username || 'there'
}
