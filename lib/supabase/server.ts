// This is the SERVER-SIDE Supabase client
// Used in pages that need to check if a user is logged in
// Different from client.ts which is used in forms and interactive components

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // setAll can be called from a Server Component where cookies
            // are read-only. This is safe to ignore since the middleware
            // handles token refresh.
          }
        },
      },
    }
  )
}