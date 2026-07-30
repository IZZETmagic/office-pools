import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { sendBatchEmails } from '@/lib/email/send'
import { poolArchivedTemplate } from '@/lib/email/templates'
import { TOPICS } from '@/lib/email/topics'
import { sendPushToUsers } from '@/lib/push/apns'

// POST /api/pools/:pool_id/archive
//
// Replaces "Delete Pool" (decision 2026-07-25, migration 040). Archiving is
// reversible and destroys nothing: it stamps `pools.archived_at`, and every
// read surface treats an archived pool as read-only and excludes it from
// cross-pool stats and trophies until it is restored.
//
// This is ONE server-side operation rather than a client write plus a separate
// notification call, so an archive can never land without the people in the
// pool being told. The members did not choose this — an admin did — and their
// trophy counts change because of it, so the disclosure is not optional.
//
// WHY NOT `status = 'archived'`: `status` is the COMPETITION lifecycle
// (open / completed); archive is VISIBILITY. A pool can be completed AND
// archived. The previous "Archive" button set status='completed', which
// destroyed the lifecycle value on the way past.
//
// The audit trail goes to `admin_audit_log` (one row per action), NOT to
// `pool_membership_events` — nobody's membership changes when a pool is
// archived, and that table is CHECK-constrained to ('left','removed').
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
  if (pool.archived_at) {
    // Idempotent: already archived is not an error, but do not re-notify.
    return NextResponse.json({ archived_at: pool.archived_at, archived_by: null, already: true })
  }

  const archivedAt = new Date().toISOString()

  const { error: updateErr } = await adminClient
    .from('pools')
    .update({ archived_at: archivedAt, archived_by: userData.user_id, updated_at: archivedAt })
    .eq('pool_id', pool_id)

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  await adminClient.from('admin_audit_log').insert({
    action: 'pool_archived',
    performed_by: userData.user_id,
    pool_id,
    summary: `Archived pool "${pool.pool_name}"`,
    details: { pool_name: pool.pool_name, archived_at: archivedAt },
  })

  // Tell every member except the admin who did it.
  const { data: members } = await adminClient
    .from('pool_members')
    .select('user_id, users!inner(email, username, full_name)')
    .eq('pool_id', pool_id)
    .neq('user_id', userData.user_id)

  let notified = 0
  if (members && members.length > 0) {
    // requireAuth's userData carries only user_id/is_super_admin, so the
    // actor's display name has to be read separately.
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
      const { subject, html } = poolArchivedTemplate({
        userName: u.full_name || u.username || 'there',
        poolName: pool.pool_name,
        actorName,
        archiveUrl: `${appUrl}/profile?tab=archived`,
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
          title: 'Pool archived',
          body: `${actorName} archived ${pool.pool_name}. Nothing is lost — find it under Profile → Archived.`,
          data: { type: 'admin', pool_id },
        },
        'ADMIN',
      ),
    ])
    notified = members.length
  }

  return NextResponse.json({
    archived_at: archivedAt,
    archived_by: userData.user_id,
    notified,
  })
}
