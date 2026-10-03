import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { readPoolCrew } from '@/lib/crews/read'

// The pool screens' crew line: "Part of Bermuda Office · 9 in · 3 spots saved". Members of the pool
// only; the names of who's still pending go to the pool's admin only (lib/crews/read.readPoolCrew).
export async function GET(_request: NextRequest, { params }: { params: Promise<{ pool_id: string }> }) {
  const { pool_id } = await params
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const view = await readPoolCrew(createAdminClient(), pool_id, auth.data.userData.user_id, Date.now())
  if (!view) return NextResponse.json({ error: 'Pool not found.' }, { status: 404 })
  return NextResponse.json(view)
}
