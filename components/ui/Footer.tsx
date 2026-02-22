'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function Footer() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      setIsLoggedIn(!!user)
    })
  }, [])

  return (
    <footer className="bg-neutral-900 text-neutral-400 py-8 sm:py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className={`grid grid-cols-2 ${isLoggedIn ? 'sm:grid-cols-3' : 'sm:grid-cols-4'} gap-6 sm:gap-8`}>
          <div className="col-span-2 sm:col-span-1">
            <span className="text-white text-lg font-bold">&#9917; Sport Pool</span>
            <p className="mt-2 sm:mt-3 text-sm">
              The ultimate FIFA World Cup 2026 prediction pool platform.
            </p>
          </div>
          {!isLoggedIn && (
            <div>
              <h4 className="text-white font-semibold mb-2 sm:mb-3">Product</h4>
              <ul className="space-y-1.5 sm:space-y-2 text-sm">
                <li>
                  <a href="#features" className="hover:text-white transition">
                    Features
                  </a>
                </li>
                <li>
                  <Link href="/signup" className="hover:text-white transition">
                    Get Started
                  </Link>
                </li>
              </ul>
            </div>
          )}
          <div>
            <h4 className="text-white font-semibold mb-2 sm:mb-3">Support</h4>
            <ul className="space-y-1.5 sm:space-y-2 text-sm">
              <li>
                <a href="#faq" className="hover:text-white transition">
                  FAQ
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-white transition">
                  Contact
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="text-white font-semibold mb-2 sm:mb-3">Legal</h4>
            <ul className="space-y-1.5 sm:space-y-2 text-sm">
              <li>
                <a href="#" className="hover:text-white transition">
                  Privacy
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-white transition">
                  Terms
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-6 sm:mt-10 pt-6 sm:pt-8 border-t border-neutral-800 text-center text-sm">
          &copy; 2026 Sport Pool. All rights reserved.
        </div>
      </div>
    </footer>
  )
}
