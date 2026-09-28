import { type NextRequest, NextResponse } from 'next/server'
import { isBlockedHarnessPath } from '@/lib/devHarnessGate'
import { updateSession } from '@/lib/supabase/middleware'

// =============================================================
// Next 16 calls this file `proxy.ts`. It used to be `middleware.ts`.
// =============================================================
// ⭐ RENAMED 2026-09-27 with `npx @next/codemod@latest middleware-to-proxy .`.
// Next 16 deprecated the `middleware` convention — it still ran, but warned on
// every build ("The \"middleware\" file convention is deprecated") and is due to
// be removed. Three things about the new shape are load-bearing:
//
//   1. ⚠ THE FUNCTION MUST BE CALLED `proxy`. For a proxy file Next reads
//      `mod.proxy || mod.default` and nothing else, so a file renamed without
//      renaming its export throws `The Proxy file "/proxy" must export a function
//      named 'proxy' or a default function`. It fails loudly at build, not
//      silently at runtime — which is the one mercy in this rename.
//
//   2. `config` and `matcher` are UNCHANGED — same key, same regex semantics.
//      (Some third-party guides claim Next 16 renamed the export to
//      `proxyConfig`. It did not: the string does not appear anywhere in
//      next@16.1.6, and the official docs still export `config`.)
//
//   3. ⚠⚠ A PROXY ALWAYS RUNS ON THE NODE.JS RUNTIME, never the edge. There is
//      no opt-out — Next rejects a `runtime` route-segment export here with
//      "Route segment config is not allowed in Proxy file. Proxy always runs on
//      Node.js runtime". This is the only real behavioural change in the
//      migration; the rename itself is cosmetic. `updateSession` below is fine
//      on Node (`@supabase/ssr` is isomorphic and the same client already runs
//      in server components), but anything added here in future gets Node
//      semantics, not Edge ones.
//
// ⚠ `middleware.ts` AND `proxy.ts` MUST NEVER BOTH EXIST. Next throws "Both
// middleware file ... and proxy file ... are detected" and refuses to build or to
// start dev. So this was a move, not a copy.
// =============================================================

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
// that a proxy (this file, whatever it is called) is defence-in-depth and never
// the sole gate — CVE-2025-29927 let a crafted `x-middleware-subrequest` header
// skip middleware altogether, and that class of bypass is part of why the feature
// was renamed and demoted. The gate that actually holds is
// `app/dev-harness/layout.tsx`, a server component in the render path. This one
// exists so the refusal is decided before any Supabase work happens.
//
// ⚠ The condition itself lives in `lib/devHarnessGate.ts` so the two layers
// cannot drift apart.
// =============================================================

export async function proxy(request: NextRequest) {
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
    // Run the proxy on all routes except static files and images
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
