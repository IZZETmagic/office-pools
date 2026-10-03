import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { crewNoticesEnabled, runCrewNotices } from '@/lib/crews/notify'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Crew seat notices and the one reminder (lib/crews/notify.ts). Meant to run every ~15 minutes from
// pg_cron, like the league outbox; NOT YET SCHEDULED — that is a deploy step, after Ryan approves
// the wording and turns `crew_notices_enabled` on.
//
// Auth: Bearer <CRON_SECRET>, or a super admin so it can be run by hand.
async function handle(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const isCron = !!cronSecret && request.headers.get('authorization') === `Bearer ${cronSecret}`
  if (!isCron) {
    const auth = await requireSuperAdmin()
    if (auth.error) return auth.error
  }
  const admin = createAdminClient()
  if (!(await crewNoticesEnabled(admin))) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'crew_notices_enabled is not true' })
  }
  const result = await runCrewNotices(admin, Date.now())
  return NextResponse.json({ ok: true, ...result })
}

export async function GET(request: NextRequest) {
  return handle(request)
}

export async function POST(request: NextRequest) {
  return handle(request)
}
