// =============================================================
// What an admin's actions tell the members — queued and composed (N3, 2026-10-06)
// =============================================================
//   pool_archived   every member but the admin who did it
//   pool_restored   every member but the admin who did it
//   points_adjusted the entry's owner, from the logged adjustment (see below)
//   member_removed  the member an admin removed — only if they really were (see below)
//
// Queued by the server route that performs the action, so the notice exists only if the action
// happened, and sent by the notification outbox — once, retried if a send fails. Composed at SEND
// time: a pool restored since it was archived does not announce "archived", and somebody who has
// left since is not told. The words are unchanged from the routes that sent these inline.
// =============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { memberRemovedTemplate, poolArchivedTemplate, poolRestoredTemplate, pointsAdjustedTemplate } from '@/lib/email/templates'
import { enqueue, type Composed, type OutboxRow } from '@/lib/notifications/outbox'

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL || 'https://sportpool.io'
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)

/** Everyone in the pool except the admin who acted. */
async function membersExcept(admin: SupabaseClient, poolId: string, actorId: string): Promise<string[]> {
  const { data, error } = await admin.from('pool_members').select('user_id').eq('pool_id', poolId).neq('user_id', actorId)
  if (error) throw new Error(`pool_members: ${error.message}`)
  return ((data ?? []) as Array<{ user_id: string }>).map((m) => m.user_id)
}

/** Queue "archived" for every member but the admin. The archive's own timestamp keys it. */
export async function queuePoolArchived(
  admin: SupabaseClient,
  a: { poolId: string; actorId: string; archivedAt: string },
): Promise<number[]> {
  const members = await membersExcept(admin, a.poolId, a.actorId)
  return enqueue(admin, members.map((userId) => ({
    type: 'pool_archived' as const,
    userId,
    poolId: a.poolId,
    dedupKey: `pool_archived:${a.poolId}:${a.archivedAt}:${userId}`,
    payload: { actorId: a.actorId, archivedAt: a.archivedAt },
  })))
}

/** Queue "restored" for every member but the admin. */
export async function queuePoolRestored(
  admin: SupabaseClient,
  a: { poolId: string; actorId: string; restoredAt: string },
): Promise<number[]> {
  const members = await membersExcept(admin, a.poolId, a.actorId)
  return enqueue(admin, members.map((userId) => ({
    type: 'pool_restored' as const,
    userId,
    poolId: a.poolId,
    dedupKey: `pool_restored:${a.poolId}:${a.restoredAt}:${userId}`,
    payload: { actorId: a.actorId },
  })))
}

/** The pools, who is still in them, and everyone's display name — one read each. */
async function facts(admin: SupabaseClient, rows: OutboxRow[]) {
  const poolIds = [...new Set(rows.map((r) => r.pool_id).filter((p): p is string => !!p))]
  const userIds = [...new Set(rows.flatMap((r) => [r.user_id, str(r.payload.actorId)]).filter((u): u is string => !!u))]
  const [pools, members, users] = await Promise.all([
    admin.from('pools').select('pool_id, pool_name, archived_at').in('pool_id', poolIds),
    admin.from('pool_members').select('pool_id, user_id').in('pool_id', poolIds),
    admin.from('users').select('user_id, full_name, username').in('user_id', userIds),
  ])
  // A failed read is thrown, so the outbox retries — never read as "they left".
  for (const r of [pools, members, users]) if (r.error) throw new Error(r.error.message)
  return {
    pools: new Map(((pools.data ?? []) as Array<{ pool_id: string; pool_name: string; archived_at: string | null }>).map((p) => [p.pool_id, p])),
    inPool: new Set(((members.data ?? []) as Array<{ pool_id: string; user_id: string }>).map((m) => `${m.pool_id}:${m.user_id}`)),
    names: new Map(((users.data ?? []) as Array<{ user_id: string; full_name: string | null; username: string | null }>)
      .map((u) => [u.user_id, u.full_name || u.username || null])),
  }
}

export async function composePoolArchived(admin: SupabaseClient, rows: OutboxRow[]): Promise<Map<number, Composed>> {
  const f = await facts(admin, rows)
  const out = new Map<number, Composed>()
  for (const row of rows) {
    const pool = row.pool_id ? f.pools.get(row.pool_id) : undefined
    if (!pool || !row.user_id) { out.set(row.outbox_id, { skip: 'not_found' }); continue }
    // Restored since, or archived again later: this archive is no longer the news.
    const archivedAt = str(row.payload.archivedAt)
    if (!pool.archived_at || !archivedAt || Date.parse(pool.archived_at) !== Date.parse(archivedAt)) {
      out.set(row.outbox_id, { skip: 'no_longer_true' }); continue
    }
    if (!f.inPool.has(`${row.pool_id}:${row.user_id}`)) { out.set(row.outbox_id, { skip: 'no_longer_true' }); continue }
    const actorName = f.names.get(str(row.payload.actorId) ?? '') || 'An admin'
    const { subject, html } = poolArchivedTemplate({
      userName: f.names.get(row.user_id) || 'there',
      poolName: pool.pool_name,
      actorName,
      archiveUrl: `${appUrl()}/profile?tab=archived`,
    })
    out.set(row.outbox_id, {
      emails: [{ key: 'archived', subject, html, tags: [{ name: 'category', value: 'admin' }] }],
      push: {
        title: 'Pool archived',
        body: `${actorName} archived ${pool.pool_name}. Nothing is lost — find it under Profile → Archived.`,
        data: { type: 'admin', pool_id: row.pool_id as string },
      },
    })
  }
  return out
}

export async function composePoolRestored(admin: SupabaseClient, rows: OutboxRow[]): Promise<Map<number, Composed>> {
  const f = await facts(admin, rows)
  const out = new Map<number, Composed>()
  for (const row of rows) {
    const pool = row.pool_id ? f.pools.get(row.pool_id) : undefined
    if (!pool || !row.user_id) { out.set(row.outbox_id, { skip: 'not_found' }); continue }
    // Archived again since: "restored" is no longer true.
    if (pool.archived_at) { out.set(row.outbox_id, { skip: 'no_longer_true' }); continue }
    if (!f.inPool.has(`${row.pool_id}:${row.user_id}`)) { out.set(row.outbox_id, { skip: 'no_longer_true' }); continue }
    const actorName = f.names.get(str(row.payload.actorId) ?? '') || 'An admin'
    const { subject, html } = poolRestoredTemplate({
      userName: f.names.get(row.user_id) || 'there',
      poolName: pool.pool_name,
      actorName,
      poolUrl: `${appUrl()}/pools/${row.pool_id}`,
    })
    out.set(row.outbox_id, {
      emails: [{ key: 'restored', subject, html, tags: [{ name: 'category', value: 'admin' }] }],
      push: {
        title: 'Pool restored',
        body: `${actorName} restored ${pool.pool_name}. It counts toward your trophies again.`,
        data: { type: 'admin', pool_id: row.pool_id as string },
      },
    })
  }
  return out
}

// =============================================================
// points_adjusted — built from the ADJUSTMENT, never from a request (2026-10-06)
// =============================================================
// Until today /api/notifications/points-adjusted emailed whatever amount, reason and total it was
// sent, to any user id it was given — so any pool admin could send any member of the site an email
// saying anything. Now the route finds the caller's own adjustment in point_adjustments and queues
// it by its id; this composer reads the amount and reason from that row, and the new total from
// the entry as it stands when the notice goes.

export async function composePointsAdjusted(admin: SupabaseClient, rows: OutboxRow[]): Promise<Map<number, Composed>> {
  const out = new Map<number, Composed>()
  const ids = [...new Set(rows.map((r) => str(r.payload.adjustmentId)).filter((x): x is string => !!x))]
  const { data: adjustments, error } = await admin
    .from('point_adjustments')
    .select('id, entry_id, pool_id, amount, reason')
    .in('id', ids)
  if (error) throw new Error(`point_adjustments: ${error.message}`)
  const byId = new Map(((adjustments ?? []) as Array<{ id: string; entry_id: string; pool_id: string; amount: number; reason: string }>).map((a) => [a.id, a]))
  const entryIds = [...new Set([...byId.values()].map((a) => a.entry_id))]
  const [entries, f] = await Promise.all([
    admin.from('pool_entries').select('entry_id, entry_name, user_id, scored_total_points, retired_at').in('entry_id', entryIds),
    facts(admin, rows),
  ])
  if (entries.error) throw new Error(`pool_entries: ${entries.error.message}`)
  const entryById = new Map(((entries.data ?? []) as Array<{ entry_id: string; entry_name: string; user_id: string; scored_total_points: number | null; retired_at: string | null }>).map((e) => [e.entry_id, e]))

  for (const row of rows) {
    const adj = byId.get(str(row.payload.adjustmentId) ?? '')
    const entry = adj ? entryById.get(adj.entry_id) : undefined
    const pool = row.pool_id ? f.pools.get(row.pool_id) : undefined
    if (!adj || !entry || !pool || adj.pool_id !== row.pool_id) { out.set(row.outbox_id, { skip: 'not_found' }); continue }
    // Only ever to the entry's owner, and not about an entry they have since left behind.
    if (entry.user_id !== row.user_id || entry.retired_at) { out.set(row.outbox_id, { skip: 'no_longer_true' }); continue }
    const sign = adj.amount > 0 ? '+' : ''
    const { subject, html } = pointsAdjustedTemplate({
      userName: f.names.get(entry.user_id) || 'there',
      poolName: pool.pool_name,
      entryName: entry.entry_name,
      adjustment: adj.amount,
      reason: adj.reason,
      newTotal: entry.scored_total_points ?? 0,
      poolUrl: `${appUrl()}/pools/${row.pool_id}`,
    })
    out.set(row.outbox_id, {
      emails: [{ key: 'adjusted', subject, html, tags: [{ name: 'category', value: 'points_adjusted' }] }],
      push: {
        title: `Points Adjusted (${sign}${adj.amount})`,
        body: `${pool.pool_name}: ${adj.reason}`,
        data: { type: 'admin', pool_id: row.pool_id as string },
      },
    })
  }
  return out
}

// =============================================================
// member_removed — only for somebody who really was removed (2026-10-06)
// =============================================================
// The route checks the removal happened (see app/api/notifications/member-removed). At send
// time: somebody who has rejoined since is no longer "removed", and is not told they are.

export async function composeMemberRemoved(admin: SupabaseClient, rows: OutboxRow[]): Promise<Map<number, Composed>> {
  const f = await facts(admin, rows)
  const out = new Map<number, Composed>()
  for (const row of rows) {
    const pool = row.pool_id ? f.pools.get(row.pool_id) : undefined
    if (!pool || !row.user_id) { out.set(row.outbox_id, { skip: 'not_found' }); continue }
    if (f.inPool.has(`${row.pool_id}:${row.user_id}`)) { out.set(row.outbox_id, { skip: 'no_longer_true' }); continue }
    const { subject, html } = memberRemovedTemplate({ userName: f.names.get(row.user_id) || 'there', poolName: pool.pool_name })
    out.set(row.outbox_id, {
      emails: [{ key: 'removed', subject, html, tags: [{ name: 'category', value: 'admin' }] }],
      push: { title: 'Removed from Pool', body: `You've been removed from ${pool.pool_name}`, data: { type: 'admin', pool_id: row.pool_id as string } },
    })
  }
  return out
}

// =============================================================
// The checks the routes make before queueing — kept here so they are tested
// =============================================================

/** The caller's own adjustment to this person's entry in this pool, logged in the last ten minutes. */
export async function recentAdjustmentBy(
  admin: SupabaseClient,
  a: { poolId: string; callerId: string; targetUserId: string; now?: number },
): Promise<string | null> {
  const { data: entries, error } = await admin
    .from('pool_entries')
    .select('entry_id')
    .eq('pool_id', a.poolId)
    .eq('user_id', a.targetUserId)
  if (error) throw new Error(`pool_entries: ${error.message}`)
  const entryIds = ((entries ?? []) as Array<{ entry_id: string }>).map((e) => e.entry_id)
  if (entryIds.length === 0) return null
  const { data: adjustment, error: adjErr } = await admin
    .from('point_adjustments')
    .select('id')
    .eq('pool_id', a.poolId)
    .eq('created_by', a.callerId)
    .in('entry_id', entryIds)
    .gte('created_at', new Date((a.now ?? Date.now()) - 10 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (adjErr) throw new Error(`point_adjustments: ${adjErr.message}`)
  return (adjustment as { id: string } | null)?.id ?? null
}

/**
 * What an admin's removal leaves behind: no membership, and an entry in the pool that is detached
 * but NOT retired (leaving through /leave retires it instead). Returns that entry, or null when
 * there is no removal to tell anybody about.
 */
export async function removalEvidence(
  admin: SupabaseClient,
  a: { poolId: string; userId: string },
): Promise<string | null> {
  const [{ data: stillIn, error: mErr }, { data: detached, error: eErr }] = await Promise.all([
    admin.from('pool_members').select('member_id').eq('pool_id', a.poolId).eq('user_id', a.userId).maybeSingle(),
    admin.from('pool_entries').select('entry_id').eq('pool_id', a.poolId).eq('user_id', a.userId)
      .is('member_id', null).is('retired_at', null).order('entry_id').limit(1),
  ])
  if (mErr) throw new Error(`pool_members: ${mErr.message}`)
  if (eErr) throw new Error(`pool_entries: ${eErr.message}`)
  if (stillIn) return null
  return ((detached ?? []) as Array<{ entry_id: string }>)[0]?.entry_id ?? null
}
