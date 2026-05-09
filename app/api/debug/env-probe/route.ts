// TEMPORARY DEBUG ENDPOINT — delete immediately after verification.
// Returns metadata about CRON_SECRET so we can see what production reads,
// without exposing the full value.
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const v = process.env.CRON_SECRET
  return NextResponse.json({
    has_value: typeof v === 'string',
    length: typeof v === 'string' ? v.length : 0,
    first_4: typeof v === 'string' ? v.slice(0, 4) : null,
    last_4: typeof v === 'string' ? v.slice(-4) : null,
    api_football_key_present: !!process.env.API_FOOTBALL_KEY,
    vercel_env: process.env.VERCEL_ENV ?? null,
    deployment_id: process.env.VERCEL_DEPLOYMENT_ID ?? null,
  })
}
