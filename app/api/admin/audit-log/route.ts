import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { withPerfLogging } from '@/lib/api-perf'

async function handlePOST(request: NextRequest) {
  const supabase = await createClient()

  // 1. Authenticate
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 2. Verify super admin
  const { data: userData } = await supabase
    .from('users')
    .select('user_id, is_super_admin')
    .eq('auth_user_id', user.id)
    .single()

  if (!userData?.is_super_admin) {
    return NextResponse.json({ error: 'Super admin required' }, { status: 403 })
  }

  // 3. Parse the audit entry
  const { action, match_id, target_user_id, pool_id, details, summary } = await request.json()

  if (!action) {
    return NextResponse.json({ error: 'action is required' }, { status: 400 })
  }

  // 4. Insert audit record
  const { error: insertError } = await supabase
    .from('admin_audit_log')
    .insert({
      action,
      performed_by: userData.user_id,
      match_id: match_id || null,
      target_user_id: target_user_id || null,
      pool_id: pool_id || null,
      details: details || {},
      summary: summary || null,
    })

  if (insertError) {
    console.error('[Audit Log] Insert failed:', insertError)
    return NextResponse.json({ error: 'Failed to write audit log' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

export const POST = withPerfLogging('/api/admin/audit-log', handlePOST)
