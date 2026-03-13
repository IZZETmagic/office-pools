'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

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
    <footer className="bg-neutral-900 text-neutral-300 dark:bg-surface dark:text-neutral-500 dark:border-t dark:border-border-default">
      {/* Mobile: minimal copyright only (links are in hamburger menu) */}
      <div className="sm:hidden py-4 text-center text-xs">
        &copy; 2026 Sport Pool. All rights reserved.
      </div>

      {/* Desktop: compact single-row footer */}
      <div className="hidden sm:block py-4">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 flex items-center justify-between gap-6">
          <span className="text-white dark:text-neutral-900 text-sm font-bold shrink-0">&#9917; Sport Pool</span>
          <nav className="flex items-center gap-4 text-xs">
            {!isLoggedIn && (
              <>
                <a href="#features" className="hover:text-white dark:hover:text-neutral-900 transition">Features</a>
                <Link href="/signup" className="hover:text-white dark:hover:text-neutral-900 transition">Get Started</Link>
              </>
            )}
            <Link href="/faq" className="hover:text-white dark:hover:text-neutral-900 transition">FAQ</Link>
            <Link href="/contact" className="hover:text-white dark:hover:text-neutral-900 transition">Contact</Link>
            <Link href="/privacy" className="hover:text-white dark:hover:text-neutral-900 transition">Privacy</Link>
            <Link href="/terms" className="hover:text-white dark:hover:text-neutral-900 transition">Terms</Link>
          </nav>
          <span className="text-xs shrink-0">&copy; 2026 Sport Pool</span>
        </div>
      </div>
    </footer>
  )
}
