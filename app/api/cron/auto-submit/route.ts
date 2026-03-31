import { NextRequest, NextResponse } from 'next/server'
import { autoSubmitDraftEntries, autoSubmitProgressiveRounds, autoCompleteProgressiveRounds } from '@/lib/auto-submit'
import { autoArchivePools } from '@/lib/auto-archive'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  // Verify the request is from Vercel Cron
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Run all tasks in parallel
    const [submitResult, progressiveResult, autoCompleteResult, archiveResult] = await Promise.all([
      autoSubmitDraftEntries(),
      autoSubmitProgressiveRounds(),
      autoCompleteProgressiveRounds(),
      autoArchivePools(),
    ])

    return NextResponse.json({
      ok: true,
      autoSubmit: submitResult,
      progressiveAutoSubmit: progressiveResult,
      progressiveAutoComplete: autoCompleteResult,
      autoArchive: archiveResult,
    })
  } catch (err) {
    console.error('[Cron] error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
