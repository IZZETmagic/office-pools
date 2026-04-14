import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, userData } = auth.data

  const { pool_id, pool_code } = await request.json()

  // Use admin client to bypass RLS for pool lookup (pool code is the auth mechanism for private pools)
  const adminClient = createAdminClient()

  // Look up pool by ID or code
  let pool: { pool_id: string; pool_name: string; status: string } | null = null

  if (pool_id) {
    const { data } = await adminClient
      .from('pools')
      .select('pool_id, pool_name, status')
      .eq('pool_id', pool_id)
      .single()
    pool = data
  } else if (pool_code) {
    const { data } = await adminClient
      .from('pools')
      .select('pool_id, pool_name, status')
      .eq('pool_code', pool_code)
      .single()
    pool = data
  } else {
    return NextResponse.json({ error: 'pool_id or pool_code is required' }, { status: 400 })
  }

  if (!pool) {
    return NextResponse.json({ error: 'Pool not found. Check the code and try again.' }, { status: 404 })
  }

  if (pool.status !== 'open') {
    return NextResponse.json({ error: 'This pool is no longer accepting new members.' }, { status: 400 })
  }

  // Check for existing membership
  const { data: existing } = await adminClient
    .from('pool_members')
    .select('member_id')
    .eq('pool_id', pool.pool_id)
    .eq('user_id', userData.user_id)
    .single()

  if (existing) {
    return NextResponse.json({ error: 'You are already a member of this pool!' }, { status: 409 })
  }

  // Insert membership
  const { data: memberData, error: insertError } = await adminClient
    .from('pool_members')
    .insert({
      pool_id: pool.pool_id,
      user_id: userData.user_id,
      role: 'player',
    })
    .select('member_id')
    .single()

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  // Fetch username for entry name
  const { data: userProfile } = await supabase
    .from('users')
    .select('username')
    .eq('user_id', userData.user_id)
    .single()

  // Auto-create first entry
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

  return NextResponse.json({
    member_id: memberData.member_id,
    pool_id: pool.pool_id,
    pool_name: pool.pool_name,
  })
}
