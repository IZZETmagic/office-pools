import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Verify authentication
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { terms_version } = await request.json()
    if (!terms_version) {
      return NextResponse.json({ error: 'terms_version is required' }, { status: 400 })
    }

    // Look up the user_id from the users table
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('user_id')
      .eq('auth_user_id', user.id)
      .single()

    if (userError || !userData) {
      console.error('[Terms] Failed to find user:', userError)
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
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
