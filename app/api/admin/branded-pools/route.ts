import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth'
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

// GET — List all branded pools
export async function GET() {
  const auth = await requireSuperAdmin()
  if (auth.error) return auth.error

  const adminClient = createAdminClient()

  const { data, error } = await adminClient
    .from('pools')
    .select(`
      *,
      tournaments(name),
      admin_user:users!pools_admin_user_id_fkey(username, email),
      pool_members(count)
    `)
    .not('brand_name', 'is', null)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Normalize joined data
  const pools = (data || []).map((p: any) => ({
    ...p,
    tournaments: Array.isArray(p.tournaments) ? p.tournaments[0] ?? null : p.tournaments,
    admin_user: Array.isArray(p.admin_user) ? p.admin_user[0] ?? null : p.admin_user,
  }))

  return NextResponse.json({ pools })
}

// POST — Create a new branded pool
export async function POST(request: NextRequest) {
  const auth = await requireSuperAdmin()
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
    // Branding fields
    brand_name,
    brand_slug,
    brand_emoji,
    brand_color,
    brand_accent,
    brand_logo_url,
    // Entry fee
    entry_fee,
    entry_fee_currency,
    // Prizes
    brand_prize_1st,
    brand_prize_2nd,
    brand_prize_3rd,
  } = body

  if (!pool_name?.trim() || !tournament_id) {
    return NextResponse.json({ error: 'Pool name and tournament are required.' }, { status: 400 })
  }
  if (!brand_name?.trim()) {
    return NextResponse.json({ error: 'Brand name is required.' }, { status: 400 })
  }
  if (!brand_slug?.trim()) {
    return NextResponse.json({ error: 'Brand slug is required.' }, { status: 400 })
  }
  if (!/^[a-z0-9-]+$/.test(brand_slug)) {
    return NextResponse.json({ error: 'Slug must be lowercase alphanumeric with hyphens only.' }, { status: 400 })
  }

  const adminClient = createAdminClient()

  // Check slug uniqueness
  const { data: existing } = await adminClient
    .from('pools')
    .select('pool_id')
    .eq('brand_slug', brand_slug)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: 'This slug is already in use.' }, { status: 409 })
  }

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
      is_private: is_private ?? false,
      max_participants: max_participants > 0 ? max_participants : null,
      max_entries_per_user: Math.max(1, Math.min(10, max_entries_per_user || 1)),
      brand_name: brand_name.trim(),
      brand_slug: brand_slug.trim(),
      brand_emoji: brand_emoji?.trim() || null,
      brand_color: brand_color || null,
      brand_accent: brand_accent || null,
      brand_logo_url: brand_logo_url || null,
      brand_landing_url: `/play/${brand_slug.trim()}`,
      // Entry fee
      entry_fee: entry_fee && parseFloat(entry_fee) > 0 ? parseFloat(entry_fee) : null,
      entry_fee_currency: entry_fee_currency || 'USD',
      // Prizes
      brand_prize_1st: brand_prize_1st?.trim() || null,
      brand_prize_2nd: brand_prize_2nd?.trim() || null,
      brand_prize_3rd: brand_prize_3rd?.trim() || null,
    })
    .select()
    .single()

  if (poolError) {
    if (poolError.code === '23505') {
      return NextResponse.json({ error: 'Slug or pool code conflict. Please try again.' }, { status: 409 })
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
    return NextResponse.json({ error: 'Pool created but failed to add admin member: ' + memberError.message }, { status: 500 })
  }

  // 3. Fetch username for entry name
  const { data: userProfile } = await adminClient
    .from('users')
    .select('username')
    .eq('user_id', userData.user_id)
    .single()

  // 4. Auto-create first entry
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

  // 5. Seed scoring settings
  const { error: settingsError } = await adminClient
    .from('pool_settings')
    .update(SCORING_DEFAULTS)
    .eq('pool_id', newPool.pool_id)

  if (settingsError) {
    console.error('Failed to save scoring settings:', settingsError.message)
  }

  // 6. For progressive pools: seed round states
  if (prediction_mode === 'progressive') {
    const roundKeys = ['group', 'round_32', 'round_16', 'quarter_final', 'semi_final', 'third_place', 'final']
    const roundStates = roundKeys.map(key => ({
      pool_id: newPool.pool_id,
      round_key: key,
      state: key === 'group' ? 'open' : 'locked',
      deadline: key === 'group' ? prediction_deadline : null,
      opened_at: key === 'group' ? new Date().toISOString() : null,
    }))

    await adminClient.from('pool_round_states').insert(roundStates)

    await adminClient
      .from('pool_settings')
      .update({ bonus_correct_bracket_pairing: 0 })
      .eq('pool_id', newPool.pool_id)
  }

  // 7. Audit log
  await adminClient.from('admin_audit_log').insert({
    action: 'create_branded_pool',
    performed_by: userData.user_id,
    pool_id: newPool.pool_id,
    summary: `Created branded pool "${pool_name}" (${brand_name})`,
    details: { brand_name, brand_slug, brand_color, brand_accent, prediction_mode },
  })

  return NextResponse.json({
    pool_id: newPool.pool_id,
    pool_code: newPool.pool_code,
    pool_name: newPool.pool_name,
    brand_slug: newPool.brand_slug,
  })
}
