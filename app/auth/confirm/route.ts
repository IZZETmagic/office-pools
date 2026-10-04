import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { CONFIRM_FAILED_PATH, confirmDestination } from '@/lib/authConfirm'

// The reset email's link. Verifies the token hash on the server, which writes
// the session cookies, then lands on the page for that link type. See
// lib/authConfirm.ts for why the destination never comes from the URL.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const tokenHash = searchParams.get('token_hash')
  const target = confirmDestination(searchParams.get('type'))

  if (tokenHash && target) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ type: target.type, token_hash: tokenHash })
    if (!error) {
      return NextResponse.redirect(`${origin}${target.path}`)
    }
    console.warn('[auth/confirm] link not verified:', error.code ?? error.message)
  }

  return NextResponse.redirect(`${origin}${CONFIRM_FAILED_PATH}`)
}
