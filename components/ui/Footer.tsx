'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Wordmark } from './Wordmark'

const HIDDEN_ROUTES = ['/login', '/signup']

/**
 * The signed-in check went with the Features and Get Started links — they were
 * the only thing it gated. It was costing a supabase.auth.getUser() round trip
 * on every page in the app to decide whether to show two links, one of which
 * pointed at a section that no longer exists.
 */
export default function Footer() {
  const pathname = usePathname()

  if (HIDDEN_ROUTES.includes(pathname)) return null

  return (
    <footer className="bg-midnight text-white/70 dark:bg-surface dark:text-muted dark:border-t dark:border-border-default">
      {/* Mobile: minimal copyright only (links are in hamburger menu) */}
      <div className="sm:hidden py-4 text-center text-xs">
        &copy; 2026 SportPool. All rights reserved.
      </div>

      {/* Desktop: compact single-row footer */}
      <div className="hidden sm:block py-4">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 flex items-center justify-between gap-6">
          {/* The footer bar is a solid dark slab (inverted in dark mode), so the
              wordmark goes mono and inherits the bar's colour — the brand blue
              would not read against it. */}
          <span className="flex items-center gap-1.5 text-white dark:text-ink shrink-0">
            <Wordmark size={14} mono />
          </span>
          {/* Features and Get Started used to sit here for signed-out visitors.
              Both went when the landing page was rebuilt: "#features" pointed at
              a section that no longer exists, and "Get Started" was a third link
              to /signup on a page that already has it in the nav and twice in
              the body. What is left is the reference material a footer is for. */}
          <nav className="flex items-center gap-4 text-xs">
            <Link href="/pricing" className="hover:text-white dark:hover:text-ink transition">Pricing</Link>
            <Link href="/faq" className="hover:text-white dark:hover:text-ink transition">FAQ</Link>
            <Link href="/contact" className="hover:text-white dark:hover:text-ink transition">Contact</Link>
            <Link href="/privacy" className="hover:text-white dark:hover:text-ink transition">Privacy</Link>
            <Link href="/terms" className="hover:text-white dark:hover:text-ink transition">Terms</Link>
            <Link href="/refund-policy" className="hover:text-white dark:hover:text-ink transition">Refunds</Link>
          </nav>
          <span className="text-xs shrink-0">&copy; 2026 SportPool</span>
        </div>
      </div>
    </footer>
  )
}
