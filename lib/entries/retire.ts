/**
 * Retiring and restoring entries — the soft-delete core.
 *
 * Ryan, 2026-08-24: *"we want a soft deletion. We want their predictions to
 * stay in the database and maybe just have a flag to turn them off from being
 * scored ... if they're added back in, they're linked back up to their
 * predictions."*
 *
 * Four doors used to destroy a member's whole history irreversibly — leaving a
 * pool, being removed, stopping participating, and discarding a spare entry.
 * They all route through here now so they cannot drift apart.
 *
 * ## How a retired entry disappears without any read being changed
 *
 * `pool_entries` has no `pool_id` of its own, so every existing query reaches
 * an entry by joining *through* `pool_members` — including the league scoring
 * engine (migration 055 inner-joins `pool_entries → pool_members → pools`).
 * Migration 056 changes the `member_id` foreign key to `ON DELETE SET NULL`,
 * so deleting a membership leaves the entry behind with `member_id = NULL`,
 * and every one of those joins drops it automatically.
 *
 * That is why leaving a pool still *deletes* the `pool_members` row: access is
 * genuinely revoked, and all 136 membership reads and 23 RLS policies keep
 * working untouched. The entry survives the deletion rather than being spared
 * from it.
 *
 * `retired_at` covers the other case — stopping participation while staying in
 * the pool, where the membership must survive but the entry must stop scoring.
 *
 * ## Two states, deliberately
 *
 *   detached  member_id IS NULL      — left or was removed; no pool access
 *   retired   retired_at IS NOT NULL — not competing; may still be a member
 *
 * An entry can be both. Restoring clears both.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type RetireReason = 'left' | 'removed' | 'stopped' | 'spare'

export type RetireResult = {
  retired: number
  entryIds: string[]
  error: string | null
}

export type RestoreResult = {
  restored: number
  entryIds: string[]
  error: string | null
}

/**
 * Mark entries as no longer competing. Their predictions are untouched.
 *
 * Idempotent: an already-retired entry keeps its original `retired_at`, so
 * re-running never rewrites when somebody left.
 */
export async function retireEntries(
  admin: SupabaseClient,
  args: { entryIds?: string[]; memberIds?: string[] },
  reason: RetireReason,
  actorUserId: string | null,
): Promise<RetireResult> {
  const { entryIds, memberIds } = args

  let q = admin
    .from('pool_entries')
    .update({
      retired_at: new Date().toISOString(),
      retired_reason: reason,
      retired_by: actorUserId,
    })
    .is('retired_at', null) // idempotent — never rewrite an earlier retirement

  if (entryIds?.length) q = q.in('entry_id', entryIds)
  else if (memberIds?.length) q = q.in('member_id', memberIds)
  else return { retired: 0, entryIds: [], error: null }

  const { data, error } = await q.select('entry_id, pool_id')
  if (error) return { retired: 0, entryIds: [], error: error.message }

  const rows = (data ?? []) as Array<{ entry_id: string; pool_id: string | null }>
  const ids = rows.map((r) => r.entry_id)

  // A Showdown fixture list that still names somebody who stopped participating
  // is worse than none. Regenerated HERE rather than in the four routes that
  // call this, because this is the single owner of "an entry stopped competing"
  // — and `pool_entries.pool_id` (migration 056) is what makes that possible
  // without threading the pool through every caller.
  //
  // Best-effort: retiring is the thing the member asked for, and it must not
  // fail because a schedule could not be rebuilt.
  const pools = [...new Set(rows.map((r) => r.pool_id).filter(Boolean))] as string[]
  if (pools.length > 0) {
    const { regenerateDuelSchedule } = await import('../league/duels')
    for (const poolId of pools) {
      const sched = await regenerateDuelSchedule(admin, poolId)
      if (sched.error) console.error('[retireEntries] duel schedule failed:', sched.error)
    }
  }

  return { retired: ids.length, entryIds: ids, error: null }
}

/**
 * Reunite a rejoining member with the entries they left behind.
 *
 * Finds every entry this person previously had in this pool — whether it was
 * detached (they left or were removed) or merely retired (they stopped
 * participating) — re-points it at their new membership row and clears the
 * retirement.
 *
 * Ryan's decision 15: their history is restored **in full**, including the
 * matchweeks that completed while they were away. Re-scoring is the caller's
 * job — see `rescoreRestoredEntries` — because it differs by competition and
 * should not hold up the join request.
 */
export async function restoreEntriesForMember(
  admin: SupabaseClient,
  args: { poolId: string; userId: string; memberId: string },
): Promise<RestoreResult> {
  const { poolId, userId, memberId } = args

  // The denormalised pool_id/user_id exist precisely for this lookup: a
  // detached entry has no membership to join through.
  const { data: found, error: findErr } = await admin
    .from('pool_entries')
    .select('entry_id')
    .eq('pool_id', poolId)
    .eq('user_id', userId)
    .or('member_id.is.null,retired_at.not.is.null')

  if (findErr) return { restored: 0, entryIds: [], error: findErr.message }

  const ids = (found ?? []).map((r) => r.entry_id as string)
  if (!ids.length) return { restored: 0, entryIds: [], error: null }

  const { error: updErr } = await admin
    .from('pool_entries')
    .update({
      member_id: memberId,
      retired_at: null,
      retired_reason: null,
      retired_by: null,
    })
    .in('entry_id', ids)

  if (updErr) return { restored: 0, entryIds: [], error: updErr.message }
  return { restored: ids.length, entryIds: ids, error: null }
}

/**
 * Re-score entries that have just been restored.
 *
 * A restored entry's predictions have been sitting unscored — the engines
 * reach entries through `pool_members`, so a detached entry was invisible to
 * them. Restoring re-attaches it, but nothing recomputes on its own: scoring
 * is triggered by a fixture changing, and those fixtures already finished.
 *
 * Best-effort by design. A failure here must not fail the join — the member is
 * already back in the pool with their predictions intact, and this is
 * idempotent, so any later scoring run repairs it.
 */
export async function rescoreRestoredEntries(
  admin: SupabaseClient,
  args: { poolId: string; leagueSeasonId: string | null },
): Promise<{ scored: number; error: string | null }> {
  const { leagueSeasonId } = args
  if (!leagueSeasonId) {
    // World Cup pools recompute through their own path; nothing league-shaped
    // to do here.
    return { scored: 0, error: null }
  }

  // `league_score_fixture` is per-fixture and idempotent, and it recomputes
  // every affected entry's totals from its score rows — so replaying the
  // season's completed fixtures restores the entry's full history, including
  // the matchweeks it missed while detached.
  const fixtureIds: string[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from('league_fixtures')
      .select('fixture_id, matchweek_id, league_matchweeks!inner(season_id)')
      .eq('is_completed', true)
      .eq('league_matchweeks.season_id', leagueSeasonId)
      .range(from, from + 999)
    if (error) return { scored: 0, error: error.message }
    const page = data ?? []
    fixtureIds.push(...page.map((f) => f.fixture_id as string))
    if (page.length < 1000) break
  }

  let scored = 0
  for (const fixtureId of fixtureIds) {
    const { error } = await admin.rpc('league_score_fixture', { p_fixture_id: fixtureId })
    if (!error) scored++
  }
  return { scored, error: null }
}
