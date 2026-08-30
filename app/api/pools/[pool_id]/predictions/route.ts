import { NextRequest, NextResponse } from 'next/server'
import { saveLeaguePredictions } from '@/lib/league/write'
import { requireAuth } from '@/lib/auth'
import { sendEmail } from '@/lib/email/send'
import { predictionsSubmittedTemplate } from '@/lib/email/templates'
import { TOPICS } from '@/lib/email/topics'
import { withPerfLogging } from '@/lib/api-perf'

// =============================================================
// GET /api/pools/:poolId/predictions - Get prediction status
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

  // Get entry_id from query param, or default to first entry
  const { searchParams } = new URL(request.url)
  const entryId = searchParams.get('entryId')

  let entry: any
  if (entryId) {
    const { data } = await supabase
      .from('pool_entries')
      .select('*')
      .eq('entry_id', entryId)
      .eq('member_id', membership.member_id)
      .single()
    entry = data
  } else {
    const { data } = await supabase
      .from('pool_entries')
      .select('*')
      .eq('member_id', membership.member_id)
      .order('entry_number', { ascending: true })
      .limit(1)
      .single()
    entry = data
  }

  if (!entry) return NextResponse.json({ error: 'Entry not found' }, { status: 404 })

  // Count predictions for this entry
  const { count: predicted } = await supabase
    .from('predictions')
    .select('*', { count: 'exact', head: true })
    .eq('entry_id', entry.entry_id)

  // Get pool details for deadline
  const { data: pool } = await supabase
    .from('pools')
    .select('prediction_deadline, tournament_id, prediction_mode')
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

  // For progressive mode, include round-level status
  let roundStatus = null
  if (pool?.prediction_mode === 'progressive') {
    const { data: roundStates } = await supabase
      .from('pool_round_states')
      .select('*')
      .eq('pool_id', pool_id)
      .order('created_at', { ascending: true })

    const { data: roundSubmissions } = await supabase
      .from('entry_round_submissions')
      .select('*')
      .eq('entry_id', entry.entry_id)

    const currentRound = (roundStates ?? []).find(rs => rs.state === 'open') ?? null
    const currentRoundDeadline = currentRound?.deadline ?? null
    const isPastRoundDeadline = currentRoundDeadline
      ? new Date(currentRoundDeadline) < new Date()
      : false

    roundStatus = {
      roundStates: roundStates ?? [],
      roundSubmissions: roundSubmissions ?? [],
      currentRound,
      isPastRoundDeadline,
    }
  }

  const canEdit = pool?.prediction_mode === 'progressive'
    ? !entry.predictions_locked // Progressive: per-round edit checks done separately
    : !entry.has_submitted_predictions && !entry.predictions_locked && !isPastDeadline

  return NextResponse.json({
    status: entry.has_submitted_predictions ? 'submitted' : 'draft',
    predicted: predicted ?? 0,
    total: total ?? 0,
    lastSaved: entry.predictions_last_saved_at,
    submittedAt: entry.predictions_submitted_at,
    canEdit,
    isLocked: entry.predictions_locked,
    isPastDeadline,
    entryId: entry.entry_id,
    entryName: entry.entry_name,
    predictionMode: pool?.prediction_mode ?? 'full_tournament',
    ...(roundStatus ? { roundStatus } : {}),
  })
}

// =============================================================
// POST /api/pools/:poolId/predictions - Save predictions (draft)
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

  // Check pool deadline
  const { data: pool } = await supabase
    .from('pools')
    .select('prediction_deadline, prediction_mode, league_season_id, league_depth')
    .eq('pool_id', pool_id)
    .single()

  // A league pool has no pool-wide deadline gate. Each matchweek locks at its
  // own first kickoff, enforced in the database by
  // enforce_league_prediction_before_lock — so the check below would either be
  // a no-op or, worse, close the whole season off one date.
  if (pool?.league_season_id) {
    // fall through to the league branch after the body is parsed
  } else if (pool?.prediction_mode === 'progressive') {
    // For progressive mode, check round-specific deadline
    // The roundKey is sent in the body, but we read it after parsing
    // For now, we validate after parsing the body below
  } else {
    const isPastDeadline = pool?.prediction_deadline
      ? new Date(pool.prediction_deadline) < new Date()
      : false

    if (isPastDeadline) {
      return NextResponse.json({ error: 'Prediction deadline has passed' }, { status: 403 })
    }
  }

  const body = await request.json()
  const { predictions, entryId, roundKey } = body as {
    entryId: string
    roundKey?: string
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

  if (!entryId) {
    return NextResponse.json({ error: 'entryId is required' }, { status: 400 })
  }

  // For progressive mode, validate round-specific deadline
  if (pool?.prediction_mode === 'progressive' && roundKey) {
    const { data: roundState } = await supabase
      .from('pool_round_states')
      .select('state, deadline')
      .eq('pool_id', pool_id)
      .eq('round_key', roundKey)
      .single()

    if (roundState) {
      if (roundState.state !== 'open') {
        return NextResponse.json({ error: `Round is not open for predictions` }, { status: 403 })
      }
      if (roundState.deadline && new Date(roundState.deadline) < new Date()) {
        return NextResponse.json({ error: 'Round deadline has passed' }, { status: 403 })
      }
    }

    // ⚠ NO "already submitted for this round" REJECTION, and its absence is the
    // point. Submission is no longer an act that closes a round — it is a
    // consequence of having saved (see the write below). The two clauses above
    // are the whole gate: the round must be open, and its deadline must not
    // have passed. That is also exactly what the database says, via
    // trg_enforce_prediction_before_kickoff.
    //
    // Entries carrying an `entry_round_submissions` row from the old manual
    // flow still exist in production. Rejecting on it would freeze precisely
    // those members out of edits the deadline still allows.
  }

  // Verify entry belongs to this user
  const { data: entry } = await supabase
    .from('pool_entries')
    .select('entry_id, has_submitted_predictions, predictions_submitted_at, predictions_locked')
    .eq('entry_id', entryId)
    .eq('member_id', membership.member_id)
    .single()

  if (!entry) return NextResponse.json({ error: 'Entry not found' }, { status: 404 })

  // ⚠ THIS IS WHERE THE OLD "Predictions already submitted" 403 WAS, and it had
  // to go in the SAME change that starts writing `has_submitted_predictions` on
  // save (see below). It refused a save whenever the flag was set, so with the
  // flag now set by the FIRST save, keeping it would have rejected every
  // member's SECOND save — the whole flow, dead, on a 403 nobody would connect
  // back to this line. Deleting it is not a relaxation of the lock; the lock
  // moved to the deadline, which is checked above and again by the database.
  if (entry.predictions_locked) {
    return NextResponse.json({ error: 'Predictions are locked' }, { status: 403 })
  }

  if (!predictions || !Array.isArray(predictions)) {
    return NextResponse.json({ error: 'Invalid predictions data' }, { status: 400 })
  }

  // ---------------------------------------------------------------- league
  // Picks live in `league_predictions`, not `predictions`. Everything above
  // this point — auth, membership, entry ownership — applies to both paths and
  // is deliberately shared; only the storage differs.
  //
  // The response shape is IDENTICAL to the World Cup path's, because the same
  // component consumes both. The one addition is `rejected`, which exists
  // because the league lock is a silent-skip trigger: a refused pick is not an
  // error, the row simply is not written, so the route reads back rather than
  // assuming.
  if (pool?.league_season_id) {
    // Results depth stores a TAP, Scores depth stores a scoreline, and the two
    // are mutually exclusive in the database (league_predictions_shape_ck).
    //
    // ⚠ The shape is enforced against the POOL'S DEPTH here, not just against
    // the CHECK. A scoreline reaching a Results pool would satisfy the CHECK
    // perfectly — and then score zero forever, because the engine's Results arm
    // compares `predicted_outcome = <actual>` and a NULL comparison is never
    // true. The member would be silently unscoreable with no error anywhere.
    // Depth is immutable per pool, so this is a fixed expectation, not a guess.
    const wantsOutcome = pool.league_depth === 'results'
    type Incoming = { matchId: string; homeScore?: number; awayScore?: number; outcome?: string }
    const rows = predictions as Incoming[]

    const wrongShape = rows.filter((p) =>
      wantsOutcome ? p.outcome == null : p.outcome != null,
    )
    if (wrongShape.length > 0) {
      return NextResponse.json(
        {
          error: wantsOutcome
            ? 'This pool is played by picking a winner, not a scoreline.'
            : 'This pool is played by predicting the score, not just a winner.',
        },
        { status: 400 },
      )
    }

    const result = await saveLeaguePredictions(supabase, {
      entryId,
      seasonId: pool.league_season_id as string,
      picks: rows.map((p) =>
        wantsOutcome
          ? { matchId: p.matchId, outcome: p.outcome as 'home' | 'draw' | 'away' }
          : { matchId: p.matchId, homeScore: p.homeScore as number, awayScore: p.awayScore as number },
      ),
    })

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    if (result.rejected.length > 0) {
      // 409, not 200-with-a-note: the member is looking at values the database
      // does not hold, and silently returning `saved: true` is how they find out
      // in a week that their picks were never there.
      return NextResponse.json(
        {
          error:
            result.rejected.length === predictions.length
              ? 'That matchweek has locked — its picks can no longer be changed.'
              : `${result.rejected.length} of ${predictions.length} picks could not be saved because their matchweek has locked.`,
          saved: result.accepted > 0,
          rejectedMatchIds: result.rejected.map((r) => r.matchId),
          progress: { predicted: result.predicted },
        },
        { status: 409 },
      )
    }

    return NextResponse.json({
      saved: true,
      insertedIds: [],
      progress: { predicted: result.predicted },
      lastSaved: new Date().toISOString(),
    })
  }

  const toUpsert: any[] = []

  for (const pred of predictions) {
    toUpsert.push({
      entry_id: entryId,
      match_id: pred.matchId,
      predicted_home_score: pred.homeScore,
      predicted_away_score: pred.awayScore,
      predicted_home_pso: pred.homePso ?? null,
      predicted_away_pso: pred.awayPso ?? null,
      predicted_winner_team_id: pred.winnerTeamId ?? null,
    })
  }

  const insertedIds: { match_id: string; prediction_id: string }[] = []
  let predicted = 0

  // Single round-trip: upsert + last-saved timestamp + prediction count via
  // the save_predictions_batch RPC. This is the hottest write path in the
  // app — the previous three sequential calls per auto-save are what buried
  // the DB during the opening-day pick rush. SECURITY INVOKER, so RLS
  // enforces ownership exactly as it did for the separate statements.
  if (toUpsert.length > 0) {
    const { data: saved, error: saveError } = await supabase.rpc('save_predictions_batch', {
      p_entry_id: entryId,
      p_predictions: toUpsert,
    })

    if (saveError) {
      return NextResponse.json({ error: saveError.message }, { status: 500 })
    }
    insertedIds.push(...((saved?.inserted ?? []) as { match_id: string; prediction_id: string }[]))
    predicted = saved?.predicted ?? 0

    // =====================================================================
    // SAVING IS SUBMITTING.
    // =====================================================================
    // There is no submit button any more — picks save as they are made and
    // lock at the deadline. But `has_submitted_predictions` is not cosmetic:
    // it is the column ~8 SQL functions in the scoring engine read to decide
    // which entries to score (migrations 028, 030, 032, 034, 039, 046). If
    // nothing set it, an entry would score nothing until the deadline sweep
    // in lib/auto-submit.ts got to it.
    //
    // So the flag keeps meaning exactly what the engine already assumes —
    // THIS ENTRY HAS PICKS WORTH SCORING — and the first save is what makes
    // that true. That is the whole reason this is written here rather than
    // the engine being taught to count picks: the engine stays closed.
    //
    // ⚠ NEVER FOR A LEAGUE POOL. The league branch returns above, at the
    // `pool.league_season_id` early return, so this line is structurally
    // unreachable for one — which is deliberate and must stay that way.
    // lib/league/write.ts names this column as one of the two doors by which
    // a league entry could walk into the World Cup scoring selectors; the
    // vertical slice forbids the league path writing it, and it is NULL for
    // every league entry in production.
    //
    // ⚠ GUARDED IN JS, ON THE ROW ALREADY FETCHED ABOVE — not by adding WHERE
    // clauses to an unconditional UPDATE. The comment on the RPC three lines up
    // is not decoration: this is the hottest write path in the app, and three
    // sequential statements per auto-save is what buried the database during
    // the opening-day pick rush. Auto-save fires every 500 ms of editing, so an
    // unconditional write here would be a new statement on every keystroke-ish
    // event, for a column that can only change once. This costs one UPDATE on
    // an entry's FIRST save and nothing at all on every save after it.
    //
    // Both columns move in that single statement. `predictions_submitted_at` is
    // a RANK TIEBREAKER, so it must mark one moment per entry rather than
    // travel with each save — it now records the first save instead of the
    // press of a button, which breaks ties towards whoever picked first rather
    // than whoever confirmed first. A deliberate change of meaning.
    //
    // The NULL check is `!entry.has_submitted_predictions`, not `=== false`:
    // the column is nullable and a NULL would slip past an equality test,
    // leaving the entry permanently unscoreable with nothing to show for it.
    if (!entry.has_submitted_predictions) {
      await supabase
        .from('pool_entries')
        .update({
          has_submitted_predictions: true,
          ...(entry.predictions_submitted_at
            ? {}
            : { predictions_submitted_at: new Date().toISOString() }),
        })
        .eq('entry_id', entryId)
    }
  } else {
    const { count } = await supabase
      .from('predictions')
      .select('*', { count: 'exact', head: true })
      .eq('entry_id', entryId)
    predicted = count ?? 0
  }

  return NextResponse.json({
    saved: true,
    insertedIds,
    progress: { predicted },
    lastSaved: new Date().toISOString(),
  })
}

// =============================================================
// PUT /api/pools/:poolId/predictions - Submit final predictions
// =============================================================
// ⚠ DEPRECATED 2026-08-29 — nothing in this repo calls it any more.
//
// Submitting stopped being an act: picks save as they are made, the POST above
// sets `has_submitted_predictions` on the first save, and the deadline is the
// only thing that closes an entry. This handler is now a no-op in every field
// that matters — it sets a flag the save path has already set.
//
// It is KEPT rather than deleted for one reason: a browser holding a cached
// bundle from before this deploy will still call it, and a 404 there would
// surface as "failed to submit" on a screen whose picks are in fact saved.
// Delete it once no such client can plausibly remain.
//
// It is idempotent and no longer locks anything, so an old client calling it
// changes nothing an entry has not already got.
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
  const { entryId } = body as { entryId: string }

  if (!entryId) {
    return NextResponse.json({ error: 'entryId is required' }, { status: 400 })
  }

  // Verify entry belongs to this user
  const { data: entry } = await supabase
    .from('pool_entries')
    .select('entry_id, entry_name, has_submitted_predictions, predictions_submitted_at')
    .eq('entry_id', entryId)
    .eq('member_id', membership.member_id)
    .single()

  if (!entry) return NextResponse.json({ error: 'Entry not found' }, { status: 404 })

  // ⚠ 200, NOT THE 403 THIS USED TO RETURN.
  //
  // The flag is now set by the first SAVE, so an old cached client reaching
  // this line has already had its picks stored — every time, not occasionally.
  // A 403 here would put "Predictions already submitted" on a screen whose
  // picks are safely saved, which is precisely the confusion this route was
  // kept alive to prevent. It answers with the truth instead: yes, submitted,
  // and here is when.
  if (entry.has_submitted_predictions) {
    return NextResponse.json({
      submitted: true,
      submittedAt: entry.predictions_submitted_at,
    })
  }

  // Check pool deadline
  const { data: pool } = await supabase
    .from('pools')
    .select('prediction_deadline, tournament_id, pool_name')
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
    .eq('entry_id', entryId)

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
    .from('pool_entries')
    .update({
      has_submitted_predictions: true,
      predictions_submitted_at: now,
      predictions_last_saved_at: now,
    })
    .eq('entry_id', entryId)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  // Send confirmation email (fire-and-forget)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://sportpool.io'
  const { subject, html } = predictionsSubmittedTemplate({
    userName: userProfile?.full_name || userProfile?.username,
    poolName: pool?.pool_name || 'your pool',
    entryName: entry.entry_name || 'Entry',
    matchCount: predicted ?? 0,
    poolUrl: `${appUrl}/pools/${pool_id}`,
  })
  sendEmail({
    to: userProfile?.email,
    subject,
    html,
    topicId: TOPICS.PREDICTIONS,
    tags: [{ name: 'category', value: 'predictions' }],
  }).catch(console.error)

  return NextResponse.json({
    submitted: true,
    submittedAt: now,
  })
}

export const GET = withPerfLogging('/api/pools/[id]/predictions', handleGET)
export const POST = withPerfLogging('/api/pools/[id]/predictions', handlePOST)
export const PUT = withPerfLogging('/api/pools/[id]/predictions', handlePUT)
