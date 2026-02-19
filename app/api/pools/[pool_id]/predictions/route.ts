import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// =============================================================
// GET /api/pools/:poolId/predictions - Get prediction status
// =============================================================
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ pool_id: string }> }
) {
  const { pool_id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userData } = await supabase
    .from('users')
    .select('user_id')
    .eq('auth_user_id', user.id)
    .single()

  if (!userData) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const { data: membership } = await supabase
    .from('pool_members')
    .select('member_id, has_submitted_predictions, predictions_submitted_at, predictions_locked, predictions_last_saved_at')
    .eq('pool_id', pool_id)
    .eq('user_id', userData.user_id)
    .single()

  if (!membership) return NextResponse.json({ error: 'Not a member' }, { status: 403 })

  // Count predictions for this member
  const { count: predicted } = await supabase
    .from('predictions')
    .select('*', { count: 'exact', head: true })
    .eq('member_id', membership.member_id)

  // Get pool details for deadline
  const { data: pool } = await supabase
    .from('pools')
    .select('prediction_deadline, tournament_id')
    .eq('pool_id', pool_id)
    .single()

  // Count total matches
  const { count: total } = await supabase
    .from('matches')
    .select('*', { count: 'exact', head: true })
    .eq('tournament_id', pool?.tournament_id)

  const isPastDeadline = pool?.prediction_deadline
    ? new Date(pool.prediction_deadline) < new Date()
    : false

  const canEdit = !membership.has_submitted_predictions && !membership.predictions_locked && !isPastDeadline

  return NextResponse.json({
    status: membership.has_submitted_predictions ? 'submitted' : 'draft',
    predicted: predicted ?? 0,
    total: total ?? 0,
    lastSaved: membership.predictions_last_saved_at,
    submittedAt: membership.predictions_submitted_at,
    canEdit,
    isLocked: membership.predictions_locked,
    isPastDeadline,
  })
}

// =============================================================
// POST /api/pools/:poolId/predictions - Save predictions (draft)
// =============================================================
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ pool_id: string }> }
) {
  const { pool_id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userData } = await supabase
    .from('users')
    .select('user_id')
    .eq('auth_user_id', user.id)
    .single()

  if (!userData) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const { data: membership } = await supabase
    .from('pool_members')
    .select('member_id, has_submitted_predictions, predictions_locked')
    .eq('pool_id', pool_id)
    .eq('user_id', userData.user_id)
    .single()

  if (!membership) return NextResponse.json({ error: 'Not a member' }, { status: 403 })

  // Check pool deadline
  const { data: pool } = await supabase
    .from('pools')
    .select('prediction_deadline')
    .eq('pool_id', pool_id)
    .single()

  const isPastDeadline = pool?.prediction_deadline
    ? new Date(pool.prediction_deadline) < new Date()
    : false

  if (isPastDeadline) {
    return NextResponse.json({ error: 'Prediction deadline has passed' }, { status: 403 })
  }

  if (membership.has_submitted_predictions) {
    return NextResponse.json({ error: 'Predictions already submitted' }, { status: 403 })
  }

  if (membership.predictions_locked) {
    return NextResponse.json({ error: 'Predictions are locked' }, { status: 403 })
  }

  const body = await request.json()
  const { predictions } = body as {
    predictions: {
      matchId: string
      predictionId?: string
      homeScore: number
      awayScore: number
      homePso?: number | null
      awayPso?: number | null
      winnerTeamId?: string | null
    }[]
  }

  if (!predictions || !Array.isArray(predictions)) {
    return NextResponse.json({ error: 'Invalid predictions data' }, { status: 400 })
  }

  const toInsert: any[] = []
  const toUpdate: any[] = []

  for (const pred of predictions) {
    if (pred.predictionId) {
      toUpdate.push({
        prediction_id: pred.predictionId,
        predicted_home_score: pred.homeScore,
        predicted_away_score: pred.awayScore,
        predicted_home_pso: pred.homePso ?? null,
        predicted_away_pso: pred.awayPso ?? null,
        predicted_winner_team_id: pred.winnerTeamId ?? null,
      })
    } else {
      toInsert.push({
        member_id: membership.member_id,
        match_id: pred.matchId,
        predicted_home_score: pred.homeScore,
        predicted_away_score: pred.awayScore,
        predicted_home_pso: pred.homePso ?? null,
        predicted_away_pso: pred.awayPso ?? null,
        predicted_winner_team_id: pred.winnerTeamId ?? null,
      })
    }
  }

  const insertedIds: { match_id: string; prediction_id: string }[] = []

  if (toInsert.length > 0) {
    const { data: inserted, error: insertError } = await supabase
      .from('predictions')
      .insert(toInsert)
      .select('match_id, prediction_id')

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }
    if (inserted) insertedIds.push(...inserted)
  }

  for (const pred of toUpdate) {
    const { error: updateError } = await supabase
      .from('predictions')
      .update({
        predicted_home_score: pred.predicted_home_score,
        predicted_away_score: pred.predicted_away_score,
        predicted_home_pso: pred.predicted_home_pso,
        predicted_away_pso: pred.predicted_away_pso,
        predicted_winner_team_id: pred.predicted_winner_team_id,
      })
      .eq('prediction_id', pred.prediction_id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }
  }

  // Update last saved timestamp
  await supabase
    .from('pool_members')
    .update({ predictions_last_saved_at: new Date().toISOString() })
    .eq('member_id', membership.member_id)

  // Get updated prediction count
  const { count: predicted } = await supabase
    .from('predictions')
    .select('*', { count: 'exact', head: true })
    .eq('member_id', membership.member_id)

  return NextResponse.json({
    saved: true,
    insertedIds,
    progress: { predicted: predicted ?? 0 },
    lastSaved: new Date().toISOString(),
  })
}

// =============================================================
// PUT /api/pools/:poolId/predictions - Submit final predictions
// =============================================================
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ pool_id: string }> }
) {
  const { pool_id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userData } = await supabase
    .from('users')
    .select('user_id')
    .eq('auth_user_id', user.id)
    .single()

  if (!userData) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const { data: membership } = await supabase
    .from('pool_members')
    .select('member_id, has_submitted_predictions, predictions_locked')
    .eq('pool_id', pool_id)
    .eq('user_id', userData.user_id)
    .single()

  if (!membership) return NextResponse.json({ error: 'Not a member' }, { status: 403 })

  if (membership.has_submitted_predictions) {
    return NextResponse.json({ error: 'Predictions already submitted' }, { status: 403 })
  }

  // Check pool deadline
  const { data: pool } = await supabase
    .from('pools')
    .select('prediction_deadline, tournament_id')
    .eq('pool_id', pool_id)
    .single()

  const isPastDeadline = pool?.prediction_deadline
    ? new Date(pool.prediction_deadline) < new Date()
    : false

  if (isPastDeadline) {
    return NextResponse.json({ error: 'Prediction deadline has passed' }, { status: 403 })
  }

  // Validate all matches have predictions
  const { count: predicted } = await supabase
    .from('predictions')
    .select('*', { count: 'exact', head: true })
    .eq('member_id', membership.member_id)

  const { count: total } = await supabase
    .from('matches')
    .select('*', { count: 'exact', head: true })
    .eq('tournament_id', pool?.tournament_id)

  if ((predicted ?? 0) < (total ?? 0)) {
    return NextResponse.json({
      error: `Not all matches predicted. ${predicted}/${total} completed.`,
      predicted,
      total,
    }, { status: 400 })
  }

  // Mark as submitted
  const now = new Date().toISOString()
  const { error: updateError } = await supabase
    .from('pool_members')
    .update({
      has_submitted_predictions: true,
      predictions_submitted_at: now,
      predictions_last_saved_at: now,
    })
    .eq('member_id', membership.member_id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({
    submitted: true,
    submittedAt: now,
  })
}
