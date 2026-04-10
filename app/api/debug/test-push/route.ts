import { NextResponse } from 'next/server'
import { sendPushToUser } from '@/lib/push/apns'

// TEMPORARY debug endpoint — remove after testing
export async function GET() {
  const userId = '059bda58-a237-4dec-91d5-4dfdaa62b72d' // Ryan

  try {
    console.log('[DebugPush] Starting test push...')
    const result = await sendPushToUser(userId, {
      title: 'Push Test',
      body: 'HTTP/2 APNs fix verification',
      data: { type: 'community', pool_id: 'test' },
    })
    console.log('[DebugPush] Result:', JSON.stringify(result))
    return NextResponse.json({ success: true, result })
  } catch (err) {
    console.error('[DebugPush] Error:', err)
    return NextResponse.json({
      success: false,
      error: String(err),
      stack: err instanceof Error ? err.stack : undefined,
    })
  }
}
