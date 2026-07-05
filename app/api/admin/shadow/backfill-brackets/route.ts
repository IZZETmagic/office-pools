import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireSuperAdmin } from '@/lib/auth'
import { backfillResolvedBrackets } from '@/lib/scoring/shadowBrackets'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // long-running one-shot batch

// POST /api/admin/shadow/backfill-brackets
// Super-admin trigger for the belt-and-suspenders batch: materializes every
// submitted full_tournament entry's predicted bracket into shadow_resolved_brackets.
// Body (optional): { tournament_id?: string, pool_ids?: string[] }
//   pool_ids lets you run in chunks if a single call approaches the timeout.
export async function POST(request: NextRequest) {
  const auth = await requireSuperAdmin()
  if (auth.error) return auth.error

  const admin = createAdminClient()
  const body = await request.json().catch(() => ({} as any))
  const tournamentId: string =
    body?.tournament_id ||
    process.env.API_FOOTBALL_TOURNAMENT_ID ||
    '00000000-0000-0000-0000-000000000001'
  const poolIds: string[] | undefined = Array.isArray(body?.pool_ids) ? body.pool_ids : undefined

  const summary = await backfillResolvedBrackets(admin, tournamentId, { poolIds })
  console.log(
    `[shadow] backfill-brackets: ${summary.pools} pools, ${summary.entries} entries, ${summary.rowsWritten} rows` +
      (summary.errors.length ? `, ${summary.errors.length} errors` : ''),
  )
  if (summary.errors.length > 0) console.error('[shadow] backfill-brackets errors:', summary.errors)
  return NextResponse.json({ ok: summary.errors.length === 0, ...summary })
}
