import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { sendBatchEmails } from '@/lib/email/send'
import { roundOpenTemplate } from '@/lib/email/templates'
import { TOPICS } from '@/lib/email/topics'
import { sendPushToUsers } from '@/lib/push/apns'
import { ROUND_LABELS, ROUND_MATCH_STAGES } from '@/lib/tournament'
import type { RoundKey } from '@/app/pools/[pool_id]/types'

export const dynamic = 'force-dynamic'

// =============================================================
// POST /api/admin/notify-round-open
// ONE-OFF recovery tool. Sends the "round is now open" email + push to every
// member of progressive pools whose given round is `open` with the given
// deadline. Built to notify the pools whose round_32 was opened by a manual
// data fix after the 2026-06-28 auto-open bug (advanceGroupToR32 left the
// in-memory matches array stale, so checkProgressiveRoundCompletion never
// opened R32 and never sent these emails).
//
// Auth: Bearer <CRON_SECRET>.
// Safe by default: dryRun=true unless you explicitly pass dryRun=false.
// =============================================================
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const roundKey = (body.round_key ?? 'round_32') as RoundKey
  const deadline = (body.deadline ?? '2026-06-28T17:00:00Z') as string
  const dryRun = body.dryRun !== false // default true — must pass dryRun:false to send
  const sendPush = body.push !== false // default true

  const supabase = createAdminClient()

  // Target: progressive pools whose `roundKey` is open with this exact deadline.
  const { data: roundRows, error: roundErr } = await supabase
    .from('pool_round_states')
    .select('pool_id, deadline, pools!inner(pool_id, pool_name, tournament_id, prediction_mode)')
    .eq('round_key', roundKey)
    .eq('state', 'open')
    .eq('deadline', deadline)
    .eq('pools.prediction_mode', 'progressive')

  if (roundErr) {
    return NextResponse.json({ error: roundErr.message }, { status: 500 })
  }
  if (!roundRows || roundRows.length === 0) {
    return NextResponse.json({ ok: true, poolsTargeted: 0, message: 'No matching pools' })
  }

  const roundName = ROUND_LABELS[roundKey]
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://sportpool.io'
  const stages = ROUND_MATCH_STAGES[roundKey] ?? []

  // Match count per tournament (used in the email body), cached.
  const matchCountByTournament = new Map<string, number>()
  async function getMatchCount(tournamentId: string): Promise<number> {
    if (matchCountByTournament.has(tournamentId)) return matchCountByTournament.get(tournamentId)!
    const { count } = await supabase
      .from('matches')
      .select('*', { count: 'exact', head: true })
      .eq('tournament_id', tournamentId)
      .in('stage', stages)
    const c = count ?? 0
    matchCountByTournament.set(tournamentId, c)
    return c
  }

  const emails: Array<{ to: string; subject: string; html: string; topicId: string; tags: { name: string; value: string }[] }> = []
  let recipients = 0
  let pushSent = 0
  let pushTotal = 0

  for (const row of roundRows) {
    const pool = (row as any).pools
    if (!pool) continue
    const matchCount = await getMatchCount(pool.tournament_id)
    const poolUrl = `${appUrl}/pools/${pool.pool_id}?tab=predictions`

    const { data: members } = await supabase
      .from('pool_members')
      .select('user_id, users(email, full_name, username)')
      .eq('pool_id', pool.pool_id)

    if (!members || members.length === 0) continue

    for (const m of members as any[]) {
      if (!m.users?.email) continue
      const { subject, html } = roundOpenTemplate({
        userName: m.users.full_name || m.users.username || 'there',
        poolName: pool.pool_name,
        roundName,
        deadline,
        matchCount,
        poolUrl,
      })
      emails.push({
        to: m.users.email,
        subject,
        html,
        topicId: TOPICS.POOL_ACTIVITY,
        tags: [{ name: 'category', value: 'round_open' }],
      })
      recipients++
    }

    if (sendPush && !dryRun) {
      const userIds = (members as any[]).map((m) => m.user_id).filter(Boolean)
      const res = await sendPushToUsers(
        userIds,
        {
          title: `${roundName} Now Open`,
          body: `Make your predictions for ${pool.pool_name}!`,
          data: { type: 'pool_activity', pool_id: pool.pool_id },
        },
        'PREDICTIONS',
      )
      pushSent += res.sent
      pushTotal += res.total
    }
  }

  if (!dryRun && emails.length > 0) {
    await sendBatchEmails(emails)
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    roundKey,
    deadline,
    poolsTargeted: roundRows.length,
    emails: emails.length,
    recipients,
    push: { sent: pushSent, total: pushTotal },
    message: dryRun
      ? 'DRY RUN — no emails or pushes sent. Re-run with {"dryRun": false} to send.'
      : `Sent ${emails.length} emails.`,
  })
}
