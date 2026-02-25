import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// =============================================================
// GET /api/pools/:poolId/entries - List user's entries for this pool
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
    .select('member_id')
    .eq('pool_id', pool_id)
    .eq('user_id', userData.user_id)
    .single()

  if (!membership) return NextResponse.json({ error: 'Not a member' }, { status: 403 })

  const { data: entries, error } = await supabase
    .from('pool_entries')
    .select('*')
    .eq('member_id', membership.member_id)
    .order('entry_number', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ entries: entries || [] })
}

// =============================================================
// POST /api/pools/:poolId/entries - Create a new entry
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
    .select('member_id')
    .eq('pool_id', pool_id)
    .eq('user_id', userData.user_id)
    .single()

  if (!membership) return NextResponse.json({ error: 'Not a member' }, { status: 403 })

  // Check max entries limit
  const { data: pool } = await supabase
    .from('pools')
    .select('max_entries_per_user, prediction_deadline')
    .eq('pool_id', pool_id)
    .single()

  if (!pool) return NextResponse.json({ error: 'Pool not found' }, { status: 404 })

  // Check deadline
  const isPastDeadline = pool.prediction_deadline
    ? new Date(pool.prediction_deadline) < new Date()
    : false

  if (isPastDeadline) {
    return NextResponse.json({ error: 'Prediction deadline has passed' }, { status: 403 })
  }

  // Count existing entries
  const { count: existingCount } = await supabase
    .from('pool_entries')
    .select('*', { count: 'exact', head: true })
    .eq('member_id', membership.member_id)

  if ((existingCount ?? 0) >= pool.max_entries_per_user) {
    return NextResponse.json({
      error: `Maximum of ${pool.max_entries_per_user} entries allowed per user`,
    }, { status: 400 })
  }

  const body = await request.json()
  const entryName = body.entryName || `Entry ${(existingCount ?? 0) + 1}`

  const { data: entry, error } = await supabase
    .from('pool_entries')
    .insert({
      member_id: membership.member_id,
      entry_name: entryName,
      entry_number: (existingCount ?? 0) + 1,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ entry }, { status: 201 })
}

// =============================================================
// PATCH /api/pools/:poolId/entries - Rename an entry
// =============================================================
export async function PATCH(
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

  const body = await request.json()
  const { entryId, entryName } = body as { entryId: string; entryName: string }

  if (!entryId || !entryName) {
    return NextResponse.json({ error: 'entryId and entryName are required' }, { status: 400 })
  }

  // Verify ownership
  const { data: entry } = await supabase
    .from('pool_entries')
    .select('entry_id, member_id, pool_members!inner(user_id, pool_id)')
    .eq('entry_id', entryId)
    .single()

  if (!entry || (entry as any).pool_members?.user_id !== userData.user_id ||
      (entry as any).pool_members?.pool_id !== pool_id) {
    return NextResponse.json({ error: 'Entry not found or not yours' }, { status: 404 })
  }

  const { error } = await supabase
    .from('pool_entries')
    .update({ entry_name: entryName })
    .eq('entry_id', entryId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ updated: true })
}

// =============================================================
// DELETE /api/pools/:poolId/entries - Delete an entry
// =============================================================
export async function DELETE(
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

  const { searchParams } = new URL(request.url)
  const entryId = searchParams.get('entryId')

  if (!entryId) {
    return NextResponse.json({ error: 'entryId is required' }, { status: 400 })
  }

  // Verify ownership and check it's not submitted
  const { data: entry } = await supabase
    .from('pool_entries')
    .select('entry_id, entry_number, has_submitted_predictions, member_id, pool_members!inner(user_id, pool_id)')
    .eq('entry_id', entryId)
    .single()

  if (!entry || (entry as any).pool_members?.user_id !== userData.user_id ||
      (entry as any).pool_members?.pool_id !== pool_id) {
    return NextResponse.json({ error: 'Entry not found or not yours' }, { status: 404 })
  }

  if (entry.has_submitted_predictions) {
    return NextResponse.json({ error: 'Cannot delete a submitted entry' }, { status: 400 })
  }

  // Don't allow deleting the last entry
  const { count } = await supabase
    .from('pool_entries')
    .select('*', { count: 'exact', head: true })
    .eq('member_id', entry.member_id)

  if ((count ?? 0) <= 1) {
    return NextResponse.json({ error: 'Cannot delete your only entry' }, { status: 400 })
  }

  const { error } = await supabase
    .from('pool_entries')
    .delete()
    .eq('entry_id', entryId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ deleted: true })
}
