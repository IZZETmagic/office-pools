import { notFound } from 'next/navigation'

import { isPublicProduction } from '@/lib/devHarnessGate'

// =============================================================
// The harnesses do not exist on the public site
// =============================================================
// ⭐ THE SECOND OF TWO LAYERS, AND THE LOAD-BEARING ONE. `middleware.ts` already
// refuses `/dev-harness/*` when VERCEL_ENV is 'production', and that is the cheap
// early exit — but Vercel's own guidance is that routing middleware is
// defence-in-depth and never the sole gate, the reason being CVE-2025-29927,
// where a crafted `x-middleware-subrequest` header skipped middleware entirely.
// A layout is a server component: it runs as part of rendering the page, so
// there is no request shape that reaches the harness and misses this.
//
// ⚠ NINE OF THE ELEVEN HARNESSES CHECK NOTHING THEMSELVES. Only `avatar-motion`
// and `showdown-card` have any gate of their own. Putting it in the layout covers
// every one of them, and covers the next one somebody adds without their having to
// remember — which is the actual failure mode, since these get written in a hurry.
//
// ⚠⚠ SOME HARNESSES WRITE REAL DATA. The drag-picker harnesses exist precisely
// because dragging inside a real open pool autosaves into it. So this is a data
// gate, not tidiness: a stranger loading one of these could mutate a live pool.
//
// ⭐ The condition lives in `lib/devHarnessGate.ts`, shared with the middleware, so
// the two layers cannot drift. It turns on VERCEL_ENV rather than NODE_ENV — see
// the note there, it is the part that is easy to get backwards.
// =============================================================
export default function DevHarnessLayout({ children }: { children: React.ReactNode }) {
  if (isPublicProduction()) {
    notFound()
  }

  return <>{children}</>
}
