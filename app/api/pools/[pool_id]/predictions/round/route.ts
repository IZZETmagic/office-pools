import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { ROUND_MATCH_STAGES, ROUND_LABELS } from '@/lib/tournament'
import { sendEmail } from '@/lib/email/send'
import { roundSubmittedTemplate } from '@/lib/email/templates'
import { TOPICS } from '@/lib/email/topics'
import { withPerfLogging } from '@/lib/api-perf'
import type { RoundKey } from '@/app/pools/[pool_id]/types'

// =============================================================
// PUT /api/pools/:poolId/predictions/round - Submit round predictions
// =============================================================
async function handlePUT(
  request: NextRequest,
  { params }: { params: Promise<{ pool_id: string }> }
) {
  const { pool_id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, userData } = auth.data

  // Fetch additional user fields needed for confirmation email
  const { data: userProfile } = await supabase
    .from('users')
    .select('email, username, full_name')
    .eq('user_id', userData.user_id)
    .single()

  const { data: membership } = await supabase
    .from('pool_members')
    .select('member_id')
    .eq('pool_id', pool_id)
    .eq('user_id', userData.user_id)
    .single()

  if (!membership) return NextResponse.json({ error: 'Not a member' }, { status: 403 })

  const body = await request.json()
  const { entryId, roundKey } = body as { entryId: string; roundKey: string }

  if (!entryId || !roundKey) {
    return NextResponse.json({ error: 'entryId and roundKey are required' }, { status: 400 })
  }

  // Verify pool is progressive
  const { data: pool } = await supabase
    .from('pools')
    .select('prediction_mode, tournament_id, pool_name')
    .eq('pool_id', pool_id)
    .single()

  if (!pool || pool.prediction_mode !== 'progressive') {
    return NextResponse.json({ error: 'Pool is not in progressive mode' }, { status: 400 })
  }

  // Verify entry belongs to this user
  const { data: entry } = await supabase
    .from('pool_entries')
    .select('entry_id, entry_name')
    .eq('entry_id', entryId)
    .eq('member_id', membership.member_id)
    .single()

  if (!entry) return NextResponse.json({ error: 'Entry not found' }, { status: 404 })

  // Verify round is open and deadline hasn't passed
  const { data: roundState } = await supabase
    .from('pool_round_states')
    .select('*')
    .eq('pool_id', pool_id)
    .eq('round_key', roundKey)
    .single()

  if (!roundState) {
    return NextResponse.json({ error: 'Round not found' }, { status: 404 })
  }

  if (roundState.state !== 'open') {
    return NextResponse.json({ error: `Round is not open for predictions (current state: ${roundState.state})` }, { status: 403 })
  }

  if (roundState.deadline && new Date(roundState.deadline) < new Date()) {
    return NextResponse.json({ error: 'Round deadline has passed' }, { status: 403 })
  }

  // Check if already submitted for this round
  const { data: existingSubmission } = await supabase
    .from('entry_round_submissions')
    .select('id, has_submitted')
    .eq('entry_id', entryId)
    .eq('round_key', roundKey)
    .single()

  if (existingSubmission?.has_submitted) {
    return NextResponse.json({ error: 'Predictions already submitted for this round' }, { status: 403 })
  }

  // Get matches for this round
  const stages = ROUND_MATCH_STAGES[roundKey as RoundKey] ?? []
  const { data: roundMatches } = await supabase
    .from('matches')
    .select('match_id')
    .eq('tournament_id', pool.tournament_id)
    .in('stage', stages)

  const roundMatchIds = (roundMatches ?? []).map(m => m.match_id)
  const totalRoundMatches = roundMatchIds.length

  // Count predictions for this round's matches
  const { count: predictedCount } = await supabase
    .from('predictions')
    .select('*', { count: 'exact', head: true })
    .eq('entry_id', entryId)
    .in('match_id', roundMatchIds)

  if ((predictedCount ?? 0) < totalRoundMatches) {
    return NextResponse.json({
      error: `Not all matches predicted for this round. ${predictedCount}/${totalRoundMatches} completed.`,
      predicted: predictedCount,
      total: totalRoundMatches,
    }, { status: 400 })
  }

  // Create or update submission record
  const now = new Date().toISOString()
  if (existingSubmission) {
    await supabase
      .from('entry_round_submissions')
      .update({
        has_submitted: true,
        submitted_at: now,
        prediction_count: predictedCount ?? 0,
        updated_at: now,
      })
      .eq('id', existingSubmission.id)
  } else {
    await supabase
      .from('entry_round_submissions')
      .insert({
        entry_id: entryId,
        round_key: roundKey,
        has_submitted: true,
        submitted_at: now,
        prediction_count: predictedCount ?? 0,
      })
  }

  // Update last saved timestamp on pool_entries
  await supabase
    .from('pool_entries')
    .update({ predictions_last_saved_at: now })
    .eq('entry_id', entryId)

  // Send confirmation email (fire-and-forget)
  const roundName = ROUND_LABELS[roundKey as RoundKey] ?? roundKey
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://sportpool.io'
  const { subject, html } = roundSubmittedTemplate({
    userName: userProfile?.full_name || userProfile?.username,
    poolName: pool.pool_name,
    roundName,
    entryName: entry.entry_name || 'Entry',
    matchCount: predictedCount ?? 0,
    poolUrl: `${appUrl}/pools/${pool_id}?tab=predictions`,
  })
  sendEmail({
    to: userProfile?.email,
    subject,
    html,
    topicId: TOPICS.PREDICTIONS,
    tags: [{ name: 'category', value: 'round_submitted' }],
  }).catch(console.error)

  return NextResponse.json({
    submitted: true,
    roundKey,
    submittedAt: now,
    predictedCount: predictedCount ?? 0,
  })
}

export const PUT = withPerfLogging('/api/pools/[id]/predictions/round', handlePUT)
