import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { poolJoinability } from '@/lib/poolStatus'
import { restoreEntriesForMember, rescoreRestoredEntries } from '@/lib/entries/retire'

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, userData } = auth.data

  const { pool_id, pool_code } = await request.json()

  // Use admin client to bypass RLS for pool lookup (pool code is the auth mechanism for private pools)
  const adminClient = createAdminClient()

  // Look up pool by ID or code
  let pool: {
    pool_id: string
    pool_name: string
    status: string
    accepting_members: boolean | null
    // Needed only to re-score a restored league entry — see the restore block below.
    league_season_id: string | null
  } | null = null

  if (pool_id) {
    const { data } = await adminClient
      .from('pools')
      .select('pool_id, pool_name, status, accepting_members, league_season_id')
      .eq('pool_id', pool_id)
      .single()
    pool = data
  } else if (pool_code) {
    const { data } = await adminClient
      .from('pools')
      .select('pool_id, pool_name, status, accepting_members, league_season_id')
      .eq('pool_code', pool_code)
      .single()
    pool = data
  } else {
    return NextResponse.json({ error: 'pool_id or pool_code is required' }, { status: 400 })
  }

  if (!pool) {
    return NextResponse.json({ error: 'Pool not found. Check the code and try again.' }, { status: 404 })
  }

  // Lifecycle and join-ability are separate refusals with separate copy, so the
  // user learns which one applies (migration 025).
  const { canJoin, reason } = poolJoinability(pool)
  if (!canJoin) {
    return NextResponse.json({ error: reason }, { status: 400 })
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
    // SP010 = the pool is at its tier's member cap (migration 075,
    // trg_pool_member_tier_cap). Branch on the SQLSTATE, not the message: the
    // wording is user-facing and will change, the code will not.
    //
    // 409, not 500 — nothing failed. The pool is full, which is a legitimate
    // answer to "can I join", and the person deserves to be told that rather
    // than shown a server error.
    if (insertError.code === 'SP010') {
      return NextResponse.json(
        { error: insertError.message, reason: 'pool_full' },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  // Have they been here before? — migration 056.
  //
  // Entries are retired, never destroyed, so somebody who left (or was removed
  // by mistake) still has their predictions sitting detached. Reunite them
  // BEFORE creating a fresh entry, or they get an empty one alongside their
  // real history and the pool shows them twice.
  //
  // Ryan's decision 15: their history comes back IN FULL, including the
  // matchweeks that completed while they were away.
  const restored = await restoreEntriesForMember(adminClient, {
    poolId: pool.pool_id,
    userId: userData.user_id,
    memberId: memberData.member_id,
  })

  if (restored.error) {
    console.error('Failed to restore prior entries:', restored.error)
  }

  if (restored.restored === 0) {
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
  } else {
    // Their predictions were unscored while they were detached — the engines
    // reach entries through pool_members, so nothing recomputed for them.
    // Best-effort and idempotent: a failure here must not fail the join.
    const rescored = await rescoreRestoredEntries(adminClient, {
      poolId: pool.pool_id,
      leagueSeasonId: pool.league_season_id ?? null,
    })
    if (rescored.error) {
      console.error('Failed to re-score restored entries:', rescored.error)
    }
  }

  // The pool just changed size, so a Showdown fixture list is now wrong from
  // here forward. Regenerated after BOTH branches — a first-time joiner and a
  // returning member both change who is in the rotation. Never rewrites a
  // matchweek that has already been played.
  const { regenerateDuelSchedule } = await import('@/lib/league/duels')
  const sched = await regenerateDuelSchedule(adminClient, pool.pool_id)
  // Best-effort, like the re-score above: a schedule that is one join stale is
  // recoverable, a join that failed is not.
  if (sched.error) console.error('Failed to regenerate duel schedule:', sched.error)

  return NextResponse.json({
    member_id: memberData.member_id,
    pool_id: pool.pool_id,
    pool_name: pool.pool_name,
    restored_entries: restored.restored,
  })
}
