'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

type AppHeaderProps = {
  /** Optional breadcrumb items to display between brand and nav links */
  breadcrumbs?: { label: string; href?: string }[]
  /** Optional badges to display after breadcrumbs (e.g. pool status, role) */
  badges?: React.ReactNode
  /** Whether the current user is a super admin */
  isSuperAdmin?: boolean
}

export function AppHeader({ breadcrumbs, badges, isSuperAdmin }: AppHeaderProps) {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)

  // Close menu on route change
  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  const navLinks = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/profile', label: 'Profile' },
    ...(isSuperAdmin ? [{ href: '/admin/super', label: 'Admin' }] : []),
  ]

  const isActive = (href: string) => {
    if (href === '/dashboard') {
      return pathname === '/dashboard'
    }
    if (href === '/admin/super') {
      return pathname.startsWith('/admin')
    }
    return pathname.startsWith(href)
  }

  return (
    <nav className="sticky top-0 z-10 bg-white shadow-sm">
      <div className="px-4 sm:px-6 py-3 sm:py-4 flex justify-between items-center">
        {/* Left: Brand + breadcrumbs */}
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          <Link href="/dashboard" className="text-lg sm:text-xl font-bold text-neutral-900 shrink-0">
            &#9917; Sport Pool
          </Link>
          {breadcrumbs && breadcrumbs.length > 0 && (
            <div className="flex items-center gap-1 sm:gap-1.5 min-w-0 text-sm">
              {breadcrumbs.map((crumb, idx) => (
                <span key={idx} className="flex items-center gap-1 sm:gap-1.5 min-w-0">
                  <span className="text-neutral-400 shrink-0">/</span>
                  {crumb.href ? (
                    <Link
                      href={crumb.href}
                      className="text-neutral-500 hover:text-neutral-700 truncate transition"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className="text-neutral-700 font-medium truncate">{crumb.label}</span>
                  )}
                </span>
              ))}
              {badges && (
                <span className="flex items-center gap-1.5 shrink-0 ml-1">{badges}</span>
              )}
            </div>
          )}
        </div>

        {/* Right: Desktop nav links (hidden on mobile) */}
        <div className="hidden sm:flex items-center gap-3 sm:gap-4 shrink-0">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-sm font-medium transition ${
                isActive(link.href)
                  ? 'text-primary-600'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              {link.label}
            </Link>
          ))}
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="text-sm text-neutral-600 hover:text-neutral-900 font-medium"
            >
              Sign Out
            </button>
          </form>
        </div>

        {/* Hamburger button (mobile only) */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="sm:hidden p-1.5 -mr-1.5 text-neutral-600 hover:text-neutral-900 transition"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
        >
          {menuOpen ? (
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile dropdown overlay */}
      {menuOpen && (
        <>
          {/* Backdrop */}
          <div
            className="sm:hidden fixed inset-0 bg-black/30 backdrop-blur-sm z-10 animate-[fadeIn_150ms_ease-out]"
            onClick={() => setMenuOpen(false)}
          />
          {/* Menu */}
          <div className="sm:hidden absolute left-3 right-3 mt-2 bg-white rounded-xl shadow-xl border border-neutral-200/60 z-20 overflow-hidden animate-[slideDown_200ms_ease-out]">
            <div className="p-2 flex flex-col gap-0.5">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition ${
                    isActive(link.href)
                      ? 'bg-primary-50 text-primary-600'
                      : 'text-neutral-700 hover:bg-neutral-50'
                  }`}
                >
                  {link.href === '/dashboard' && (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
                    </svg>
                  )}
                  {link.href === '/profile' && (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                    </svg>
                  )}
                  {link.href === '/admin/super' && (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  )}
                  {link.label}
                </Link>
              ))}
            </div>
            <div className="border-t border-neutral-100 p-2">
              <form action="/auth/signout" method="post">
                <button
                  type="submit"
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm text-neutral-700 hover:bg-neutral-50 font-medium transition"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                  </svg>
                  Sign Out
                </button>
              </form>
            </div>
          </div>
        </>
      )}
    </nav>
  )
}
