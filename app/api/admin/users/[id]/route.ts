import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSuperAdmin()
  if (auth.error) return auth.error
  const { supabase } = auth.data
  const { id } = await params

  // Run all queries in parallel
  const [userRes, membershipsRes, auditTargetRes, auditPerformerRes, notesRes, flagRes] =
    await Promise.all([
      // 1. User record
      supabase
        .from('users')
        .select(
          'user_id, auth_user_id, email, username, full_name, is_super_admin, is_active, created_at, last_login'
        )
        .eq('user_id', id)
        .single(),

      // 2. Pool memberships with pool info and entries
      supabase
        .from('pool_members')
        .select(
          `
        member_id,
        role,
        joined_at,
        user_id,
        entry_fee_paid,
        pools:pool_id (
          pool_id,
          pool_name,
          pool_code,
          status,
          prediction_mode,
          created_at
        ),
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
      `
        )
        .eq('user_id', id)
        .order('joined_at', { ascending: false }),

      // 3. Audit log — actions taken ON this user
      supabase
        .from('admin_audit_log')
        .select(
          `
        id,
        action,
        performed_at,
        summary,
        details,
        performer:users!admin_audit_log_performed_by_fkey (username)
      `
        )
        .eq('target_user_id', id)
        .order('performed_at', { ascending: false })
        .limit(50),

      // 4. Audit log — actions performed BY this user
      supabase
        .from('admin_audit_log')
        .select(
          `
        id,
        action,
        performed_at,
        summary,
        details
      `
        )
        .eq('performed_by', id)
        .order('performed_at', { ascending: false })
        .limit(50),

      // 5. Admin notes (stored as audit entries with action='admin_note')
      supabase
        .from('admin_audit_log')
        .select(
          `
        id,
        performed_at,
        summary,
        performer:users!admin_audit_log_performed_by_fkey (username)
      `
        )
        .eq('target_user_id', id)
        .eq('action', 'admin_note')
        .order('performed_at', { ascending: false })
        .limit(20),

      // 6. Flag status — latest flag/unflag event
      supabase
        .from('admin_audit_log')
        .select('action, performed_at')
        .eq('target_user_id', id)
        .in('action', ['flag_user', 'unflag_user'])
        .order('performed_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

  if (userRes.error || !userRes.data) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  // Fetch pools this user is NOT in (for "Add to Pool" action)
  const memberPoolIds = (membershipsRes.data || [])
    .filter((m: any) => m.pools)
    .map((m: any) => m.pools.pool_id)

  const availablePoolsQuery = supabase
    .from('pools')
    .select('pool_id, pool_name, pool_code, status')
    .in('status', ['open', 'closed'])
    .order('pool_name')

  if (memberPoolIds.length > 0) {
    availablePoolsQuery.not('pool_id', 'in', `(${memberPoolIds.join(',')})`)
  }

  const { data: availablePools } = await availablePoolsQuery

  // For each pool membership, also fetch the pool's other members (for transfer ownership)
  const poolIds = (membershipsRes.data || [])
    .filter((m: any) => m.role === 'admin' && m.pools)
    .map((m: any) => m.pools.pool_id)

  let poolMembers: Record<string, { user_id: string; username: string }[]> = {}
  if (poolIds.length > 0) {
    const { data: members } = await supabase
      .from('pool_members')
      .select('pool_id, user_id, users:user_id (username)')
      .in('pool_id', poolIds)
      .neq('user_id', id)

    if (members) {
      for (const m of members as any[]) {
        if (!poolMembers[m.pool_id]) poolMembers[m.pool_id] = []
        poolMembers[m.pool_id].push({
          user_id: m.user_id,
          username: m.users?.username || 'Unknown',
        })
      }
    }
  }

  return NextResponse.json({
    user: userRes.data,
    memberships: membershipsRes.data || [],
    auditOnUser: auditTargetRes.data || [],
    auditByUser: auditPerformerRes.data || [],
    notes: notesRes.data || [],
    isFlagged: flagRes.data?.action === 'flag_user',
    poolMembers,
    availablePools: availablePools || [],
  })
}
