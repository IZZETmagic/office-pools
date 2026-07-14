import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { withPerfLogging } from '@/lib/api-perf'
import {
  computeReveal,
  filterRevealedPredictions,
  type PredictionMode,
  type RevealResult,
  type RevealRoundState,
} from '@/lib/predictions/revealGate'

// =============================================================
// GET /api/pools/:poolId/entries/:entryId/predictions
//
// Returns another member's PREDICTIONS (the raw picks, not scores) for
// read-only viewing — the shared data spine for the "members see all
// predictions after lock" feature (drafts/2026-07-13_member_predictions_visibility.md).
//
// Authorization / reveal:
//   * caller must be a member of the pool,
//   * the entry must belong to the pool,
//   * a non-owner, non-admin caller only receives picks for scopes that are
//     LOCKED pool-wide (see lib/predictions/revealGate) — otherwise 403
//     { locked: true }. Nothing editable is ever revealed.
//   * the entry's OWNER, and pool ADMINS, may always read in full (admins
//     already have this via the existing admin replay + RLS admin-read policy).
//
// Reads use the service-role client AFTER these checks — the route logic is the
// gate, so this does not depend on (nor is it loosened by) row-level security.
// =============================================================

type PredictionRow = {
  prediction_id: string
  match_id: string
  predicted_home_score: number | null
  predicted_away_score: number | null
  predicted_home_pso: number | null
  predicted_away_pso: number | null
  predicted_winner_team_id: string | null
}

async function handleGET(
  request: NextRequest,
  { params }: { params: Promise<{ pool_id: string; entry_id: string }> },
) {
  const { pool_id, entry_id } = await params

  // 1. Authenticate.
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, userData } = auth.data

  // 2. Caller must be a member of the pool.
  const { data: membership } = await supabase
    .from('pool_members')
    .select('member_id, role')
    .eq('pool_id', pool_id)
    .eq('user_id', userData.user_id)
    .single()
  if (!membership) {
    return NextResponse.json({ error: 'Not a member of this pool' }, { status: 403 })
  }

  // 3. Pool — mode + deadline drive the reveal gate.
  const { data: pool } = await supabase
    .from('pools')
    .select('pool_id, tournament_id, prediction_mode, prediction_deadline')
    .eq('pool_id', pool_id)
    .single()
  if (!pool) return NextResponse.json({ error: 'Pool not found' }, { status: 404 })

  // 4. Entry must exist and belong to a member of THIS pool. Grab the owner's
  //    profile for the "whose entry" header both clients render.
  const { data: entry } = await supabase
    .from('pool_entries')
    .select('entry_id, member_id, entry_name, entry_number')
    .eq('entry_id', entry_id)
    .single()
  if (!entry) return NextResponse.json({ error: 'Entry not found' }, { status: 404 })

  const { data: entryMember } = await supabase
    .from('pool_members')
    .select('member_id, role, user_id, users(user_id, username, full_name)')
    .eq('member_id', entry.member_id)
    .eq('pool_id', pool_id)
    .single()
  if (!entryMember) {
    return NextResponse.json({ error: 'Entry does not belong to this pool' }, { status: 404 })
  }
  // Supabase types the joined `users` relation as an array; at runtime this
  // to-one FK is a single row (same handling as the sibling breakdown route).
  const owner = (
    entryMember as unknown as {
      users?: { user_id: string; username: string; full_name: string }
    }
  ).users

  const isOwnEntry = entry.member_id === membership.member_id
  const isPoolAdmin = membership.role === 'admin'

  // 5. Reveal gate. Owner + pool admins bypass it (they may always read in
  //    full); every other member only sees scopes that are locked pool-wide.
  const adminClient = createAdminClient()
  const mode = pool.prediction_mode as PredictionMode

  let roundStates: RevealRoundState[] = []
  if (mode === 'progressive') {
    const { data } = await adminClient
      .from('pool_round_states')
      .select('round_key, state, deadline')
      .eq('pool_id', pool_id)
    roundStates = (data ?? []) as RevealRoundState[]
  }

  const reveal: RevealResult =
    isOwnEntry || isPoolAdmin
      ? { revealed: true, scope: 'all' }
      : computeReveal(
          { prediction_mode: mode, prediction_deadline: pool.prediction_deadline },
          roundStates,
          new Date(),
        )

  if (!reveal.revealed) {
    return NextResponse.json(
      { locked: true, prediction_mode: mode, entry: { entry_id: entry.entry_id } },
      { status: 403 },
    )
  }

  const base = {
    entry: {
      entry_id: entry.entry_id,
      entry_name: entry.entry_name,
      entry_number: entry.entry_number,
      member_id: entry.member_id,
    },
    owner: {
      user_id: owner?.user_id ?? entryMember.user_id,
      full_name: owner?.full_name ?? 'Unknown',
      username: owner?.username ?? '',
    },
    prediction_mode: mode,
    is_own_entry: isOwnEntry,
    reveal,
  }

  // 6. Bracket-picker mode: return the three bracket tables (gated whole-entry
  //    on the deadline, so scope is always 'all' here).
  if (mode === 'bracket_picker') {
    const [groupRankings, thirdPlaceRankings, knockoutPicks] = await Promise.all([
      adminClient.from('bracket_picker_group_rankings').select('*').eq('entry_id', entry_id),
      adminClient.from('bracket_picker_third_place_rankings').select('*').eq('entry_id', entry_id),
      adminClient.from('bracket_picker_knockout_picks').select('*').eq('entry_id', entry_id),
    ])
    return NextResponse.json({
      ...base,
      bracketPicks: {
        groupRankings: groupRankings.data ?? [],
        thirdPlaceRankings: thirdPlaceRankings.data ?? [],
        knockoutPicks: knockoutPicks.data ?? [],
      },
    })
  }

  // 7. Score modes (full_tournament / progressive): predictions, filtered to
  //    revealed rounds for progressive.
  const { data: predictionsRaw } = await adminClient
    .from('predictions')
    .select(
      'prediction_id, match_id, predicted_home_score, predicted_away_score, predicted_home_pso, predicted_away_pso, predicted_winner_team_id',
    )
    .eq('entry_id', entry_id)

  let predictions = (predictionsRaw ?? []) as PredictionRow[]

  if (reveal.revealed && reveal.scope === 'rounds') {
    // Map each prediction's match -> stage (== progressive round_key) so we can
    // drop picks for rounds that are not yet locked.
    const { data: matchesRaw } = await adminClient
      .from('matches')
      .select('match_id, stage')
      .eq('tournament_id', pool.tournament_id)
    const stageById = new Map<string, string>()
    for (const m of matchesRaw ?? []) stageById.set(m.match_id, m.stage)
    predictions = filterRevealedPredictions(predictions, reveal, stageById)
  }

  return NextResponse.json({ ...base, predictions })
}

export const GET = withPerfLogging('/api/pools/[id]/entries/[id]/predictions', handleGET)
