import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { dismissCrewPrompt } from '@/lib/crews/store'
import { crewResponse } from '@/lib/crews/http'

// "Not now" on Keep this group together? — for good. The pool's admin only.
export async function POST(_request: NextRequest, { params }: { params: Promise<{ pool_id: string }> }) {
  const { pool_id } = await params
  const auth = await requireAuth()
  if (auth.error) return auth.error
  return crewResponse(await dismissCrewPrompt(createAdminClient(), { userId: auth.data.userData.user_id, poolId: pool_id }))
}
