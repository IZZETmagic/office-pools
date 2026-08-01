'use client'

import { useState, useEffect } from 'react'
import { Icon } from '@/components/ui/Icon'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTheme } from '@/components/ThemeProvider'
import { Wordmark } from './Wordmark'

type ColorMode = 'light' | 'dark' | 'system'

type AppHeaderProps = {
  /** Optional breadcrumb items to display between brand and nav links */
  breadcrumbs?: { label: string; href?: string }[]
  /** Optional badges to display after breadcrumbs (e.g. pool status, role) */
  badges?: React.ReactNode
  /** Whether the current user is a super admin */
  isSuperAdmin?: boolean
  /** Whether the header should be sticky (default: true) */
  sticky?: boolean
}

export function AppHeader({ breadcrumbs, badges, isSuperAdmin, sticky = true }: AppHeaderProps) {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const { colorMode, setColorMode } = useTheme()

  const cycleColorMode = () => {
    const next: Record<ColorMode, ColorMode> = {
      system: 'light',
      light: 'dark',
      dark: 'system',
    }
    setColorMode(next[colorMode])
  }

  // Close menu on route change
  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  const navLinks = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/pools', label: 'Pools' },
    { href: '/profile', label: 'Profile' },
    ...(isSuperAdmin ? [{ href: '/admin/super', label: 'Admin' }] : []),
  ]

  const isActive = (href: string) => {
    if (href === '/dashboard') {
      return pathname === '/dashboard'
    }
    if (href === '/pools') {
      return pathname === '/pools'
    }
    if (href === '/admin/super') {
      return pathname.startsWith('/admin')
    }
    return pathname.startsWith(href)
  }

  return (
    <>
    <nav className={`${sticky ? 'sticky top-0 shadow-sm dark:shadow-none dark:border-b dark:border-border-default' : ''} z-50 bg-surface`}>
      <div className="px-4 sm:px-6 py-3 sm:py-4 flex justify-between items-center">
        {/* Left: Brand + breadcrumbs */}
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          <Link href="/dashboard" className="shrink-0" aria-label="SportPool home">
            {/* Sized down a little on mobile so it does not crowd the breadcrumbs
                that sit immediately to its right. */}
            <Wordmark size={26} className="hidden sm:inline" />
            <Wordmark size={22} className="sm:hidden" />
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
          <button
            onClick={cycleColorMode}
            className="p-2 rounded-xl text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 transition"
            aria-label={`Color mode: ${colorMode}`}
            title={`Theme: ${colorMode}`}
          >
            {colorMode === 'light' && (
              <Icon name="sun.max" size={16} />
            )}
            {colorMode === 'dark' && (
              <Icon name="moon" size={16} />
            )}
            {colorMode === 'system' && (
              <Icon name="desktopcomputer" size={16} />
            )}
          </button>
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
          className="sm:hidden p-1.5 -mr-1.5 rounded-xl text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:text-white dark:hover:bg-neutral-700 transition"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
        >
          {menuOpen ? (
            <Icon name="xmark" size={24} />
          ) : (
            <Icon name="line.3.horizontal" size={24} />
          )}
        </button>
      </div>

    </nav>
    {menuOpen && createPortal(
    <>
      {/* Backdrop */}
      <div
        className="sm:hidden fixed inset-0 bg-black/40 backdrop-blur-sm z-[9998] animate-[fadeIn_150ms_ease-out]"
        onClick={() => setMenuOpen(false)}
      />
      {/* Menu */}
      <div className="sm:hidden fixed left-3 right-3 top-[60px] bg-surface rounded-2xl shadow-xl dark:shadow-none border border-neutral-200/60 z-[9999] overflow-hidden animate-[slideDown_200ms_ease-out]">
        <div className="p-2 flex flex-col gap-0.5">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className={`flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition ${
                isActive(link.href)
                  ? 'bg-primary-50 text-primary-600 dark:bg-primary-600/15 dark:text-primary-800'
                  : 'text-neutral-700 hover:bg-neutral-50 dark:text-neutral-500 dark:hover:text-neutral-100 dark:hover:bg-neutral-700'
              }`}
            >
              {link.href === '/dashboard' && (
                <Icon name="house.fill" size={20} />
              )}
              {link.href === '/pools' && (
                <Icon name="square.grid.2x2" size={20} />
              )}
              {link.href === '/profile' && (
                <Icon name="person.crop.circle" size={20} />
              )}
              {link.href === '/admin/super' && (
                <Icon name="gear" size={20} />
              )}
              {link.label}
            </Link>
          ))}
        </div>
        <div className="border-t border-neutral-100 p-2 flex flex-col gap-0.5">
          <button
            onClick={cycleColorMode}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm text-neutral-700 hover:bg-neutral-50 dark:text-neutral-500 dark:hover:text-neutral-100 dark:hover:bg-neutral-700 font-medium transition"
          >
            {colorMode === 'light' && (
              <Icon name="sun.max" size={20} />
            )}
            {colorMode === 'dark' && (
              <Icon name="moon" size={20} />
            )}
            {colorMode === 'system' && (
              <Icon name="desktopcomputer" size={20} />
            )}
            {colorMode === 'light' ? 'Light Mode' : colorMode === 'dark' ? 'Dark Mode' : 'System Mode'}
          </button>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm text-neutral-700 hover:bg-neutral-50 dark:text-neutral-500 dark:hover:text-neutral-100 dark:hover:bg-neutral-700 font-medium transition"
            >
              <Icon name="doc.on.doc" size={20} />
              Sign Out
            </button>
          </form>
        </div>
        <div className="border-t border-neutral-100 px-5 py-2.5 flex items-center gap-2">
          <Link href="/faq" onClick={() => setMenuOpen(false)} className="text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition">FAQ</Link>
          <span className="text-neutral-300 dark:text-neutral-600">&middot;</span>
          <Link href="/contact" onClick={() => setMenuOpen(false)} className="text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition">Contact</Link>
          <span className="text-neutral-300 dark:text-neutral-600">&middot;</span>
          <Link href="/privacy" onClick={() => setMenuOpen(false)} className="text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition">Privacy</Link>
          <span className="text-neutral-300 dark:text-neutral-600">&middot;</span>
          <Link href="/terms" onClick={() => setMenuOpen(false)} className="text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition">Terms</Link>
        </div>
      </div>
    </>,
    document.body
  )}
    </>
  )
}
