import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { saveTablePrediction, readTablePrediction, readTableBreakdown } from '@/lib/league/table'
import type { SupabaseClient } from '@supabase/supabase-js'

// =============================================================
// /api/pools/[pool_id]/table-prediction
//
// Table mode's one write. GET returns the entry's current ordering and, once
// there is a table to compare against, the per-club breakdown.
//
// The USER-scoped client is used throughout, deliberately: RLS on
// `league_table_predictions` is what stops a member reading a rival's
// prediction before the deadline, and reaching for the admin client here would
// step straight around it. The route's own membership check is about the POOL;
// RLS is about the row.
// =============================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ pool_id: string }> },
) {
  const { pool_id } = await params
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, userData } = auth.data

  const { searchParams } = new URL(request.url)
  const requestedEntry = searchParams.get('entryId')

  const { data: membership } = await supabase
    .from('pool_members')
    .select('member_id')
    .eq('pool_id', pool_id)
    .eq('user_id', userData.user_id)
    .single()
  if (!membership) return NextResponse.json({ error: 'Not a member' }, { status: 403 })

  const entryId = requestedEntry ?? (await firstEntryId(supabase, membership.member_id))
  if (!entryId) return NextResponse.json({ error: 'No entry in this pool' }, { status: 404 })

  const [{ order, savedAt, error: orderErr }, { rows, error: rowsErr }] = await Promise.all([
    readTablePrediction(supabase, entryId),
    readTableBreakdown(supabase, entryId),
  ])
  const error = orderErr ?? rowsErr
  if (error) return NextResponse.json({ error }, { status: 500 })

  return NextResponse.json({ entryId, order, savedAt, breakdown: rows })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ pool_id: string }> },
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

  const body = await request.json()
  const { entryId, order } = body as { entryId?: string; order?: string[] }

  if (!Array.isArray(order) || order.length === 0) {
    return NextResponse.json({ error: 'An ordering is required.' }, { status: 400 })
  }

  const resolvedEntry = entryId ?? (await firstEntryId(supabase, membership.member_id))
  if (!resolvedEntry) return NextResponse.json({ error: 'No entry in this pool' }, { status: 404 })

  // The entry must belong to THIS member. RLS would refuse the write anyway,
  // but it refuses it by writing nothing — which this route reports as
  // `locked`, and "your deadline passed" is the wrong answer to "that is not
  // your entry".
  const { data: owned } = await supabase
    .from('pool_entries')
    .select('entry_id')
    .eq('entry_id', resolvedEntry)
    .eq('member_id', membership.member_id)
    .maybeSingle()
  if (!owned) return NextResponse.json({ error: 'That entry is not yours.' }, { status: 403 })

  // Guard the shape before writing. A Table pool is the only place this write
  // means anything, and the pool's mode is immutable, so this is a fixed
  // expectation rather than a guess.
  const { data: pool } = await supabase
    .from('pools')
    .select('league_mode, league_table_lock_at')
    .eq('pool_id', pool_id)
    .single()
  if (pool?.league_mode !== 'table') {
    return NextResponse.json(
      { error: 'This pool is not played by predicting the table.' },
      { status: 400 },
    )
  }

  const result = await saveTablePrediction(supabase, resolvedEntry, order)
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 })

  if (result.locked) {
    // 403 rather than 200-with-a-flag: nothing was saved, and a member who
    // dragged twenty clubs deserves to be told that plainly.
    return NextResponse.json(
      {
        error: 'The table prediction for this pool has closed.',
        lockedAt: pool?.league_table_lock_at ?? null,
        locked: true,
      },
      { status: 403 },
    )
  }

  return NextResponse.json({ saved: result.stored, savedAt: result.savedAt, entryId: resolvedEntry })
}

/**
 * Table mode's entry, when the caller did not name one. Oldest first, matching
 * how every other league surface picks a default entry for a member with more
 * than one.
 */
async function firstEntryId(
  supabase: SupabaseClient,
  memberId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('pool_entries')
    .select('entry_id')
    .eq('member_id', memberId)
    .is('retired_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  return (data as { entry_id: string } | null)?.entry_id ?? null
}
