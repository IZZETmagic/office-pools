import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth'
import { withPerfLogging } from '@/lib/api-perf'

async function handlePOST(request: NextRequest) {
  const auth = await requireSuperAdmin()
  if (auth.error) return auth.error
  const { supabase, userData } = auth.data

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
