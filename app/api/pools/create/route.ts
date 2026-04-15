import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

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
    prediction_deadline,
    prediction_mode,
    is_private,
    max_participants,
    max_entries_per_user,
  } = body

  if (!pool_name?.trim() || !tournament_id) {
    return NextResponse.json({ error: 'Pool name and tournament are required.' }, { status: 400 })
  }

  const adminClient = createAdminClient()

  // 1. Create pool
  const { data: newPool, error: poolError } = await adminClient
    .from('pools')
    .insert({
      pool_name: pool_name.trim(),
      description: description?.trim() || null,
      tournament_id,
      admin_user_id: userData.user_id,
      prediction_deadline,
      prediction_mode,
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

  // 6. For progressive pools: seed round states and disable bracket pairing bonus
  if (prediction_mode === 'progressive') {
    const roundKeys = ['group', 'round_32', 'round_16', 'quarter_final', 'semi_final', 'third_place', 'final']
    const roundStates = roundKeys.map(key => ({
      pool_id: newPool.pool_id,
      round_key: key,
      state: key === 'group' ? 'open' : 'locked',
      deadline: key === 'group' ? prediction_deadline : null,
      opened_at: key === 'group' ? new Date().toISOString() : null,
    }))

    const { error: roundError } = await adminClient
      .from('pool_round_states')
      .insert(roundStates)

    if (roundError) {
      console.error('Failed to create round states:', roundError.message)
    }

    // Disable bracket pairing bonus for progressive pools
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
