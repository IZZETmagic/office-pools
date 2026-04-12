import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { withPerfLogging } from '@/lib/api-perf'

async function handlePOST(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (auth.error) return auth.error
    const { supabase, userData } = auth.data

    const { terms_version } = await request.json()
    if (!terms_version) {
      return NextResponse.json({ error: 'terms_version is required' }, { status: 400 })
    }

    // Capture IP address and user agent for audit trail
    const ipAddress =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      null
    const userAgent = request.headers.get('user-agent') || null

    // Insert the terms agreement record
    const { error: insertError } = await supabase
      .from('terms_agreements')
      .insert({
        user_id: userData.user_id,
        terms_version,
        ip_address: ipAddress,
        user_agent: userAgent,
      })

    if (insertError) {
      console.error('[Terms] Failed to log agreement:', insertError)
      return NextResponse.json({ error: 'Failed to log agreement' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[Terms] Exception:', err)
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}

export const POST = withPerfLogging('/api/terms-agreement', handlePOST)
