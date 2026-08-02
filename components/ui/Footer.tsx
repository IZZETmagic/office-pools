'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Wordmark } from './Wordmark'

const HIDDEN_ROUTES = ['/login', '/signup']

export default function Footer() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      setIsLoggedIn(!!user)
    })
  }, [])

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
          <nav className="flex items-center gap-4 text-xs">
            {!isLoggedIn && (
              <>
                <a href="#features" className="hover:text-white dark:hover:text-ink transition">Features</a>
                <Link href="/signup" className="hover:text-white dark:hover:text-ink transition">Get Started</Link>
              </>
            )}
            <Link href="/faq" className="hover:text-white dark:hover:text-ink transition">FAQ</Link>
            <Link href="/contact" className="hover:text-white dark:hover:text-ink transition">Contact</Link>
            <Link href="/privacy" className="hover:text-white dark:hover:text-ink transition">Privacy</Link>
            <Link href="/terms" className="hover:text-white dark:hover:text-ink transition">Terms</Link>
          </nav>
          <span className="text-xs shrink-0">&copy; 2026 SportPool</span>
        </div>
      </div>
    </footer>
  )
}
