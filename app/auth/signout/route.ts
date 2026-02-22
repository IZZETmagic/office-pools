// This is a Route Handler - it runs on the server when the sign out form is submitted
// Route handlers use route.ts instead of page.tsx

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createClient()

  // Sign the user out of Supabase (clears their auth cookie)
  await supabase.auth.signOut()

  // Redirect them to the home page after signing out
  const { origin } = new URL(request.url)
  return NextResponse.redirect(new URL('/', origin))
}