import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { seedPoolRoundStates } from '@/lib/poolRoundStates'

const SCORING_DEFAULTS = {
  group_exact_score: 100,
  group_correct_difference: 75,
  group_correct_result: 50,
  knockout_exact_score: 200,
  knockout_correct_difference: 150,
  knockout_correct_result: 100,
  round_16_multiplier: 2,
  quarter_final_multiplier: 3,
  semi_final_multiplier: 4,
  third_place_multiplier: 4,
  final_multiplier: 8,
  pso_enabled: true,
  pso_exact_score: 100,
  pso_correct_difference: 75,
  pso_correct_result: 50,
  bonus_group_winner_and_runnerup: 150,
  bonus_group_winner_only: 100,
  bonus_group_runnerup_only: 50,
  bonus_both_qualify_swapped: 75,
  bonus_one_qualifies_wrong_position: 25,
  bonus_all_16_qualified: 75,
  bonus_12_15_qualified: 50,
  bonus_8_11_qualified: 25,
  bonus_correct_bracket_pairing: 50,
  bonus_match_winner_correct: 50,
  bonus_champion_correct: 1000,
  bonus_second_place_correct: 25,
  bonus_third_place_correct: 25,
  bonus_best_player_correct: 100,
  bonus_top_scorer_correct: 100,
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { userData } = auth.data

  const body = await request.json()
  const {
    pool_name,
    description,
    tournament_id,
    league_season_id,
    prediction_deadline,
    prediction_mode,
    is_private,
    max_participants,
    max_entries_per_user,
  } = body

  if (!pool_name?.trim()) {
    return NextResponse.json({ error: 'Pool name is required.' }, { status: 400 })
  }
  if (!tournament_id && !league_season_id) {
    return NextResponse.json({ error: 'A competition is required.' }, { status: 400 })
  }

  const adminClient = createAdminClient()

  // A league pool carries BOTH ids in the vertical slice — see
  // drafts/2026-08-22_league_vertical_slice.md §1. `tournament_id` stays
  // populated so the ~50 World Cup code paths that read it keep working
  // unchanged; `league_season_id` is what the league path reads.
  //
  // The placeholder tournament is resolved SERVER-SIDE from the season rather
  // than taken from the client: the two must agree, and until the full L4 lands
  // the XOR nothing in the database enforces that. Trusting a client-supplied
  // pair is how they would drift.
  let resolvedTournamentId: string | null = tournament_id ?? null
  let resolvedMode: string = prediction_mode
  let resolvedDeadline: string | null = prediction_deadline ?? null

  if (league_season_id) {
    const { data: season, error: seasonErr } = await adminClient
      .from('league_seasons')
      .select('season_id, competition_name, season_label, external_league_id, external_season, external_provider')
      .eq('season_id', league_season_id)
      .maybeSingle()
    if (seasonErr) {
      return NextResponse.json({ error: `Could not read the league season: ${seasonErr.message}` }, { status: 500 })
    }
    if (!season) {
      return NextResponse.json({ error: 'That league season does not exist.' }, { status: 400 })
    }

    // The placeholder `tournaments` row for this competition-instance, matched
    // on the same (provider, league, season) triple loadSyncTargets dedupes on.
    const { data: placeholder, error: phErr } = await adminClient
      .from('tournaments')
      .select('tournament_id')
      .eq('external_provider', season.external_provider ?? 'api_football')
      .eq('external_league_id', season.external_league_id)
      .eq('external_season', season.external_season)
      .maybeSingle()
    if (phErr) {
      return NextResponse.json({ error: `Could not resolve the competition: ${phErr.message}` }, { status: 500 })
    }
    if (!placeholder) {
      // Refuse rather than inventing one. A league pool with no tournament_id
      // would violate the column's NOT NULL, and a wrong one would silently
      // scope every World Cup query on this pool to another competition.
      return NextResponse.json(
        { error: 'That league has no competition record yet — import it before creating pools.' },
        { status: 409 },
      )
    }

    resolvedTournamentId = placeholder.tournament_id
    // The mode IS the competition kind; it is not the client's to choose.
    resolvedMode = 'league_pickem'

    // A league has no single pool-wide deadline — each matchweek locks at its
    // own first kickoff, enforced by enforce_league_prediction_before_lock.
    // v3.1 handles that by making prediction_deadline NULL, which needs a
    // DROP NOT NULL the slice deliberately does not do (§1 of the plan), so a
    // NULL here would raise 23502.
    //
    // Instead the deadline is set to the season's LAST kickoff. That satisfies
    // NOT NULL and is inert for the whole season: `isDeadlinePassed` stays
    // false, so `computeReveal`'s scope:'all' branch — the one that reveals a
    // member's entire entry — cannot fire. The real locks are per matchweek.
    const { data: lastKickoff } = await adminClient
      .from('league_matchweeks')
      .select('last_kickoff_at')
      .eq('season_id', league_season_id)
      .not('last_kickoff_at', 'is', null)
      .order('last_kickoff_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!lastKickoff?.last_kickoff_at) {
      return NextResponse.json(
        { error: 'That league season has no scheduled fixtures yet.' },
        { status: 409 },
      )
    }
    resolvedDeadline = lastKickoff.last_kickoff_at as string
  }

  // 1. Create pool
  const { data: newPool, error: poolError } = await adminClient
    .from('pools')
    .insert({
      pool_name: pool_name.trim(),
      description: description?.trim() || null,
      tournament_id: resolvedTournamentId,
      league_season_id: league_season_id ?? null,
      admin_user_id: userData.user_id,
      prediction_deadline: resolvedDeadline,
      prediction_mode: resolvedMode,
      status: 'open',
      is_private,
      max_participants: max_participants > 0 ? max_participants : null,
      max_entries_per_user: Math.max(1, Math.min(10, max_entries_per_user || 1)),
    })
    .select()
    .single()

  if (poolError) {
    if (poolError.code === '23505') {
      return NextResponse.json({ error: 'Please try again.' }, { status: 409 })
    }
    return NextResponse.json({ error: poolError.message }, { status: 500 })
  }

  // 2. Add creator as admin member
  const { data: memberData, error: memberError } = await adminClient
    .from('pool_members')
    .insert({
      pool_id: newPool.pool_id,
      user_id: userData.user_id,
      role: 'admin',
    })
    .select('member_id')
    .single()

  if (memberError) {
    return NextResponse.json({ error: 'Pool created but could not add you as admin: ' + memberError.message }, { status: 500 })
  }

  // 3. Fetch username for entry name
  const { data: userProfile } = await adminClient
    .from('users')
    .select('username')
    .eq('user_id', userData.user_id)
    .single()

  // 4. Auto-create first entry for the creator
  const { error: entryError } = await adminClient
    .from('pool_entries')
    .insert({
      member_id: memberData.member_id,
      entry_name: userProfile?.username || 'Entry 1',
      entry_number: 1,
    })

  if (entryError) {
    console.error('Failed to create first entry:', entryError.message)
  }

  // 5. Update pool_settings with default scoring values (trigger auto-creates the row)
  const { error: settingsError } = await adminClient
    .from('pool_settings')
    .update(SCORING_DEFAULTS)
    .eq('pool_id', newPool.pool_id)

  if (settingsError) {
    console.error('Failed to save scoring settings:', settingsError.message)
  }

  // 6. Seed round states for the modes that have rounds.
  //
  // The seven-key World Cup list used to be a literal here (and again in the
  // branded-pool route). It now comes from the competition: a league pool gets
  // one round per matchweek, derived from its imported fixtures, because the
  // count varies by league — 38 for a 20-club division, 34 for 18, 46 for the
  // Championship.
  // `league_pickem` is deliberately NOT in this list. A league's rounds are
  // DERIVED from `league_matchweeks` (fixture_count, lock_at,
  // completed_fixture_count) rather than seeded into `pool_round_states`, which
  // is World-Cup-shaped. `seedPoolRoundStates` refuses a league outright.
  if (resolvedMode === 'progressive') {
    const seed = await seedPoolRoundStates(adminClient, {
      poolId: newPool.pool_id,
      tournamentId: newPool.tournament_id,
      predictionMode: prediction_mode,
      predictionDeadline: prediction_deadline,
    })

    if (seed.error) {
      console.error('Failed to create round states:', seed.error)
    }

    // Disable bracket pairing bonus — a pairing bonus needs a bracket, which
    // neither a progressive pool (it predicts fixtures, not the bracket) nor a
    // league (there is no bracket at all) has.
    await adminClient
      .from('pool_settings')
      .update({ bonus_correct_bracket_pairing: 0 })
      .eq('pool_id', newPool.pool_id)
  }

  return NextResponse.json({
    pool_id: newPool.pool_id,
    pool_code: newPool.pool_code,
    pool_name: newPool.pool_name,
  })
}
