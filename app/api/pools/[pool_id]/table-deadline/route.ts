import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { invalidatePoolCache } from '@/lib/poolData'
import { notifyTableDeadlineMoved } from '@/lib/league/notify'

// =============================================================
// /api/pools/[pool_id]/table-deadline — the admin's controls
// =============================================================
// Table mode's deadline is the only genuine deadline decision in the product.
// There is no fixture list enforcing it, one prediction rides on it, and it is
// the admin's to move — forward always, backward never (migration 104).
//
// ## Why this is a route at all, rather than another field on the Settings form
//
// It used to be the latter. SettingsTab wrote `league_table_lock_at` straight
// from the browser inside the same UPDATE as the pool name, then fired
//
//   fetch('/api/notifications/deadline-changed', ...).catch(() => {})
//
// after it. Three things were wrong with that, and all three matter more for
// this deadline than for a World Cup one:
//
//   1. THE ANNOUNCEMENT WAS OPTIONAL. Fire-and-forget from a page the admin is
//      about to navigate away from. A deadline could move with nobody told,
//      which is the single thing that makes an extension unfair — the members
//      who filed on time are then the only ones who never learn they may
//      revise. Here it is awaited, and its failure is reported.
//
//   2. IT COULDN'T KNOW WHAT KIND OF MOVE IT WAS. Reopening a deadline that has
//      already passed is a different event from nudging an open one, and the
//      member-facing sentence is different ("your table is open again" vs "the
//      deadline moved"). Only the server knows the old value for certain.
//
//   3. THE ADMIN COULDN'T SEE WHO WAS MISSING. Migration 104 closed the admin
//      RLS policy on `league_table_predictions` — a playing admin could read
//      every rival's table before the reveal — so the count now comes from
//      `league_table_filing_status`, which returns booleans and no orderings.
//
// ⚠ THERE IS NO `POST` HERE ANY MORE. It called `league_reveal_table_now`, the
// admin's "reveal without them", which migration 109 deleted along with the
// hold it existed to break: the reveal now fires at the deadline on its own, so
// there is nothing left to override.
//
// The RULES themselves are not re-implemented here. They live in the trigger
// `enforce_league_mode_immutable`, which is the only place that can enforce
// them for the mobile client too, and its RAISE messages are written to be read
// by a person — so they are passed through rather than replaced.
// =============================================================

type FilingRow = { entry_id: string; member_id: string; user_id: string; has_filed: boolean }

async function requireTablePoolAdmin(poolId: string) {
  const auth = await requireAuth()
  if (auth.error) return { error: auth.error }
  const { supabase, userData } = auth.data

  const { data: membership } = await supabase
    .from('pool_members')
    .select('role')
    .eq('pool_id', poolId)
    .eq('user_id', userData.user_id)
    .single()

  if (!membership || (membership as { role: string }).role !== 'admin') {
    return { error: NextResponse.json({ error: 'Admin access required' }, { status: 403 }) }
  }

  const admin = createAdminClient()
  const { data: pool } = await admin
    .from('pools')
    .select('pool_name, league_mode, league_table_lock_at, archived_at')
    .eq('pool_id', poolId)
    .single()

  if (!pool) return { error: NextResponse.json({ error: 'Pool not found' }, { status: 404 }) }
  const p = pool as {
    pool_name: string; league_mode: string | null
    league_table_lock_at: string | null
    archived_at: string | null
  }
  if (p.league_mode !== 'table') {
    return { error: NextResponse.json({ error: 'This is not a Predict the Table pool.' }, { status: 409 }) }
  }
  if (p.archived_at !== null) {
    return { error: NextResponse.json({ error: 'This pool is archived and read-only.' }, { status: 409 }) }
  }

  return { data: { admin, pool: p, userId: userData.user_id } }
}

/** Everything the admin's deadline card needs: the date, the reveal, the count. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ pool_id: string }> },
) {
  const { pool_id } = await params
  const gate = await requireTablePoolAdmin(pool_id)
  if (gate.error) return gate.error
  const { admin, pool } = gate.data

  const { data: rows, error } = await admin.rpc('league_table_filing_status', { p_pool_id: pool_id })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const filing = (rows ?? []) as FilingRow[]
  return NextResponse.json({
    lockAt: pool.league_table_lock_at,
    // `hasPassed` IS the reveal since 110 — the screen needs no separate flag.
    hasPassed: pool.league_table_lock_at
      ? new Date(pool.league_table_lock_at) <= new Date()
      : false,
    total: filing.length,
    filed: filing.filter((r) => r.has_filed).length,
    // ENTRY IDS ONLY, never orderings. The screen joins these against the
    // member list it already has; the point of the RPC is that "who is
    // missing" is answerable without "what did they put".
    missingEntryIds: filing.filter((r) => !r.has_filed).map((r) => r.entry_id),
  })
}

/** Move the deadline, then tell everybody. Both, or neither is worth doing. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ pool_id: string }> },
) {
  const { pool_id } = await params
  const gate = await requireTablePoolAdmin(pool_id)
  if (gate.error) return gate.error
  const { admin, pool } = gate.data

  const { deadline } = (await request.json()) as { deadline?: string }
  const next = deadline ? new Date(deadline) : null
  if (!next || Number.isNaN(next.getTime())) {
    return NextResponse.json({ error: 'A valid deadline is required.' }, { status: 400 })
  }

  // Was the old deadline already gone? This is the difference between "the
  // deadline moved" and "your table is open again", and it has to be read
  // BEFORE the update — afterwards the old value is gone.
  const wasReopened = pool.league_table_lock_at
    ? new Date(pool.league_table_lock_at) <= new Date()
    : false

  // `.select()` so the write reports the truth. A PostgREST update that matches
  // nothing returns 200 with zero rows and no error, which is how a save can
  // say "Saved" having changed nothing.
  const { data: updated, error } = await admin
    .from('pools')
    .update({ league_table_lock_at: next.toISOString() })
    .eq('pool_id', pool_id)
    .select('pool_id, league_table_lock_at')

  if (error) {
    // The trigger's own words. "a table deadline cannot be set in the past" and
    // "the tables in this pool were revealed at …" are written for the admin
    // reading them, so replacing them with a generic message would lose the
    // only explanation of why the move was refused.
    return NextResponse.json({ error: error.message }, { status: 409 })
  }
  if (!updated || updated.length === 0) {
    return NextResponse.json({ error: 'That pool could not be updated.' }, { status: 409 })
  }

  invalidatePoolCache(pool_id)

  // AWAITED, not fired and forgotten. If the announcement fails the admin is
  // told, because a deadline that moved in silence is the unfair version of
  // this feature and they are the only person who can do anything about it.
  let notice
  try {
    notice = await notifyTableDeadlineMoved(admin, pool_id, {
      newDeadline: next.toISOString(),
      wasReopened,
    })
  } catch (e) {
    console.error('[table-deadline] announcement failed:', e)
    return NextResponse.json({
      lockAt: next.toISOString(),
      wasReopened,
      announced: false,
      error: 'The deadline was moved, but the pool could not be told. Let them know yourself.',
    })
  }

  return NextResponse.json({
    lockAt: next.toISOString(),
    wasReopened,
    announced: true,
    emails: notice.emails,
    pushes: notice.pushes,
    ...(notice.skipped ? { skipped: notice.skipped } : {}),
  })
}
