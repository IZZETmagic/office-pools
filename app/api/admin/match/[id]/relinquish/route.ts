import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth'

// POST /api/admin/match/[id]/relinquish
// Releases a match's manual lock so the next API-Football sync run can
// overwrite it with live data. Super admin only.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSuperAdmin()
  if (auth.error) return auth.error
  const { supabase } = auth.data
  const { id } = await params

  const { error } = await supabase
    .from('matches')
    .update({ data_source: 'api', last_synced_at: null })
    .eq('match_id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
