import { NextResponse } from 'next/server'
import { sendPushNotification } from '@/lib/push/apns'
import { createAdminClient } from '@/lib/supabase/server'

// TEMPORARY debug endpoint — remove after testing
export async function GET() {
  const userId = '059bda58-a237-4dec-91d5-4dfdaa62b72d' // Ryan

  try {
    const supabase = createAdminClient()
    const { data: tokens } = await supabase
      .from('push_tokens')
      .select('token, environment')
      .eq('user_id', userId)

    console.log('[DebugPush] Found tokens:', JSON.stringify(tokens))

    if (!tokens || tokens.length === 0) {
      return NextResponse.json({ success: false, error: 'No tokens found' })
    }

    const results = []
    for (const t of tokens) {
      console.log(`[DebugPush] Sending to token ${t.token.slice(0, 16)}... env=${t.environment} sandbox=${t.environment === 'development'}`)
      const ok = await sendPushNotification(
        t.token,
        {
          title: 'Push Debug Test',
          body: 'HTTP/2 APNs verification — check Vercel logs',
          data: { type: 'community', pool_id: 'test' },
        },
        t.environment === 'development'
      )
      results.push({ token: t.token.slice(0, 16), env: t.environment, sent: ok })
    }

    return NextResponse.json({ success: true, results })
  } catch (err) {
    console.error('[DebugPush] Error:', err)
    return NextResponse.json({
      success: false,
      error: String(err),
      stack: err instanceof Error ? err.stack : undefined,
    })
  }
}
