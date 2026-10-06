// Joining a pool — the one path every join takes.
//
// Lifted out of POST /api/pools/join so a second door can walk the same steps: taking a held seat
// in a crew's pool (drafts/2026-10-02_crews_plan.md, P4). A join is more than a membership row —
// it restores a returning member's retired entries (056), re-scores them, creates a first entry
// for a newcomer, and regenerates a Showdown fixture list — and two doors that each did a subset
// would drift. Behaviour is unchanged from the route this came from; the route now only parses
// the request and turns the result into a response.
//
// ⚠ Runs on the ADMIN client. Every check that matters — lifecycle, accepting_members, the tier
// cap (SP010) — is enforced here or by the database, not by RLS. Since migration 151 there is no
// client INSERT policy on pool_members at all, so this is the only way in.

import type { SupabaseClient } from '@supabase/supabase-js'
import { poolJoinability } from '@/lib/poolStatus'
import { restoreEntriesForMember, rescoreRestoredEntries } from '@/lib/entries/retire'
import { enqueue } from '@/lib/notifications/outbox'

export type JoinTarget = { poolId: string } | { poolCode: string }

export type JoinResult =
  | {
      ok: true
      memberId: string
      poolId: string
      poolName: string
      /** Entries brought back from a previous membership (056). 0 for a newcomer. */
      restoredEntries: number
      /** Outbox rows the join queued — its notices. The route sends them straight away. */
      queued: number[]
    }
  | {
      ok: false
      /** The HTTP status the route answers with. */
      status: 400 | 404 | 409 | 500
      error: string
      /** Set when the pool is at its tier's member cap, so a client can say so. */
      reason?: 'pool_full'
    }

export async function joinPool(
  admin: SupabaseClient,
  target: JoinTarget,
  userId: string,
): Promise<JoinResult> {
  const lookup = admin
    .from('pools')
    // league_season_id is needed only to re-score a restored league entry — see below.
    // crew_id: a crew's pool makes its players crew members (Crews, 154) — see the end.
    // admin_user_id: who is told that somebody joined — see the end.
    .select('pool_id, pool_name, status, accepting_members, league_season_id, crew_id, admin_user_id')
  const { data: pool } = await ('poolId' in target
    ? lookup.eq('pool_id', target.poolId)
    : lookup.eq('pool_code', target.poolCode)
  ).single<{
    pool_id: string
    pool_name: string
    status: string
    accepting_members: boolean | null
    league_season_id: string | null
    crew_id: string | null
    admin_user_id: string | null
  }>()

  if (!pool) {
    return { ok: false, status: 404, error: 'Pool not found. Check the code and try again.' }
  }

  // Lifecycle and join-ability are separate refusals with separate copy, so the
  // user learns which one applies (migration 025).
  const { canJoin, reason } = poolJoinability(pool)
  if (!canJoin) {
    return { ok: false, status: 400, error: reason ?? 'This pool is not accepting new members.' }
  }

  const { data: existing } = await admin
    .from('pool_members')
    .select('member_id')
    .eq('pool_id', pool.pool_id)
    .eq('user_id', userId)
    .single()

  if (existing) {
    return { ok: false, status: 409, error: 'You are already a member of this pool!' }
  }

  const { data: memberData, error: insertError } = await admin
    .from('pool_members')
    .insert({
      pool_id: pool.pool_id,
      user_id: userId,
      role: 'player',
    })
    .select('member_id')
    .single()

  if (insertError || !memberData) {
    // SP010 = the pool is at its tier's member cap (migration 075,
    // trg_pool_member_tier_cap). Branch on the SQLSTATE, not the message: the
    // wording is user-facing and will change, the code will not.
    //
    // 409, not 500 — nothing failed. The pool is full, which is a legitimate
    // answer to "can I join", and the person deserves to be told that rather
    // than shown a server error.
    if (insertError?.code === 'SP010') {
      return { ok: false, status: 409, error: insertError.message, reason: 'pool_full' }
    }
    return { ok: false, status: 500, error: insertError?.message ?? 'Failed to join pool.' }
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
  const restored = await restoreEntriesForMember(admin, {
    poolId: pool.pool_id,
    userId,
    memberId: memberData.member_id,
  })

  if (restored.error) {
    console.error('Failed to restore prior entries:', restored.error)
  }

  if (restored.restored === 0) {
    const { data: userProfile } = await admin
      .from('users')
      .select('username')
      .eq('user_id', userId)
      .single()

    // Auto-create first entry
    const { error: entryError } = await admin.from('pool_entries').insert({
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
    const rescored = await rescoreRestoredEntries(admin, {
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
  const sched = await regenerateDuelSchedule(admin, pool.pool_id)
  // Best-effort, like the re-score above: a schedule that is one join stale is
  // recoverable, a join that failed is not.
  if (sched.error) console.error('Failed to regenerate duel schedule:', sched.error)

  // A crew's pool: playing in it is how you join the crew (unless you left or were removed — exits
  // stick), and it takes any saved spot you were holding. Best-effort, like the steps above: the
  // join itself has already happened. Loaded lazily — lib/crews/store imports this module.
  if (pool.crew_id) {
    const { onCrewPoolJoined } = await import('@/lib/crews/store')
    await onCrewPoolJoined(admin, { crewId: pool.crew_id, poolId: pool.pool_id, userId })
  }

  // The join's two notices (N3, 2026-10-06): a welcome to the joiner, and "X joined" to the pool's
  // admin. QUEUED here, so every door into a pool sends them — until now only the website's join
  // screens did, by calling /api/notifications/pool-joined from the browser afterwards, so a join
  // from the app or by taking a crew's saved spot welcomed nobody and told the admin nothing.
  // Keyed to THIS membership: the same join queued twice is one notice, while somebody who leaves
  // and comes back is welcomed again, as before. Best-effort, like the steps above — the join has
  // happened, and a notice that failed to queue must not undo it.
  let queued: number[] = []
  try {
    queued = await enqueue(admin, [
      {
        type: 'pool_welcome',
        userId,
        poolId: pool.pool_id,
        dedupKey: `pool_welcome:${memberData.member_id}`,
        payload: { memberId: memberData.member_id },
      },
      // Not when the admin is the one joining — nobody needs telling they joined.
      ...(pool.admin_user_id && pool.admin_user_id !== userId
        ? [{
            type: 'member_joined' as const,
            userId: pool.admin_user_id,
            poolId: pool.pool_id,
            dedupKey: `member_joined:${memberData.member_id}`,
            payload: { memberId: memberData.member_id, joinerId: userId },
          }]
        : []),
    ])
  } catch (err) {
    console.error('Failed to queue the join notices:', err)
  }

  return {
    ok: true,
    memberId: memberData.member_id,
    poolId: pool.pool_id,
    poolName: pool.pool_name,
    restoredEntries: restored.restored,
    queued,
  }
}
