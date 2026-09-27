import { type NextRequest, NextResponse } from 'next/server'
import { isBlockedHarnessPath } from '@/lib/devHarnessGate'
import { updateSession } from '@/lib/supabase/middleware'

// =============================================================
// The design harnesses never reach the public site
// =============================================================
// ⚠⚠ `app/dev-harness/` IS ELEVEN UNGATED PUBLIC PAGES. Only two of them check
// anything themselves, and nothing here used to stop the other nine — they were
// invisible in production purely because the branch holding them had never been
// deployed. The moment the avatar work merges to master that accident ends and
// every harness answers 200 to anyone who guesses the path.
//
// ⭐ THIS IS THE CHEAP LAYER, NOT THE LOAD-BEARING ONE. Vercel's own guidance is
// that routing middleware is defence-in-depth and never the sole gate — CVE
// 2025-29927 let a crafted `x-middleware-subrequest` header skip middleware
// altogether. The gate that actually holds is `app/dev-harness/layout.tsx`, a
// server component in the render path. This one exists so the refusal is decided
// before any Supabase work happens.
//
// ⚠ The condition itself lives in `lib/devHarnessGate.ts` so the two layers
// cannot drift apart.
// =============================================================

export async function middleware(request: NextRequest) {
  // ⚠ Before `updateSession`, deliberately. Refreshing a Supabase session for a
  // request that is about to be refused is wasted work, and the 404 must not
  // depend on whether the caller is signed in.
  if (isBlockedHarnessPath(request.nextUrl.pathname)) {
    // ⚠ A BARE 404, not a rewrite to the styled not-found page. A rewrite would
    // render the app shell and confirm the route exists to anyone reading the
    // response; this says nothing.
    return new NextResponse(null, { status: 404 })
  }

  return await updateSession(request)
}

export const config = {
  matcher: [
    // Run middleware on all routes except static files and images
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
