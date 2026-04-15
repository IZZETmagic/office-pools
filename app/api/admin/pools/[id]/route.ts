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
          created_at
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

  // Compute aggregate stats
  const members = membersRes.data || []
  const allEntries = members.flatMap((m: any) => m.pool_entries || [])
  const submittedCount = allEntries.filter((e: any) => e.has_submitted_predictions).length

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
