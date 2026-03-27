import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { recalculatePool } from '@/lib/scoring'

// =============================================================
// POST /api/pools/:poolId/recalculate
// Triggers a v2 score recalculation for the pool.
// Pool members can trigger this (e.g. after leaving a pool).
// =============================================================
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ pool_id: string }> }
) {
  const { pool_id } = await params

  // Authenticate — supports both cookie auth (web) and Bearer token auth (iOS)
  let supabase: any
  let user: any = null

  const authHeader = request.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.replace('Bearer ', '')
    supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    )
    const { data } = await supabase.auth.getUser(token)
    user = data?.user
  } else {
    supabase = await createClient()
    const { data } = await supabase.auth.getUser()
    user = data?.user
  }

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const result = await recalculatePool({ poolId: pool_id })

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    entriesProcessed: result.entriesProcessed,
    matchScoresWritten: result.matchScoresWritten,
  })
}
