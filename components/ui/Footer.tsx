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

      {/* Desktop: full footer */}
      <div className="hidden sm:block py-12">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="mb-8">
            <span className="text-white dark:text-neutral-900 text-lg font-bold">&#9917; Sport Pool</span>
            <p className="mt-3 text-sm">
              The ultimate FIFA World Cup 2026 prediction pool platform.
            </p>
          </div>
          <div className={`grid ${isLoggedIn ? 'grid-cols-2' : 'grid-cols-3'} gap-8`}>
            {!isLoggedIn && (
              <div>
                <h4 className="text-white dark:text-neutral-900 font-semibold mb-3">Product</h4>
                <ul className="space-y-2 text-sm">
                  <li>
                    <a href="#features" className="hover:text-white dark:hover:text-neutral-900 transition">
                      Features
                    </a>
                  </li>
                  <li>
                    <Link href="/signup" className="hover:text-white dark:hover:text-neutral-900 transition">
                      Get Started
                    </Link>
                  </li>
                </ul>
              </div>
            )}
            <div>
              <h4 className="text-white dark:text-neutral-900 font-semibold mb-3">Support</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link href="/faq" className="hover:text-white dark:hover:text-neutral-900 transition">
                    FAQ
                  </Link>
                </li>
                <li>
                  <Link href="/contact" className="hover:text-white dark:hover:text-neutral-900 transition">
                    Contact
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-white dark:text-neutral-900 font-semibold mb-3">Legal</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link href="/privacy" className="hover:text-white dark:hover:text-neutral-900 transition">
                    Privacy
                  </Link>
                </li>
                <li>
                  <Link href="/terms" className="hover:text-white dark:hover:text-neutral-900 transition">
                    Terms
                  </Link>
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-10 pt-8 border-t border-neutral-800 dark:border-border-default text-center text-sm">
            &copy; 2026 Sport Pool. All rights reserved.
          </div>
        </div>
      </div>
    </footer>
  )
}
