import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSuperAdmin()
  if (auth.error) return auth.error
  // Super admins may inspect ANY pool, including ones they aren't a member of.
  // The route is gated by requireSuperAdmin above, so read through the
  // service-role client to bypass per-member RLS on pools / round states / etc.
  const supabase = createAdminClient()
  const { id } = await params

  // Run all queries in parallel
  const [poolRes, membersRes, settingsRes, auditRes, roundStatesRes] = await Promise.all([
    // 1. Pool record with admin user + tournament
    supabase
      .from('pools')
      .select(`
        *,
        tournaments (name),
        admin_user:users!pools_admin_user_id_fkey (user_id, username, email, full_name)
      `)
      .eq('pool_id', id)
      .single(),

    // 2. Members with user info + entries
    supabase
      .from('pool_members')
      .select(`
        member_id,
        user_id,
        role,
        joined_at,
        entry_fee_paid,
        users:user_id (user_id, username, full_name, email),
        pool_entries (
          entry_id,
          entry_name,
          entry_number,
          has_submitted_predictions,
          predictions_submitted_at,
          total_points,
          point_adjustment,
          adjustment_reason,
          current_rank,
          match_points,
          bonus_points,
          created_at,
          fee_paid,
          fee_paid_at
        )
      `)
      .eq('pool_id', id)
      .order('joined_at', { ascending: true }),

    // 3. Pool settings
    supabase
      .from('pool_settings')
      .select('*')
      .eq('pool_id', id)
      .maybeSingle(),

    // 4. Audit log for this pool
    supabase
      .from('admin_audit_log')
      .select(`
        id,
        action,
        performed_at,
        summary,
        details,
        performer:users!admin_audit_log_performed_by_fkey (username)
      `)
      .eq('pool_id', id)
      .order('performed_at', { ascending: false })
      .limit(50),

    // 5. Round states (for progressive pools)
    supabase
      .from('pool_round_states')
      .select('*')
      .eq('pool_id', id)
      .order('created_at', { ascending: true }),
  ])

  if (poolRes.error || !poolRes.data) {
    return NextResponse.json({ error: 'Pool not found' }, { status: 404 })
  }

  // Overlay a round-aware `is_submitted` on every entry. The legacy
  // `has_submitted_predictions` flag is only ever set by the all-at-once
  // submission flow, so for progressive pools every entry was being
  // misreported as Pending. For progressive pools we look at
  // entry_round_submissions for the currently-open round; for everything
  // else we just mirror the legacy flag.
  const members = membersRes.data || []
  const allEntries = members.flatMap((m: any) => m.pool_entries || [])
  const isProgressive = (poolRes.data as any).prediction_mode === 'progressive'
  const openRound = isProgressive
    ? (roundStatesRes.data || []).find((rs: any) => rs.state === 'open')
    : null
  const submittedEntryIds = new Set<string>()

  if (openRound && allEntries.length > 0) {
    // entry_round_submissions only grants SELECT to entry owners and to
    // pool admins of the entry's pool. Super admins who aren't members
    // of the pool get filtered to zero rows under RLS, so use the
    // service-role client (the route is already gated by
    // requireSuperAdmin above).
    const adminSupabase = createAdminClient()
    const entryIds = allEntries.map((e: any) => e.entry_id)
    const { data: roundSubs } = await adminSupabase
      .from('entry_round_submissions')
      .select('entry_id, has_submitted')
      .eq('round_key', openRound.round_key)
      .in('entry_id', entryIds)
    for (const sub of roundSubs ?? []) {
      if ((sub as any).has_submitted) submittedEntryIds.add((sub as any).entry_id)
    }
  }

  const computeIsSubmitted = (e: any): boolean =>
    isProgressive ? submittedEntryIds.has(e.entry_id) : !!e.has_submitted_predictions

  for (const m of members as any[]) {
    if (Array.isArray(m.pool_entries)) {
      m.pool_entries = m.pool_entries.map((e: any) => ({
        ...e,
        is_submitted: computeIsSubmitted(e),
      }))
    }
  }

  const submittedCount = allEntries.filter(computeIsSubmitted).length

  // Fetch users NOT in this pool for "Add Member" action
  const memberUserIds = members.map((m: any) => m.user_id).filter(Boolean)
  const { data: availableUsers } = memberUserIds.length > 0
    ? await supabase
        .from('users')
        .select('user_id, username, email, full_name')
        .not('user_id', 'in', `(${memberUserIds.join(',')})`)
        .order('username', { ascending: true })
        .limit(100)
    : await supabase
        .from('users')
        .select('user_id, username, email, full_name')
        .order('username', { ascending: true })
        .limit(100)

  return NextResponse.json({
    pool: poolRes.data,
    members,
    settings: settingsRes.data || null,
    auditLog: auditRes.data || [],
    roundStates: roundStatesRes.data || [],
    stats: {
      totalMembers: members.length,
      totalEntries: allEntries.length,
      submittedEntries: submittedCount,
      pendingEntries: allEntries.length - submittedCount,
    },
    availableUsers: availableUsers || [],
    poolMembers: members.filter((m: any) => m.users).map((m: any) => ({
      user_id: m.user_id,
      username: m.users?.username || 'Unknown',
      role: m.role,
    })),
  })
}
