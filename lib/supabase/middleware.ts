import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import {
  isAllowedTester,
  isTesterGateEnabled,
  isTesterGateExempt,
} from '@/lib/testerGate'

// Routes that require authentication
const protectedRoutes = ['/dashboard', '/pools', '/profile', '/join']

// Routes that authenticated users should be redirected away from
const authRoutes = ['/', '/login', '/signup', '/forgot-password']

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refreshes the auth token and checks if user is logged in
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // If user is NOT logged in and trying to access a protected route → redirect to login
  if (!user && protectedRoutes.some((route) => pathname.startsWith(route))) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    // Preserve the intended destination so we can redirect back after login
    const redirectTo = pathname + request.nextUrl.search
    url.searchParams.set('redirectTo', redirectTo)
    return NextResponse.redirect(url)
  }

  // Tester gate — preview builds only, never production. See lib/testerGate.ts
  // for why this lives here instead of behind Vercel's deployment protection.
  // Read each variable by static access: middleware is bundled for the Edge
  // runtime, where a destructured `process.env` is not reliably populated.
  if (
    user &&
    isTesterGateEnabled(process.env.VERCEL_ENV, process.env.TESTER_ALLOWLIST) &&
    !isTesterGateExempt(pathname) &&
    !isAllowedTester(user.email, process.env.TESTER_ALLOWLIST)
  ) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'This build is limited to invited testers.' },
        { status: 403 }
      )
    }
    const url = request.nextUrl.clone()
    url.pathname = '/not-a-tester'
    url.search = ''
    return NextResponse.redirect(url)
  }

  // If user IS logged in and trying to access login/signup → redirect to dashboard
  if (user && authRoutes.some((route) => pathname === route)) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
