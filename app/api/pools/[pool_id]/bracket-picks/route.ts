import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { sendEmail } from '@/lib/email/send'
import { predictionsSubmittedTemplate } from '@/lib/email/templates'
import { TOPICS } from '@/lib/email/topics'
import { withPerfLogging } from '@/lib/api-perf'

// =============================================================
// GET /api/pools/:poolId/bracket-picks - Load bracket picker data
// =============================================================
async function handleGET(
  request: NextRequest,
  { params }: { params: Promise<{ pool_id: string }> }
) {
  const { pool_id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, userData } = auth.data

  const { data: membership } = await supabase
    .from('pool_members')
    .select('member_id')
    .eq('pool_id', pool_id)
    .eq('user_id', userData.user_id)
    .single()
  if (!membership) return NextResponse.json({ error: 'Not a member' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const entryId = searchParams.get('entry_id')
  if (!entryId) return NextResponse.json({ error: 'entry_id required' }, { status: 400 })

  // Verify entry exists and belongs to a member in this pool
  const { data: entry } = await supabase
    .from('pool_entries')
    .select('entry_id, has_submitted_predictions, member_id, pool_members!inner(pool_id)')
    .eq('entry_id', entryId)
    .eq('pool_members.pool_id', pool_id)
    .single()
  if (!entry) return NextResponse.json({ error: 'Entry not found' }, { status: 404 })

  // Non-admins can only view their own entries
  if (entry.member_id !== membership.member_id) {
    const { data: adminCheck } = await supabase
      .from('pool_members')
      .select('role')
      .eq('member_id', membership.member_id)
      .single()
    if (adminCheck?.role !== 'admin') {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
    }
  }

  // Fetch all bracket picker data
  const [groupRankings, thirdPlaceRankings, knockoutPicks] = await Promise.all([
    supabase
      .from('bracket_picker_group_rankings')
      .select('*')
      .eq('entry_id', entryId),
    supabase
      .from('bracket_picker_third_place_rankings')
      .select('*')
      .eq('entry_id', entryId),
    supabase
      .from('bracket_picker_knockout_picks')
      .select('*')
      .eq('entry_id', entryId),
  ])

  return NextResponse.json({
    groupRankings: groupRankings.data ?? [],
    thirdPlaceRankings: thirdPlaceRankings.data ?? [],
    knockoutPicks: knockoutPicks.data ?? [],
  })
}

// =============================================================
// POST /api/pools/:poolId/bracket-picks - Save draft (auto-save)
// =============================================================
async function handlePOST(
  request: NextRequest,
  { params }: { params: Promise<{ pool_id: string }> }
) {
  const { pool_id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, userData } = auth.data

  const { data: membership } = await supabase
    .from('pool_members')
    .select('member_id')
    .eq('pool_id', pool_id)
    .eq('user_id', userData.user_id)
    .single()
  if (!membership) return NextResponse.json({ error: 'Not a member' }, { status: 403 })

  // Verify pool is bracket_picker mode
  const { data: pool } = await supabase
    .from('pools')
    .select('prediction_mode, prediction_deadline')
    .eq('pool_id', pool_id)
    .single()
  if (!pool || pool.prediction_mode !== 'bracket_picker') {
    return NextResponse.json({ error: 'Pool is not bracket picker mode' }, { status: 400 })
  }

  // Check deadline
  if (pool.prediction_deadline && new Date(pool.prediction_deadline) < new Date()) {
    return NextResponse.json({ error: 'Deadline has passed' }, { status: 403 })
  }

  const body = await request.json()
  const { entry_id, group_rankings, third_place_rankings, knockout_picks } = body

  if (!entry_id) return NextResponse.json({ error: 'entry_id required' }, { status: 400 })

  // Verify entry belongs to member and isn't submitted
  const { data: entry } = await supabase
    .from('pool_entries')
    .select('entry_id, has_submitted_predictions, predictions_locked')
    .eq('entry_id', entry_id)
    .eq('member_id', membership.member_id)
    .single()
  if (!entry) return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
  if (entry.has_submitted_predictions) {
    return NextResponse.json({ error: 'Predictions already submitted' }, { status: 403 })
  }
  if (entry.predictions_locked) {
    return NextResponse.json({ error: 'Predictions are locked' }, { status: 403 })
  }

  // Save all bracket picks atomically via RPC (prevents race conditions on concurrent auto-saves)
  const { error: rpcError } = await supabase.rpc('save_bracket_picks', {
    p_entry_id: entry_id,
    p_group_rankings: (group_rankings ?? []).map((r: { team_id: string; group_letter: string; predicted_position: number }) => ({
      team_id: r.team_id,
      group_letter: r.group_letter,
      predicted_position: r.predicted_position,
    })),
    p_third_place_rankings: (third_place_rankings ?? []).map((r: { team_id: string; group_letter: string; rank: number }) => ({
      team_id: r.team_id,
      group_letter: r.group_letter,
      rank: r.rank,
    })),
    p_knockout_picks: (knockout_picks ?? []).map((p: { match_id: string; match_number: number; winner_team_id: string; predicted_penalty: boolean }) => ({
      match_id: p.match_id,
      match_number: p.match_number,
      winner_team_id: p.winner_team_id,
      predicted_penalty: p.predicted_penalty ?? false,
    })),
  })

  if (rpcError) {
    console.error('Failed to save bracket picks:', rpcError)
    return NextResponse.json({ error: 'Failed to save bracket picks: ' + rpcError.message }, { status: 500 })
  }

  // Update last saved timestamp
  await supabase
    .from('pool_entries')
    .update({ predictions_last_saved_at: new Date().toISOString() })
    .eq('entry_id', entry_id)

  return NextResponse.json({ saved: true, lastSaved: new Date().toISOString() })
}

// =============================================================
// PUT /api/pools/:poolId/bracket-picks - Submit (lock predictions)
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
    .select('email, full_name, username')
    .eq('user_id', userData.user_id)
    .single()

  const { data: membership } = await supabase
    .from('pool_members')
    .select('member_id')
    .eq('pool_id', pool_id)
    .eq('user_id', userData.user_id)
    .single()
  if (!membership) return NextResponse.json({ error: 'Not a member' }, { status: 403 })

  const { data: pool } = await supabase
    .from('pools')
    .select('pool_name, prediction_mode, prediction_deadline, tournament_id')
    .eq('pool_id', pool_id)
    .single()
  if (!pool || pool.prediction_mode !== 'bracket_picker') {
    return NextResponse.json({ error: 'Pool is not bracket picker mode' }, { status: 400 })
  }

  if (pool.prediction_deadline && new Date(pool.prediction_deadline) < new Date()) {
    return NextResponse.json({ error: 'Deadline has passed' }, { status: 403 })
  }

  const body = await request.json()
  const { entry_id } = body
  if (!entry_id) return NextResponse.json({ error: 'entry_id required' }, { status: 400 })

  const { data: entry } = await supabase
    .from('pool_entries')
    .select('entry_id, has_submitted_predictions, predictions_locked')
    .eq('entry_id', entry_id)
    .eq('member_id', membership.member_id)
    .single()
  if (!entry) return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
  if (entry.has_submitted_predictions) {
    return NextResponse.json({ error: 'Already submitted' }, { status: 400 })
  }

  // Validate completeness
  const [grCount, tpCount, kpCount] = await Promise.all([
    supabase.from('bracket_picker_group_rankings').select('*', { count: 'exact', head: true }).eq('entry_id', entry_id),
    supabase.from('bracket_picker_third_place_rankings').select('*', { count: 'exact', head: true }).eq('entry_id', entry_id),
    supabase.from('bracket_picker_knockout_picks').select('*', { count: 'exact', head: true }).eq('entry_id', entry_id),
  ])

  const groupCount = grCount.count ?? 0
  const thirdCount = tpCount.count ?? 0
  const knockoutCount = kpCount.count ?? 0

  if (groupCount < 48) {
    return NextResponse.json({ error: `Incomplete group rankings: ${groupCount}/48` }, { status: 400 })
  }
  if (thirdCount < 12) {
    return NextResponse.json({ error: `Incomplete third-place rankings: ${thirdCount}/12` }, { status: 400 })
  }
  if (knockoutCount < 32) {
    return NextResponse.json({ error: `Incomplete knockout picks: ${knockoutCount}/32` }, { status: 400 })
  }

  // Mark as submitted
  const { error: updateError } = await supabase
    .from('pool_entries')
    .update({
      has_submitted_predictions: true,
      predictions_submitted_at: new Date().toISOString(),
      predictions_last_saved_at: new Date().toISOString(),
    })
    .eq('entry_id', entry_id)

  if (updateError) {
    return NextResponse.json({ error: 'Failed to submit: ' + updateError.message }, { status: 500 })
  }

  // Send confirmation email
  try {
    if (userProfile?.email) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://sportpool.io'
      const { subject, html } = predictionsSubmittedTemplate({
        userName: userProfile.full_name || userProfile.username || 'there',
        poolName: pool.pool_name,
        entryName: 'Bracket Picks',
        matchCount: groupCount + thirdCount + knockoutCount,
        poolUrl: `${appUrl}/pools/${pool_id}`,
      })
      await sendEmail({
        to: userProfile.email,
        subject,
        html,
        topicId: TOPICS.PREDICTIONS,
        tags: [{ name: 'category', value: 'bracket-picks-submitted' }],
      })
    }
  } catch (emailErr) {
    console.error('Failed to send confirmation email:', emailErr)
  }

  return NextResponse.json({ submitted: true })
}

export const GET = withPerfLogging('/api/pools/[id]/bracket-picks', handleGET)
export const POST = withPerfLogging('/api/pools/[id]/bracket-picks', handlePOST)
export const PUT = withPerfLogging('/api/pools/[id]/bracket-picks', handlePUT)
