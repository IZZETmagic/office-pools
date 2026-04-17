import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { withPerfLogging } from '@/lib/api-perf'

// Shape returned by `pool_entries` SELECT with `pool_members!inner(...)` join.
// Supabase's TS inference types this as an array or object depending on the FK,
// so we narrow to the single-row shape used by the ownership checks below.
type EntryWithMembership = {
  entry_id: string
  member_id: string
  entry_number?: number
  has_submitted_predictions?: boolean
  pool_members: { user_id: string; pool_id: string } | null
}

// =============================================================
// GET /api/pools/:poolId/entries - List user's entries for this pool
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

  const body = await request.json().catch(() => ({} as { entryName?: string }))
  const entryName = typeof body.entryName === 'string' ? body.entryName : null

  // Atomic: count + validate + insert inside a single plpgsql function.
  // See lib/migrations/005_create_pool_entry_rpc.sql
  const { data: entry, error } = await supabase.rpc('create_pool_entry', {
    p_member_id: membership.member_id,
    p_pool_id: pool_id,
    p_entry_name: entryName,
  })

  if (error) {
    // Business errors from the RPC (RAISE EXCEPTION with P0001) → 400
    // Not-found (P0002) → 404. Everything else → 500.
    const code = (error as { code?: string }).code
    if (code === 'P0001') {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    if (code === 'P0002') {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    return NextResponse.json({ error: 'Failed to create entry' }, { status: 500 })
  }

  return NextResponse.json({ entry }, { status: 201 })
}

// =============================================================
// PATCH /api/pools/:poolId/entries - Rename an entry
// =============================================================
async function handlePATCH(
  request: NextRequest,
  { params }: { params: Promise<{ pool_id: string }> }
) {
  const { pool_id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, userData } = auth.data

  const body = await request.json()
  const { entryId, entryName } = body as { entryId: string; entryName: string }

  if (!entryId || !entryName) {
    return NextResponse.json({ error: 'entryId and entryName are required' }, { status: 400 })
  }

  // Verify ownership
  const { data: entryRaw } = await supabase
    .from('pool_entries')
    .select('entry_id, member_id, pool_members!inner(user_id, pool_id)')
    .eq('entry_id', entryId)
    .single()

  const entry = entryRaw as EntryWithMembership | null
  if (!entry || entry.pool_members?.user_id !== userData.user_id ||
      entry.pool_members?.pool_id !== pool_id) {
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
async function handleDELETE(
  request: NextRequest,
  { params }: { params: Promise<{ pool_id: string }> }
) {
  const { pool_id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, userData } = auth.data

  const { searchParams } = new URL(request.url)
  const entryId = searchParams.get('entryId')

  if (!entryId) {
    return NextResponse.json({ error: 'entryId is required' }, { status: 400 })
  }

  // Verify ownership and check it's not submitted
  const { data: entryRaw } = await supabase
    .from('pool_entries')
    .select('entry_id, entry_number, has_submitted_predictions, member_id, pool_members!inner(user_id, pool_id)')
    .eq('entry_id', entryId)
    .single()

  const entry = entryRaw as EntryWithMembership | null
  if (!entry || entry.pool_members?.user_id !== userData.user_id ||
      entry.pool_members?.pool_id !== pool_id) {
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

export const GET = withPerfLogging('/api/pools/[id]/entries', handleGET)
export const POST = withPerfLogging('/api/pools/[id]/entries', handlePOST)
export const PATCH = withPerfLogging('/api/pools/[id]/entries', handlePATCH)
export const DELETE = withPerfLogging('/api/pools/[id]/entries', handleDELETE)
