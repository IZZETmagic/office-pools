import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { sendBatchEmails } from '@/lib/email/send'
import { poolRestoredTemplate } from '@/lib/email/templates'
import { TOPICS } from '@/lib/email/topics'
import { sendPushToUsers } from '@/lib/push/apns'

// POST /api/pools/:pool_id/restore
//
// The undo half of /archive. Clears `pools.archived_at`, which puts the pool
// back in the active lists and puts its badges and points back into every
// member's cross-pool trophies and stats.
//
// Restore is ADMIN-ONLY (Ryan's call 2026-07-30): the same people who could
// archive it can undo it. Support handles true deletion, which is the only
// genuinely irreversible action left.
//
// Members were told when it was archived — including that it stopped counting
// toward their trophies — so they are told when it comes back. A trophy count
// moving in either direction without explanation is the thing this replaced.
//
// NOTE the admin check reads `pool_members` directly rather than going through
// an RLS-scoped select on `pools`: an archived pool is still visible to its
// members, so no special-casing is needed, but the membership row is the
// authority on who is an admin either way.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ pool_id: string }> },
) {
  const { pool_id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, userData } = auth.data

  const { data: membership } = await supabase
    .from('pool_members')
    .select('role')
    .eq('pool_id', pool_id)
    .eq('user_id', userData.user_id)
    .single()

  if (!membership || membership.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const adminClient = createAdminClient()

  const { data: pool, error: poolErr } = await adminClient
    .from('pools')
    .select('pool_name, archived_at')
    .eq('pool_id', pool_id)
    .single()

  if (poolErr || !pool) {
    return NextResponse.json({ error: 'Pool not found' }, { status: 404 })
  }
  if (!pool.archived_at) {
    // Idempotent: not archived is not an error, but do not re-notify.
    return NextResponse.json({ archived_at: null, already: true })
  }

  // archived_by is deliberately KEPT — it records who filed it away last, which
  // stays true after a restore and is useful the next time someone asks why.
  const { error: updateErr } = await adminClient
    .from('pools')
    .update({ archived_at: null, updated_at: new Date().toISOString() })
    .eq('pool_id', pool_id)

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  await adminClient.from('admin_audit_log').insert({
    action: 'pool_restored',
    performed_by: userData.user_id,
    pool_id,
    summary: `Restored pool "${pool.pool_name}"`,
    details: { pool_name: pool.pool_name, was_archived_at: pool.archived_at },
  })

  const { data: members } = await adminClient
    .from('pool_members')
    .select('user_id, users!inner(email, username, full_name)')
    .eq('pool_id', pool_id)
    .neq('user_id', userData.user_id)

  let notified = 0
  if (members && members.length > 0) {
    const { data: actor } = await adminClient
      .from('users')
      .select('username, full_name')
      .eq('user_id', userData.user_id)
      .single()

    const actorName = actor?.full_name || actor?.username || 'An admin'
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://sportpool.io'

    type EmbeddedUser = { email: string; username: string | null; full_name: string | null }
    const emails = members.map((m) => {
      const raw = m.users as unknown as EmbeddedUser | EmbeddedUser[]
      const u = Array.isArray(raw) ? raw[0] : raw
      const { subject, html } = poolRestoredTemplate({
        userName: u.full_name || u.username || 'there',
        poolName: pool.pool_name,
        actorName,
        poolUrl: `${appUrl}/pools/${pool_id}`,
      })
      return {
        to: u.email,
        subject,
        html,
        topicId: TOPICS.ADMIN,
        tags: [{ name: 'category', value: 'admin' }],
      }
    })

    await Promise.allSettled([
      sendBatchEmails(emails),
      sendPushToUsers(
        members.map((m) => m.user_id),
        {
          title: 'Pool restored',
          body: `${actorName} restored ${pool.pool_name}. It counts toward your trophies again.`,
          data: { type: 'admin', pool_id },
        },
        'ADMIN',
      ),
    ])
    notified = members.length
  }

  return NextResponse.json({ archived_at: null, notified })
}
