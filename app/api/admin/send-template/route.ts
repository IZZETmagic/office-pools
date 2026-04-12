import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { sendBatchEmails } from '@/lib/email/send'
import {
  baseTemplate,
  deadlineReminderTemplate,
  roundDeadlineReminderTemplate,
  pendingPredictionsReminderTemplate,
} from '@/lib/email/templates'
import { TOPICS } from '@/lib/email/topics'
import { querySegment, type SegmentKey, SEGMENT_KEYS } from '@/lib/email/segments'
import { ROUND_LABELS, ROUND_MATCH_STAGES, type RoundKey } from '@/lib/tournament'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://sportpool.io'

type TemplateType =
  | 'pending_predictions'
  | 'deadline_reminder'
  | 'round_deadline_reminder'
  | 'custom'

// =============================================================
// GET /api/admin/send-template
// Returns pools and rounds data for the template composer UI.
// =============================================================
export async function GET() {
  const auth = await requireSuperAdmin()
  if (auth.error) return auth.error

  const supabase = createAdminClient()

  // Fetch pools with deadlines
  const { data: pools } = await supabase
    .from('pools')
    .select('pool_id, pool_name, prediction_mode, prediction_deadline')
    .order('pool_name')

  // Fetch open rounds
  const { data: rounds } = await supabase
    .from('pool_round_states')
    .select('id, pool_id, round_key, deadline, state')
    .in('state', ['open', 'locked'])
    .order('round_key')

  // Fetch user list for individual targeting
  const { data: users } = await supabase
    .from('users')
    .select('user_id, email, full_name, username')
    .not('email', 'is', null)
    .order('full_name')

  return NextResponse.json({
    pools: pools ?? [],
    rounds: rounds ?? [],
    users: (users ?? []).map((u) => ({
      user_id: u.user_id,
      email: u.email,
      name: u.full_name || u.username || u.email,
    })),
  })
}

// =============================================================
// POST /api/admin/send-template
// Sends transactional emails using a specific template.
// Supports per-user personalization and flexible recipient targeting.
// =============================================================
export async function POST(request: NextRequest) {
  const auth = await requireSuperAdmin()
  if (auth.error) return auth.error

  let body: {
    template: TemplateType
    idempotency_key?: string
    dry_run?: boolean
    // Recipient targeting (for custom & pool templates)
    recipient_mode?: 'segment' | 'users'
    segment?: SegmentKey
    user_ids?: string[]
    // Pool-specific
    pool_id?: string
    round_key?: string
    // Custom template fields
    subject?: string
    heading?: string
    body_text?: string
    cta_text?: string
    cta_url?: string
    topic?: string
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!body.template) {
    return NextResponse.json({ error: 'template is required' }, { status: 400 })
  }

  if (!body.idempotency_key) {
    return NextResponse.json({ error: 'idempotency_key is required' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Idempotency check
  const { data: existing } = await supabase
    .from('sent_announcements')
    .select('id')
    .eq('idempotency_key', body.idempotency_key)
    .single()

  if (existing) {
    return NextResponse.json(
      { error: 'Already sent with this idempotency key' },
      { status: 409 }
    )
  }

  // Route to the appropriate handler
  let result: SendResult
  switch (body.template) {
    case 'pending_predictions':
      result = await handlePendingPredictions(supabase, body)
      break
    case 'deadline_reminder':
      result = await handleDeadlineReminder(supabase, body)
      break
    case 'round_deadline_reminder':
      result = await handleRoundDeadlineReminder(supabase, body)
      break
    case 'custom':
      result = await handleCustom(supabase, body)
      break
    default:
      return NextResponse.json({ error: `Unknown template: ${body.template}` }, { status: 400 })
  }

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  if (result.emails.length === 0) {
    return NextResponse.json({ message: 'No recipients matched', totalEmails: 0 })
  }

  // Dry run mode
  if (body.dry_run) {
    return NextResponse.json({
      dry_run: true,
      totalEmails: result.emails.length,
      preview: result.emails.slice(0, 10).map((e) => ({
        to: e.to,
        subject: e.subject,
      })),
      // Include HTML of the first email for content preview
      previewHtml: result.emails[0]?.html ?? null,
      previewSubject: result.emails[0]?.subject ?? null,
    })
  }

  // Record idempotency key
  const { error: insertError } = await supabase
    .from('sent_announcements')
    .insert({
      idempotency_key: body.idempotency_key,
      sent_by: auth.data.userData.user_id,
    })

  if (insertError) {
    if (insertError.code === '23505') {
      return NextResponse.json(
        { error: 'Already sent with this idempotency key' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: 'Failed to record send' }, { status: 500 })
  }

  // Send in batches of 100
  const BATCH_SIZE = 100
  let totalSent = 0
  const errors: unknown[] = []

  for (let i = 0; i < result.emails.length; i += BATCH_SIZE) {
    const batch = result.emails.slice(i, i + BATCH_SIZE)
    const sendResult = await sendBatchEmails(batch)
    if (sendResult.success) {
      totalSent += batch.length
    } else {
      errors.push(sendResult.error)
    }
  }

  return NextResponse.json({
    message: `Sent ${totalSent} of ${result.emails.length} emails`,
    totalSent,
    totalEmails: result.emails.length,
    template: body.template,
    ...(errors.length > 0 ? { errors } : {}),
  })
}

// --- Types ---

type EmailPayload = {
  to: string
  subject: string
  html: string
  topicId?: string
  tags?: { name: string; value: string }[]
}

type SendResult = {
  emails: EmailPayload[]
  error?: string
}

// --- Template Handlers ---

async function handlePendingPredictions(
  supabase: ReturnType<typeof createAdminClient>,
  _body: any
): Promise<SendResult> {
  // Reuse the same logic from the pending reminders route
  const now = new Date()
  const userPending = new Map<
    string,
    {
      email: string
      firstName: string
      pools: {
        poolName: string
        predictionsLeft: number
        totalPredictions: number
        deadline: string
        daysLeft: number
        poolUrl: string
      }[]
    }
  >()

  // Full tournament mode
  const { data: fullPools } = await supabase
    .from('pools')
    .select('pool_id, pool_name, tournament_id, prediction_deadline')
    .not('prediction_deadline', 'is', null)
    .gt('prediction_deadline', now.toISOString())
    .eq('prediction_mode', 'full_tournament')

  for (const pool of fullPools ?? []) {
    const { count: totalMatches } = await supabase
      .from('matches')
      .select('*', { count: 'exact', head: true })
      .eq('tournament_id', pool.tournament_id)

    const { data: entries } = await supabase
      .from('pool_entries')
      .select(`
        entry_id,
        pool_members!inner(user_id, users!inner(email, full_name, username))
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

      const { count: madeCount } = await supabase
        .from('predictions')
        .select('*', { count: 'exact', head: true })
        .eq('entry_id', entry.entry_id)

      const total = totalMatches ?? 0
      const left = Math.max(0, total - (madeCount ?? 0))
      const userId = member.user_id as string

      if (!userPending.has(userId)) {
        userPending.set(userId, { email: user.email, firstName: extractFirstName(user.full_name, user.username), pools: [] })
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

  // Progressive mode
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

    const { data: pool } = await supabase
      .from('pools')
      .select('pool_id, pool_name, tournament_id')
      .eq('pool_id', round.pool_id)
      .single()
    if (!pool) continue

    const { data: roundMatches } = await supabase
      .from('matches')
      .select('match_id')
      .eq('tournament_id', pool.tournament_id)
      .in('stage', stages)

    const totalRoundMatches = roundMatches?.length ?? 0
    if (totalRoundMatches === 0) continue
    const matchIds = roundMatches!.map((m) => m.match_id)

    const { data: entries } = await supabase
      .from('pool_entries')
      .select(`
        entry_id, member_id,
        pool_members!inner(user_id, pool_id, users!inner(email, full_name, username))
      `)
      .eq('pool_members.pool_id', round.pool_id)
      .eq('predictions_locked', false)

    if (!entries || entries.length === 0) continue

    const deadline = new Date(round.deadline!)
    const daysLeft = Math.max(0, Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))

    for (const entry of entries) {
      const { data: sub } = await supabase
        .from('entry_round_submissions')
        .select('has_submitted')
        .eq('entry_id', entry.entry_id)
        .eq('round_key', roundKey)
        .maybeSingle()

      if (sub?.has_submitted) continue

      const { count: madeCount } = await supabase
        .from('predictions')
        .select('*', { count: 'exact', head: true })
        .eq('entry_id', entry.entry_id)
        .in('match_id', matchIds)

      const left = Math.max(0, totalRoundMatches - (madeCount ?? 0))
      const member = entry.pool_members as any
      const user = member.users
      if (!user?.email) continue

      const userId = member.user_id as string
      if (!userPending.has(userId)) {
        userPending.set(userId, { email: user.email, firstName: extractFirstName(user.full_name, user.username), pools: [] })
      }
      userPending.get(userId)!.pools.push({
        poolName: `${pool.pool_name} \u2014 ${roundName}`,
        predictionsLeft: left,
        totalPredictions: totalRoundMatches,
        deadline: round.deadline!,
        daysLeft,
        poolUrl: `${APP_URL}/pools/${pool.pool_id}?tab=predictions`,
      })
    }
  }

  const emails: EmailPayload[] = []
  for (const [, userData] of userPending) {
    if (userData.pools.length === 0) continue
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

  return { emails }
}

async function handleDeadlineReminder(
  supabase: ReturnType<typeof createAdminClient>,
  body: any
): Promise<SendResult> {
  if (!body.pool_id) return { emails: [], error: 'pool_id is required for deadline_reminder' }

  const { data: pool } = await supabase
    .from('pools')
    .select('pool_id, pool_name, prediction_deadline')
    .eq('pool_id', body.pool_id)
    .single()

  if (!pool) return { emails: [], error: 'Pool not found' }
  if (!pool.prediction_deadline) return { emails: [], error: 'Pool has no prediction deadline set' }

  const { data: entries } = await supabase
    .from('pool_entries')
    .select(`
      entry_id, entry_name,
      pool_members!inner(user_id, users!inner(email, full_name, username))
    `)
    .eq('pool_members.pool_id', pool.pool_id)
    .eq('has_submitted_predictions', false)
    .eq('predictions_locked', false)

  if (!entries || entries.length === 0) return { emails: [] }

  // Group by user
  const userEntries = new Map<string, { email: string; userName: string; entries: string[] }>()
  for (const entry of entries) {
    const member = entry.pool_members as any
    const user = member.users
    if (!user?.email) continue
    const userId = member.user_id as string
    if (!userEntries.has(userId)) {
      userEntries.set(userId, {
        email: user.email,
        userName: extractFirstName(user.full_name, user.username),
        entries: [],
      })
    }
    userEntries.get(userId)!.entries.push(entry.entry_name)
  }

  const deadlineFormatted = new Date(pool.prediction_deadline).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  })

  const poolUrl = `${APP_URL}/pools/${pool.pool_id}`
  const emails: EmailPayload[] = []
  for (const [, u] of userEntries) {
    const { subject, html } = deadlineReminderTemplate({
      userName: u.userName,
      poolName: pool.pool_name,
      deadline: deadlineFormatted,
      unsubmittedEntries: u.entries,
      poolUrl,
    })
    emails.push({
      to: u.email,
      subject,
      html,
      topicId: TOPICS.PREDICTIONS,
      tags: [{ name: 'category', value: 'deadline-reminder' }],
    })
  }

  return { emails }
}

async function handleRoundDeadlineReminder(
  supabase: ReturnType<typeof createAdminClient>,
  body: any
): Promise<SendResult> {
  if (!body.pool_id) return { emails: [], error: 'pool_id is required' }
  if (!body.round_key) return { emails: [], error: 'round_key is required' }

  const roundKey = body.round_key as RoundKey
  const roundName = ROUND_LABELS[roundKey]
  if (!roundName) return { emails: [], error: `Invalid round_key: ${body.round_key}` }

  const { data: pool } = await supabase
    .from('pools')
    .select('pool_id, pool_name, tournament_id')
    .eq('pool_id', body.pool_id)
    .single()

  if (!pool) return { emails: [], error: 'Pool not found' }

  const { data: roundState } = await supabase
    .from('pool_round_states')
    .select('deadline, state')
    .eq('pool_id', body.pool_id)
    .eq('round_key', roundKey)
    .single()

  if (!roundState) return { emails: [], error: 'Round state not found' }
  if (!roundState.deadline) return { emails: [], error: 'Round has no deadline set' }

  const { data: entries } = await supabase
    .from('pool_entries')
    .select(`
      entry_id, entry_name,
      pool_members!inner(user_id, pool_id, users!inner(email, full_name, username))
    `)
    .eq('pool_members.pool_id', pool.pool_id)
    .eq('predictions_locked', false)

  if (!entries || entries.length === 0) return { emails: [] }

  // Filter to unsubmitted entries for this round
  const userEntries = new Map<string, { email: string; userName: string; entries: string[] }>()
  for (const entry of entries) {
    const { data: sub } = await supabase
      .from('entry_round_submissions')
      .select('has_submitted')
      .eq('entry_id', entry.entry_id)
      .eq('round_key', roundKey)
      .maybeSingle()

    if (sub?.has_submitted) continue

    const member = entry.pool_members as any
    const user = member.users
    if (!user?.email) continue
    const userId = member.user_id as string
    if (!userEntries.has(userId)) {
      userEntries.set(userId, {
        email: user.email,
        userName: extractFirstName(user.full_name, user.username),
        entries: [],
      })
    }
    userEntries.get(userId)!.entries.push(entry.entry_name)
  }

  const poolUrl = `${APP_URL}/pools/${pool.pool_id}?tab=predictions`
  const emails: EmailPayload[] = []
  for (const [, u] of userEntries) {
    const { subject, html } = roundDeadlineReminderTemplate({
      userName: u.userName,
      poolName: pool.pool_name,
      roundName,
      deadline: roundState.deadline,
      unsubmittedEntries: u.entries,
      poolUrl,
    })
    emails.push({
      to: u.email,
      subject,
      html,
      topicId: TOPICS.PREDICTIONS,
      tags: [{ name: 'category', value: 'round-deadline-reminder' }],
    })
  }

  return { emails }
}

async function handleCustom(
  supabase: ReturnType<typeof createAdminClient>,
  body: any
): Promise<SendResult> {
  if (!body.subject) return { emails: [], error: 'subject is required for custom template' }
  if (!body.body_text) return { emails: [], error: 'body_text is required for custom template' }

  // Resolve recipients
  type Recipient = { email: string; firstName: string }
  const recipients: Recipient[] = []

  if (body.recipient_mode === 'users' && body.user_ids?.length) {
    const { data: users } = await supabase
      .from('users')
      .select('email, full_name, username')
      .in('user_id', body.user_ids)
      .not('email', 'is', null)

    for (const u of users ?? []) {
      recipients.push({ email: u.email, firstName: extractFirstName(u.full_name, u.username) })
    }
  } else if (body.segment) {
    if (!SEGMENT_KEYS.includes(body.segment)) {
      return { emails: [], error: `Invalid segment: ${body.segment}` }
    }
    const users = await querySegment(supabase, body.segment)
    for (const u of users) {
      recipients.push({ email: u.email, firstName: extractFirstName(u.full_name, u.username) })
    }
  } else {
    return { emails: [], error: 'Either segment or user_ids must be provided for custom template' }
  }

  if (recipients.length === 0) return { emails: [] }

  // Resolve topic
  const topicId = body.topic && TOPICS[body.topic as keyof typeof TOPICS]
    ? TOPICS[body.topic as keyof typeof TOPICS]
    : undefined

  const emails: EmailPayload[] = recipients.map((r) => {
    const bodyHtml = (body.body_text as string).replace(/\n/g, '<br>')
    const html = baseTemplate({
      preheader: body.subject,
      heading: body.heading || body.subject,
      body: `
        <p style="color:#525252;line-height:1.6;margin:0 0 12px;">Hi ${r.firstName},</p>
        <div style="color:#525252;line-height:1.6;">${bodyHtml}</div>
      `,
      ctaText: body.cta_text || undefined,
      ctaUrl: body.cta_url || undefined,
    })
    return {
      to: r.email,
      subject: body.subject,
      html,
      ...(topicId ? { topicId } : {}),
      tags: [{ name: 'category', value: 'admin-custom' }],
    }
  })

  return { emails }
}

function extractFirstName(fullName?: string | null, username?: string | null): string {
  if (fullName) {
    const first = fullName.trim().split(/\s+/)[0]
    if (first) return first
  }
  return username || 'there'
}
