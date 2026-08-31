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
  /**
   * Render over a dark surface instead of on `bg-surface`.
   *
   * ⚠ STYLING ONLY. The links, the menu, the theme toggle and the sign-out are
   * untouched — this is the app's primary navigation and it means the same
   * thing on every page. What changes is that it sits ON something (the
   * Showdown band) rather than in a bar above it, so it drops its background,
   * its shadow and its border and lets the surface behind show through.
   */
  overlay?: boolean
}

export function AppHeader({ breadcrumbs, badges, isSuperAdmin, sticky = true, overlay = false }: AppHeaderProps) {
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
    <nav className={`${sticky ? 'sticky top-0 shadow-sm dark:shadow-none dark:border-b dark:border-border-default' : ''} z-50 ${
      overlay ? 'bg-transparent' : 'bg-surface'}`}>
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
                  <span className="text-muted shrink-0">/</span>
                  {crumb.href ? (
                    <Link
                      href={crumb.href}
                      className="text-muted hover:text-ink truncate transition"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className="t-body font-semibold text-ink truncate">{crumb.label}</span>
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
                  : 'text-muted hover:text-ink'
              }`}
            >
              {link.label}
            </Link>
          ))}
          <button
            onClick={cycleColorMode}
            className="p-2 rounded-control text-muted hover:text-ink hover:bg-mist transition"
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
              className="t-body font-semibold text-muted hover:text-ink"
            >
              Sign Out
            </button>
          </form>
        </div>

        {/* Hamburger button (mobile only) */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="sm:hidden p-1.5 -mr-1.5 rounded-control text-muted hover:text-ink hover:bg-mist transition"
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
      <div className="sm:hidden fixed left-3 right-3 top-[60px] bg-surface rounded-card shadow-card-elevated dark:shadow-none border border-border-default z-[9999] overflow-hidden animate-[slideDown_200ms_ease-out]">
        <div className="p-2 flex flex-col gap-0.5">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className={`flex items-center gap-3 px-3 py-3 rounded-control t-body font-semibold transition ${
                isActive(link.href)
                  ? 'bg-primary-600/12 text-primary-800'
                  : 'text-ink hover:bg-mist'
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
        <div className="border-t border-border-subtle p-2 flex flex-col gap-0.5">
          <button
            onClick={cycleColorMode}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-control t-body font-semibold text-ink hover:bg-mist transition"
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
              className="w-full flex items-center gap-3 px-3 py-3 rounded-control t-body font-semibold text-ink hover:bg-mist transition"
            >
              <Icon name="doc.on.doc" size={20} />
              Sign Out
            </button>
          </form>
        </div>
        <div className="border-t border-border-subtle px-5 py-2.5 flex items-center gap-2">
          <Link href="/pricing" onClick={() => setMenuOpen(false)} className="t-detail text-muted hover:text-ink transition">Pricing</Link>
          <span className="text-muted">&middot;</span>
          <Link href="/faq" onClick={() => setMenuOpen(false)} className="t-detail text-muted hover:text-ink transition">FAQ</Link>
          <span className="text-muted">&middot;</span>
          <Link href="/contact" onClick={() => setMenuOpen(false)} className="t-detail text-muted hover:text-ink transition">Contact</Link>
          <span className="text-muted">&middot;</span>
          <Link href="/privacy" onClick={() => setMenuOpen(false)} className="t-detail text-muted hover:text-ink transition">Privacy</Link>
          <span className="text-muted">&middot;</span>
          <Link href="/terms" onClick={() => setMenuOpen(false)} className="t-detail text-muted hover:text-ink transition">Terms</Link>
          <span className="text-muted">&middot;</span>
          <Link href="/refund-policy" onClick={() => setMenuOpen(false)} className="t-detail text-muted hover:text-ink transition">Refunds</Link>
        </div>
      </div>
    </>,
    document.body
  )}
    </>
  )
}
