import { NextRequest, NextResponse } from 'next/server'
import { autoSubmitDraftEntries } from '@/lib/auto-submit'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  // Verify the request is from Vercel Cron
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await autoSubmitDraftEntries()

    return NextResponse.json({
      ok: true,
      ...result,
    })
  } catch (err) {
    console.error('[Cron] auto-submit error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
