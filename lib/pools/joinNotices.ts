// =============================================================
// The join notices — composed when the outbox sends them (N3, 2026-10-06)
// =============================================================
//   pool_welcome   to the person who joined: an email with the pool's link, and a push
//   member_joined  to the pool's admin: a push
//
// Queued by joinPool (lib/pools/join.ts), one row per person, keyed to the membership. Read at
// SEND time: a member who has already left is not welcomed, and a pool whose admin has changed
// does not tell the old one. The words are unchanged from /api/notifications/pool-joined, which
// sent these from the browser's request until today.
// =============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { poolJoinedTemplate } from '@/lib/email/templates'
import type { Composed, OutboxRow } from '@/lib/notifications/outbox'

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL || 'https://sportpool.io'
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)
const unique = (xs: Array<string | null>) => [...new Set(xs.filter((x): x is string => x !== null))]

type PoolFact = { pool_name: string; pool_code: string; admin_user_id: string | null; archived_at: string | null }

/** The pools, the memberships still standing, and everyone's display name — one read each. */
async function facts(admin: SupabaseClient, rows: OutboxRow[]) {
  const [pools, members, users] = await Promise.all([
    admin.from('pools').select('pool_id, pool_name, pool_code, admin_user_id, archived_at')
      .in('pool_id', unique(rows.map((r) => r.pool_id))),
    admin.from('pool_members').select('member_id')
      .in('member_id', unique(rows.map((r) => str(r.payload.memberId)))),
    admin.from('users').select('user_id, full_name, username')
      .in('user_id', unique([...rows.map((r) => r.user_id), ...rows.map((r) => str(r.payload.joinerId))])),
  ])
  // A failed read is thrown, so the outbox retries — never read as "they left".
  for (const r of [pools, members, users]) if (r.error) throw new Error(r.error.message)
  return {
    pools: new Map(((pools.data ?? []) as Array<PoolFact & { pool_id: string }>).map((p) => [p.pool_id, p])),
    standing: new Set(((members.data ?? []) as Array<{ member_id: string }>).map((m) => m.member_id)),
    names: new Map(((users.data ?? []) as Array<{ user_id: string; full_name: string | null; username: string | null }>)
      .map((u) => [u.user_id, u.full_name || u.username || null])),
  }
}

/** Why a join notice is not sent, or null if it still should be. */
function stillTrue(row: OutboxRow, pool: PoolFact | undefined, standing: Set<string>): string | null {
  if (!pool) return 'not_found'
  if (pool.archived_at) return 'pool_archived'
  const memberId = str(row.payload.memberId)
  if (!memberId || !standing.has(memberId)) return 'no_longer_true'
  return null
}

export async function composePoolWelcome(admin: SupabaseClient, rows: OutboxRow[]): Promise<Map<number, Composed>> {
  const f = await facts(admin, rows)
  const out = new Map<number, Composed>()
  for (const row of rows) {
    const pool = row.pool_id ? f.pools.get(row.pool_id) : undefined
    const why = stillTrue(row, pool, f.standing)
    if (why || !pool || !row.user_id) {
      out.set(row.outbox_id, { skip: why ?? 'not_found' })
      continue
    }
    const { subject, html } = poolJoinedTemplate({
      userName: f.names.get(row.user_id) ?? 'there',
      poolName: pool.pool_name,
      poolCode: pool.pool_code,
      poolUrl: `${appUrl()}/pools/${row.pool_id}`,
    })
    out.set(row.outbox_id, {
      emails: [{ key: 'welcome', subject, html, tags: [{ name: 'category', value: 'pool-activity' }] }],
      push: {
        title: `Welcome to ${pool.pool_name}!`,
        body: 'You\'ve joined the pool. Make your predictions!',
        data: { type: 'pool_activity', pool_id: row.pool_id as string },
      },
    })
  }
  return out
}

export async function composeMemberJoined(admin: SupabaseClient, rows: OutboxRow[]): Promise<Map<number, Composed>> {
  const f = await facts(admin, rows)
  const out = new Map<number, Composed>()
  for (const row of rows) {
    const pool = row.pool_id ? f.pools.get(row.pool_id) : undefined
    const why = stillTrue(row, pool, f.standing)
    if (why || !pool) {
      out.set(row.outbox_id, { skip: why ?? 'not_found' })
      continue
    }
    // Told to whoever runs the pool NOW — an admin who handed it over is not.
    if (pool.admin_user_id !== row.user_id) {
      out.set(row.outbox_id, { skip: 'no_longer_true' })
      continue
    }
    const joiner = str(row.payload.joinerId)
    const memberName = (joiner && f.names.get(joiner)) || 'Someone'
    out.set(row.outbox_id, {
      emails: [],
      push: {
        title: `${memberName} joined ${pool.pool_name}`,
        body: 'A new member just joined your pool',
        data: { type: 'pool_activity', sub: 'member_joined', pool_id: row.pool_id as string },
      },
    })
  }
  return out
}
