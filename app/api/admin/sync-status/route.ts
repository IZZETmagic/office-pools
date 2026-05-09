import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// GET /api/admin/sync-status
// Returns the last 20 sync_runs and the current value of sync_enabled.
//
// PATCH /api/admin/sync-status   body: { sync_enabled: boolean }
// Flips the runtime kill switch. Super admin only.
export async function GET() {
  const auth = await requireSuperAdmin()
  if (auth.error) return auth.error
  const { supabase } = auth.data

  const [runsRes, settingRes] = await Promise.all([
    supabase
      .from('sync_runs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(20),
    supabase
      .from('sync_settings')
      .select('setting_value, updated_at')
      .eq('setting_key', 'sync_enabled')
      .maybeSingle(),
  ])

  return NextResponse.json({
    runs: runsRes.data ?? [],
    sync_enabled:
      settingRes.data?.setting_value === true ||
      settingRes.data?.setting_value === 'true',
    updated_at: settingRes.data?.updated_at ?? null,
  })
}

export async function PATCH(request: NextRequest) {
  const auth = await requireSuperAdmin()
  if (auth.error) return auth.error
  const { supabase, userData } = auth.data

  const body = await request.json().catch(() => null)
  const enabled = body?.sync_enabled
  if (typeof enabled !== 'boolean') {
    return NextResponse.json({ error: 'sync_enabled must be boolean' }, { status: 400 })
  }

  const { error } = await supabase
    .from('sync_settings')
    .upsert(
      {
        setting_key: 'sync_enabled',
        setting_value: enabled,
        updated_at: new Date().toISOString(),
        updated_by: userData.user_id,
      },
      { onConflict: 'setting_key' }
    )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, sync_enabled: enabled })
}
